import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, creerCompteEnLigne, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

let base: BaseDeTest;
let admin: string;
let livreur: string;
let secteur: string;
let p30: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  livreur = await creerCompte(base.client, "livreur");
  secteur = await creerSecteur(base.client);
  p30 = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
});

afterAll(async () => {
  await base?.detruire();
});

const comme = <T>(userId: string, fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId }, fn);

async function commande(client: string, date: string) {
  return comme(admin, (c) => enregistrerCommande(c, { clientId: client, date, lignes: [{ article_id: p30, quantite: 1 }] }));
}

const livrer = (id: string, payee: boolean, qui = livreur) =>
  comme(qui, (c) => c.query("select public.marquer_livraison($1, true, null, $2)", [id, payee]));
const annuler = (id: string) => comme(livreur, (c) => c.query("select public.marquer_livraison($1, false)", [id]));

async function solde(client: string): Promise<number> {
  const { rows } = await base.client.query("select solde_centimes from public.soldes_clients where client_id = $1", [client]);
  return rows[0]?.solde_centimes ?? 0;
}

const livrerAvecMontant = (id: string, montant: number, mode: string | null) =>
  comme(livreur, (c) => c.query("select public.marquer_livraison($1, true, null, true, $2, $3)", [id, montant, mode]));

describe("montant reçu à la livraison (espèces ou chèque)", () => {
  it("moins que dû : le reste va au compte ; plus : un avoir ; le mode est noté", async () => {
    const client = await creerClient(base.client, secteur);
    const a = await commande(client, "2026-11-14");
    const b = await commande(client, "2026-11-21");

    await livrerAvecMontant(a, 2000, "especes");
    expect(await solde(client)).toBe(1000);
    const { rows } = await base.client.query(
      "select montant_centimes, mode_paiement from public.mouvements_compte where commande_id = $1 and motif = 'paiement'",
      [a],
    );
    expect(rows).toEqual([{ montant_centimes: -2000, mode_paiement: "especes" }]);

    // Semaine suivante : 30 € + 10 € dus = 40 € ; il donne un chèque de 50 € → avoir de 10 €
    await livrerAvecMontant(b, 5000, "cheque");
    expect(await solde(client)).toBe(-1000);
    const co = await base.client.query("select montant_recu_centimes, mode_paiement from public.commandes where id = $1", [b]);
    expect(co.rows[0]).toEqual({ montant_recu_centimes: 5000, mode_paiement: "cheque" });

    // Nouvel appui corrigé (40 €) : le compte est recalculé
    await livrerAvecMontant(b, 4000, "cheque");
    expect(await solde(client)).toBe(0);
    // Annulé : plus de montant ni de mode
    await annuler(b);
    const vide = await base.client.query("select montant_recu_centimes, mode_paiement from public.commandes where id = $1", [b]);
    expect(vide.rows[0]).toEqual({ montant_recu_centimes: null, mode_paiement: null });
  });

  it("exige espèces ou chèque dès qu'un montant est reçu", async () => {
    const client = await creerClient(base.client, secteur);
    const a = await commande(client, "2026-11-14");
    await expect(livrerAvecMontant(a, 3000, null)).rejects.toMatchObject({ code: "PN054" });
    await expect(livrerAvecMontant(a, 3000, "carte")).rejects.toMatchObject({ code: "PN054" });
    // 0 € reçu : livré, tout reste dû
    await livrerAvecMontant(a, 0, null);
    expect(await solde(client)).toBe(3000);
  });
});

describe("paiement à la livraison", () => {
  it("livré non payé : le panier s'ajoute au compte ; payé la fois suivante : tout est réglé", async () => {
    const client = await creerClient(base.client, secteur);
    const a = await commande(client, "2026-11-14");
    const b = await commande(client, "2026-11-21");

    await livrer(a, false);
    expect(await solde(client)).toBe(3000);
    const { rows } = await base.client.query("select payee from public.commandes where id = $1", [a]);
    expect(rows[0].payee).toBe(false);

    await livrer(b, true);
    expect(await solde(client)).toBe(0);
    const paiement = await base.client.query(
      "select montant_centimes from public.mouvements_compte where commande_id = $1 and motif = 'paiement'",
      [b],
    );
    expect(paiement.rows[0].montant_centimes).toBe(-6000);
  });

  it("annuler la livraison remet le compte comme avant ; deux appuis ne comptent qu'une fois", async () => {
    const client = await creerClient(base.client, secteur);
    const a = await commande(client, "2026-11-14");
    await livrer(a, false);
    await livrer(a, false);
    expect(await solde(client)).toBe(3000);
    await annuler(a);
    expect(await solde(client)).toBe(0);
    const { rows } = await base.client.query("select payee, statut from public.commandes where id = $1", [a]);
    expect(rows[0]).toEqual({ payee: null, statut: "a_livrer" });
  });

  it("un avoir est déduit, et « Marquer comme livrée » sans précision vaut payé", async () => {
    const client = await creerClient(base.client, secteur);
    await comme(admin, (c) =>
      c.query(
        "insert into public.mouvements_compte (client_id, montant_centimes, motif, note) values ($1, -500, 'ajustement', 'Avoir')",
        [client],
      ),
    );
    const a = await commande(client, "2026-11-14");
    await comme(admin, (c) => c.query("select public.changer_statut_commande($1, 'livree')", [a]));
    expect(await solde(client)).toBe(0);
    const paiement = await base.client.query(
      "select montant_centimes from public.mouvements_compte where commande_id = $1 and motif = 'paiement'",
      [a],
    );
    expect(paiement.rows[0].montant_centimes).toBe(-2500);
  });

  it("droits : le livreur ne note pas de paiement à la main ; le client ne voit que son compte", async () => {
    const client = await creerClient(base.client, secteur);
    const autre = await creerClient(base.client, secteur);
    await livrer(await commande(client, "2026-11-14"), false);
    await livrer(await commande(autre, "2026-11-14"), false);

    await expect(
      comme(livreur, (c) =>
        c.query("insert into public.mouvements_compte (client_id, montant_centimes, motif) values ($1, -3000, 'paiement')", [
          client,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    // L'administrateur ne peut pas effacer un mouvement de livraison
    await comme(admin, (c) => c.query("delete from public.mouvements_compte where client_id = $1", [client]));
    expect(await solde(client)).toBe(3000);

    const compte = await creerCompteEnLigne(base.client, `${client}@test.local`);
    await base.client.query("insert into public.comptes_clients (user_id, client_id) values ($1, $2)", [compte, client]);
    const vus = await comme(compte, async (c) => (await c.query("select client_id, solde_centimes from public.soldes_clients")).rows);
    expect(vus).toEqual([{ client_id: client, solde_centimes: 3000 }]);
    await expect(en(base.client, { role: "anon" }, (c) => c.query("select * from public.soldes_clients"))).rejects.toThrow(
      /permission/,
    );
  });
});
