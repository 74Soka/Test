import type { ClientBase } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codeErreur, creerBaseDeTest, creerCompte, creerCompteEnLigne, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

/** Notifications de livraison : clés, abonnements, tournées démarrées, envois uniques. */

let base: BaseDeTest;
let admin: string;
let livreur: string;
let secteur: string;
let alice: string;
let compteAlice: string;
let bob: string;
let compteBob: string;
let p30: string;

const comme = <T>(userId: string, fn: (c: ClientBase) => Promise<T>) =>
  en(base.client, { role: "authenticated", userId }, fn);

async function erreur(promesse: Promise<unknown>): Promise<string | undefined> {
  try {
    await promesse;
  } catch (e) {
    return codeErreur(e);
  }
  return "aucune erreur";
}

const abonner = (userId: string, endpoint: string) =>
  comme(userId, (c) =>
    c.query("select public.enregistrer_abonnement_push($1, $2, $3, $4)", [
      endpoint,
      "B".repeat(87),
      "A".repeat(22),
      "iPhone",
    ]),
  );

beforeAll(async () => {
  base = await creerBaseDeTest();
  const c = base.client;
  admin = await creerCompte(c, "admin");
  livreur = await creerCompte(c, "livreur");
  secteur = await creerSecteur(c);
  p30 = await creerArticle(c, { categorie: "panier", prix: 3000 });
  alice = await creerClient(c, secteur);
  await c.query("update public.clients set email = 'alice@exemple.fr' where id = $1", [alice]);
  compteAlice = await creerCompteEnLigne(c, "alice@exemple.fr");
  bob = await creerClient(c, secteur);
  await c.query("update public.clients set email = 'bob@exemple.fr' where id = $1", [bob]);
  compteBob = await creerCompteEnLigne(c, "bob@exemple.fr");
  for (const compte of [compteAlice, compteBob]) {
    await comme(compte, (x) => x.query("select public.ma_situation()"));
  }
});

afterAll(async () => {
  await base?.detruire();
});

describe("clés de signature", () => {
  it("créées une seule fois par l'équipe ; la clé privée reste à l'équipe", async () => {
    const publique = async (userId: string) =>
      (await comme(userId, (c) => c.query("select public.cle_publique_push() as k"))).rows[0].k;
    expect(await publique(compteAlice)).toBeNull();

    expect(
      await erreur(comme(compteAlice, (c) => c.query("select public.enregistrer_cles_push($1, $2)", ["P".repeat(87), "S".repeat(43)]))),
    ).toBe("42501");
    await comme(livreur, (c) => c.query("select public.enregistrer_cles_push($1, $2)", ["P".repeat(87), "S".repeat(43)]));
    await comme(admin, (c) => c.query("select public.enregistrer_cles_push($1, $2)", ["Q".repeat(87), "T".repeat(43)]));

    expect(await publique(compteAlice)).toBe("P".repeat(87));
    const cles = (await comme(admin, (c) => c.query("select public.cles_push() as k"))).rows[0].k;
    expect(cles).toEqual({ publique: "P".repeat(87), privee: "S".repeat(43) });

    expect(await erreur(comme(compteAlice, (c) => c.query("select public.cles_push()")))).toBe("42501");
    expect(await erreur(comme(compteAlice, (c) => c.query("select * from prive.cles_push")))).toBe("42501");
    expect(await erreur(en(base.client, { role: "anon" }, (c) => c.query("select public.cle_publique_push()")))).toBe("42501");
  });
});

describe("abonnements des téléphones", () => {
  it("chacun abonne son téléphone et ne voit que les siens ; l'équipe retrouve ceux d'un client", async () => {
    await abonner(compteAlice, "https://push.exemple/alice-1");
    await abonner(compteAlice, "https://push.exemple/alice-2");
    await abonner(compteBob, "https://push.exemple/bob-1");

    const lus = await comme(compteAlice, async (c) => (await c.query("select endpoint from public.abonnements_push order by endpoint")).rows);
    expect(lus).toEqual([{ endpoint: "https://push.exemple/alice-1" }, { endpoint: "https://push.exemple/alice-2" }]);

    const duClient = await comme(livreur, async (c) =>
      (await c.query("select endpoint from public.abonnements_du_client($1) order by endpoint", [alice])).rows,
    );
    expect(duClient.map((r) => r.endpoint)).toEqual(["https://push.exemple/alice-1", "https://push.exemple/alice-2"]);
    expect(await erreur(comme(compteBob, (c) => c.query("select * from public.abonnements_du_client($1)", [alice])))).toBe(
      "42501",
    );
    expect(
      await erreur(
        comme(compteBob, (c) =>
          c.query("insert into public.abonnements_push (user_id, endpoint, p256dh, auth) values ($1, 'https://x', $2, $3)", [
            compteBob,
            "B".repeat(87),
            "A".repeat(22),
          ]),
        ),
      ),
    ).toBe("42501");
  });

  it("un téléphone passé à un autre compte change de propriétaire ; on se désabonne", async () => {
    await abonner(compteBob, "https://push.exemple/alice-2");
    const deBob = await comme(livreur, async (c) =>
      (await c.query("select endpoint from public.abonnements_du_client($1) order by endpoint", [bob])).rows,
    );
    expect(deBob.map((r) => r.endpoint)).toEqual(["https://push.exemple/alice-2", "https://push.exemple/bob-1"]);

    // Bob ne peut pas supprimer l'abonnement d'Alice ; Alice supprime le sien
    await comme(compteBob, (c) => c.query("select public.supprimer_abonnement_push($1)", ["https://push.exemple/alice-1"]));
    expect(await base.client.query("select 1 from public.abonnements_push where endpoint = $1", ["https://push.exemple/alice-1"])).toMatchObject({ rowCount: 1 });
    await comme(compteAlice, (c) => c.query("select public.supprimer_abonnement_push($1)", ["https://push.exemple/alice-1"]));
    expect(await base.client.query("select 1 from public.abonnements_push where endpoint = $1", ["https://push.exemple/alice-1"])).toMatchObject({ rowCount: 0 });

    // L'équipe retire un abonnement expiré
    await comme(livreur, (c) => c.query("select public.supprimer_abonnement_push($1)", ["https://push.exemple/bob-1"]));
    expect(await base.client.query("select 1 from public.abonnements_push where endpoint = $1", ["https://push.exemple/bob-1"])).toMatchObject({ rowCount: 0 });
  });

  it("un compte supprimé emporte ses abonnements", async () => {
    await abonner(compteBob, "https://push.exemple/bob-2");
    await comme(compteBob, (c) => c.query("select public.supprimer_mon_compte()"));
    expect(await base.client.query("select 1 from public.abonnements_push where user_id = $1", [compteBob])).toMatchObject({ rowCount: 0 });
  });
});

describe("tournée démarrée et messages envoyés une seule fois", () => {
  it("démarre une fois par jour et par secteur", async () => {
    const demarrer = (userId: string) =>
      comme(userId, async (c) => (await c.query("select public.demarrer_tournee('2026-11-14', $1) as r", [secteur])).rows[0].r);
    const premier = await demarrer(livreur);
    expect(premier.nouvelle).toBe(true);
    const second = await demarrer(admin);
    expect(second).toEqual({ ...premier, nouvelle: false });
    expect(await erreur(demarrer(compteAlice))).toBe("42501");
    const lues = await comme(compteAlice, async (c) => (await c.query("select 1 from public.tournees")).rows);
    expect(lues).toEqual([]);
  });

  it("chaque message ne part qu'une fois par commande", async () => {
    const id = await enregistrerCommande(base.client, { clientId: alice, date: "2026-11-14", lignes: [{ article_id: p30, quantite: 1 }] });
    const reserver = (userId: string, type: string) =>
      comme(userId, async (c) => (await c.query("select public.reserver_notifications($1::uuid[], $2) as ids", [[id], type])).rows[0].ids);
    expect(await reserver(livreur, "prochain")).toEqual([id]);
    expect(await reserver(admin, "prochain")).toEqual([]);
    expect(await reserver(livreur, "depart")).toEqual([id]);
    expect(await erreur(reserver(compteAlice, "depart"))).toBe("42501");
  });
});
