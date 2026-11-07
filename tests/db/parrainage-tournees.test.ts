import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, en, codeErreur, type BaseDeTest } from "./outils";
import {
  creerArticle,
  creerClient,
  creerSecteur,
  enregistrerCommande,
  fidelite,
  recompense,
  type Ligne,
  type RecompenseDemandee,
} from "./fabrique";

let base: BaseDeTest;
let admin: string;
let livreur: string;
let sansProfil: string;
let secteur: string;
let p30: string;
let oeufs: string;
let confiture: string;
let recOeufs: string;
let recConfiture: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  livreur = await creerCompte(base.client, "livreur");
  sansProfil = await creerCompte(base.client, null);
  secteur = await creerSecteur(base.client);
  p30 = await creerArticle(base.client, { categorie: "panier", prix: 3000, tampons: 1 });
  oeufs = await creerArticle(base.client, { categorie: "supplement", prix: 300 });
  confiture = await creerArticle(base.client, { categorie: "supplement", prix: 800 });
  recOeufs = await recompense(base.client, "Œufs offerts au filleul");
  recConfiture = await recompense(base.client, "Confiture offerte au parrain");
  // Offre ouverte depuis le 1er novembre 2026 pour ces tests
  await base.client.query("update public.parametres_fidelite set parrainage_cadeaux_debut = '2026-11-01'");
});

afterAll(async () => {
  await base?.detruire();
});

const commeAdmin = <T>(fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId: admin }, fn);

const samedi = (n: number) => new Date(Date.UTC(2026, 10, 7 + 7 * n)).toISOString().slice(0, 10);

const commander = (
  clientId: string,
  semaine: number,
  recompenses: RecompenseDemandee[] = [],
  lignes: Ligne[] = [{ article_id: p30, quantite: 1 }],
) => commeAdmin((c) => enregistrerCommande(c, { clientId, date: samedi(semaine), lignes, recompenses }));

const statut = (commandeId: string, s: string) =>
  commeAdmin((c) => c.query("select public.changer_statut_commande($1, $2)", [commandeId, s]));

const oeufsOfferts: RecompenseDemandee = { recompense_id: "", articles: [] };
const demandeOeufs = (): RecompenseDemandee => ({ ...oeufsOfferts, recompense_id: recOeufs, articles: [{ article_id: oeufs, quantite: 1 }] });
const demandeConfiture = (): RecompenseDemandee => ({
  recompense_id: recConfiture,
  articles: [{ article_id: confiture, quantite: 1 }],
});

async function confituresDues(clientId: string): Promise<number> {
  const { rows } = await base.client.query<{ n: number }>(
    "select count(*)::int as n from public.confitures_parrain_dues where client_id = $1",
    [clientId],
  );
  return rows[0].n;
}

describe("œufs offerts au filleul", () => {
  it("offerts sur la première commande d'un filleul, sans coûter de tampons", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    await commander(filleul, 0, [demandeOeufs()]);
    expect((await fidelite(base.client, filleul)).solde).toBe(1);
  });

  it("refusés pour un client sans parrain", async () => {
    const seul = await creerClient(base.client, secteur);
    await expect(commander(seul, 0, [demandeOeufs()])).rejects.toSatisfy((e) => codeErreur(e) === "PN025");
  });

  it("refusés sur la deuxième commande, et jamais deux fois", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    await commander(filleul, 0, [demandeOeufs()]);
    await expect(commander(filleul, 1, [demandeOeufs()])).rejects.toSatisfy((e) => codeErreur(e) === "PN025");

    const autre = await creerClient(base.client, secteur, { parrainId: parrain });
    await commander(autre, 0);
    await expect(commander(autre, 1, [demandeOeufs()])).rejects.toSatisfy((e) => codeErreur(e) === "PN025");
  });

  it("si la première commande est annulée, la suivante y a droit", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    const premiere = await commander(filleul, 0, [demandeOeufs()]);
    await statut(premiere, "annulee");
    await commander(filleul, 1, [demandeOeufs()]);
  });

  it("pas avant le début de l'offre", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    await expect(commander(filleul, -2, [demandeOeufs()])).rejects.toSatisfy((e) => codeErreur(e) === "PN025");
  });
});

describe("confiture offerte au parrain", () => {
  it("due dès la première commande du filleul, une par filleul, offerte une seule fois", async () => {
    const parrain = await creerClient(base.client, secteur);
    const f1 = await creerClient(base.client, secteur, { parrainId: parrain });
    const f2 = await creerClient(base.client, secteur, { parrainId: parrain });
    expect(await confituresDues(parrain)).toBe(0);

    await commander(f1, 0);
    await commander(f2, 0);
    expect(await confituresDues(parrain)).toBe(2);

    // Une confiture remise lors d'une livraison du parrain
    await commander(parrain, 0, [demandeConfiture()]);
    expect(await confituresDues(parrain)).toBe(1);
    expect((await fidelite(base.client, parrain)).solde).toBe(3); // 1 + 2 parrainages, rien de dépensé

    // La seconde la semaine suivante, puis plus rien
    await commander(parrain, 1, [demandeConfiture()]);
    expect(await confituresDues(parrain)).toBe(0);
    await expect(commander(parrain, 2, [demandeConfiture()])).rejects.toSatisfy((e) => codeErreur(e) === "PN026");
  });

  it("refusée tant qu'aucun filleul n'a commandé", async () => {
    const parrain = await creerClient(base.client, secteur);
    await creerClient(base.client, secteur, { parrainId: parrain });
    await expect(commander(parrain, 0, [demandeConfiture()])).rejects.toSatisfy((e) => codeErreur(e) === "PN026");
  });

  it("si la commande du parrain est annulée, la confiture redevient due", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    await commander(filleul, 0);
    const cmd = await commander(parrain, 0, [demandeConfiture()]);
    expect(await confituresDues(parrain)).toBe(0);
    await statut(cmd, "annulee");
    expect(await confituresDues(parrain)).toBe(1);
  });

  it("filleul déjà client avant le début de l'offre : pas de confiture", async () => {
    const parrain = await creerClient(base.client, secteur);
    const ancien = await creerClient(base.client, secteur, { parrainId: parrain });
    await commander(ancien, -2); // 24 octobre, avant l'offre
    await commander(ancien, 0);
    expect(await confituresDues(parrain)).toBe(0);
  });
});

describe("tournées", () => {
  async function commandeDuJour(semaine: number) {
    const id = await creerClient(base.client, secteur);
    return { client: id, commande: await commander(id, semaine) };
  }

  it("enregistre l'ordre de passage (admin et livreur), refusé sans profil", async () => {
    const a = await commandeDuJour(5);
    const b = await commandeDuJour(5);
    const c = await commandeDuJour(5);
    const ordre = [c.commande, a.commande, b.commande];

    await en(base.client, { role: "authenticated", userId: livreur }, (cx) =>
      cx.query("select public.enregistrer_ordre_tournee($1::uuid[])", [ordre]),
    );
    const { rows } = await base.client.query<{ id: string }>(
      "select id from public.commandes where id = any($1::uuid[]) order by ordre_tournee",
      [ordre],
    );
    expect(rows.map((r) => r.id)).toEqual(ordre);

    await expect(
      en(base.client, { role: "authenticated", userId: sansProfil }, (cx) =>
        cx.query("select public.enregistrer_ordre_tournee($1::uuid[])", [ordre]),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });

  it("un livreur marque « livrée » : tampons posés, puis « pas livrée » : retirés", async () => {
    const { client, commande } = await commandeDuJour(6);
    const commeLivreur = (livree: boolean) =>
      en(base.client, { role: "authenticated", userId: livreur }, (cx) =>
        cx.query("select public.marquer_livraison($1, $2)", [commande, livree]),
      );
    await commeLivreur(true);
    await commeLivreur(true);
    expect((await fidelite(base.client, client)).solde).toBe(2);
    await commeLivreur(false);
    expect((await fidelite(base.client, client)).solde).toBe(1);
  });

  it("garde l'heure de l'appui fait hors connexion, jamais une heure future", async () => {
    const passe = await commandeDuJour(7);
    await commeAdmin((cx) =>
      cx.query("select public.marquer_livraison($1, true, $2)", [passe.commande, "2026-11-07T10:15:00Z"]),
    );
    const futur = await commandeDuJour(7);
    await commeAdmin((cx) =>
      cx.query("select public.marquer_livraison($1, true, now() + interval '2 days')", [futur.commande]),
    );
    const { rows } = await base.client.query<{ id: string; livree_le: Date; futur: boolean }>(
      "select id, livree_le, livree_le > now() as futur from public.commandes where id = any($1::uuid[])",
      [[passe.commande, futur.commande]],
    );
    expect(rows.find((r) => r.id === passe.commande)!.livree_le.toISOString()).toBe("2026-11-07T10:15:00.000Z");
    expect(rows.find((r) => r.id === futur.commande)!.futur).toBe(false);
  });

  it("refuse de livrer une commande annulée, et un compte sans profil", async () => {
    const { commande } = await commandeDuJour(8);
    await statut(commande, "annulee");
    await expect(
      commeAdmin((cx) => cx.query("select public.marquer_livraison($1, true)", [commande])),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN027");
    await expect(
      en(base.client, { role: "authenticated", userId: sansProfil }, (cx) =>
        cx.query("select public.marquer_livraison($1, true)", [commande]),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });
});
