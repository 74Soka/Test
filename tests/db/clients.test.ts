import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, en, codeErreur, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

let base: BaseDeTest;
let admin: string;
let secteur: string;
let panier: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  secteur = await creerSecteur(base.client);
  panier = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
});

afterAll(async () => {
  await base?.detruire();
});

const commeAdmin = <T>(fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId: admin }, fn);

async function parrainDe(id: string): Promise<string | null> {
  const { rows } = await base.client.query<{ parrain_id: string | null }>(
    "select parrain_id from public.clients where id = $1",
    [id],
  );
  return rows[0].parrain_id;
}

describe("parrainage", () => {
  it("un client ne peut pas être son propre parrain", async () => {
    const a = await creerClient(base.client, secteur);
    await expect(
      commeAdmin((c) => c.query("update public.clients set parrain_id = id where id = $1", [a])),
    ).rejects.toSatisfy((e) => ["23514", "PN001"].includes(codeErreur(e)!));
  });

  it("refuse une boucle directe (A parraine B, B parraine A)", async () => {
    const a = await creerClient(base.client, secteur);
    const b = await creerClient(base.client, secteur, { parrainId: a });
    await expect(
      commeAdmin((c) => c.query("update public.clients set parrain_id = $1 where id = $2", [b, a])),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN001");
  });

  it("refuse une boucle indirecte (A → B → C → A)", async () => {
    const a = await creerClient(base.client, secteur);
    const b = await creerClient(base.client, secteur, { parrainId: a });
    const c3 = await creerClient(base.client, secteur, { parrainId: b });
    await expect(
      commeAdmin((c) => c.query("update public.clients set parrain_id = $1 where id = $2", [c3, a])),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN001");
  });

  it("accepte une chaîne sans boucle et plusieurs filleuls", async () => {
    const a = await creerClient(base.client, secteur);
    const b = await creerClient(base.client, secteur);
    const c3 = await creerClient(base.client, secteur);
    await commeAdmin((c) =>
      c.query("update public.clients set parrain_id = $1 where id = any($2::uuid[])", [a, [b, c3]]),
    );
    expect(await parrainDe(b)).toBe(a);
    expect(await parrainDe(c3)).toBe(a);
  });

  it("supprimer le parrain retire le lien chez ses filleuls sans les supprimer", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    await commeAdmin((c) => c.query("delete from public.clients where id = $1", [parrain]));
    expect(await parrainDe(filleul)).toBeNull();
  });
});

describe("suppression d'un client (RGPD)", () => {
  it("supprime aussi ses commandes et leurs lignes", async () => {
    const client = await creerClient(base.client, secteur);
    const commande = await enregistrerCommande(base.client, {
      clientId: client,
      date: "2026-11-07",
      lignes: [{ article_id: panier, quantite: 1 }],
    });
    await commeAdmin((c) => c.query("delete from public.clients where id = $1", [client]));

    const restes = await base.client.query(
      `select (select count(*) from public.commandes where id = $1)::int as commandes,
              (select count(*) from public.lignes_commande where commande_id = $1)::int as lignes`,
      [commande],
    );
    expect(restes.rows[0]).toEqual({ commandes: 0, lignes: 0 });
  });
});

describe("contraintes sur la fiche client", () => {
  it("refuse un téléphone qui n'est pas au format international", async () => {
    const id = await creerClient(base.client, secteur);
    await expect(
      commeAdmin((c) => c.query("update public.clients set telephone = '06 12 34 56 78' where id = $1", [id])),
    ).rejects.toSatisfy((e) => codeErreur(e) === "23514");
  });

  it("refuse une position incomplète", async () => {
    const id = await creerClient(base.client, secteur);
    await expect(
      commeAdmin((c) => c.query("update public.clients set lat = null where id = $1", [id])),
    ).rejects.toSatisfy((e) => codeErreur(e) === "23514");
  });

  it("empêche de supprimer un secteur qui a encore des clients", async () => {
    const s = await creerSecteur(base.client);
    await creerClient(base.client, s);
    await expect(
      commeAdmin((c) => c.query("delete from public.secteurs where id = $1", [s])),
    ).rejects.toSatisfy((e) => codeErreur(e) === "23503");
  });
});
