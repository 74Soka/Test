import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codeErreur, creerBaseDeTest, creerCompte, creerCompteEnLigne, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

let base: BaseDeTest;
let admin: string;
let livreur: string;
let secteur: string;
let p30: string;
let fraises: string;
let panier50: string;
let horsSaison: string;
let aujourdhui: string;
let loin: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  livreur = await creerCompte(base.client, "livreur");
  secteur = await creerSecteur(base.client);
  p30 = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
  panier50 = await creerArticle(base.client, { categorie: "panier", prix: 5000 });
  fraises = await creerArticle(base.client, { categorie: "supplement", prix: 450 });
  horsSaison = await creerArticle(base.client, { categorie: "supplement", prix: 500, actif: false });
  const { rows } = await base.client.query(
    `select to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD') as a,
            to_char((now() at time zone 'Europe/Paris')::date + 30, 'YYYY-MM-DD') as l`,
  );
  aujourdhui = rows[0].a;
  loin = rows[0].l;
});

afterAll(async () => {
  await base?.detruire();
});

const comme = <T>(userId: string, fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId }, fn);

const commande = async (date: string) => {
  const client = await creerClient(base.client, secteur);
  const id = await comme(admin, (c) => enregistrerCommande(c, { clientId: client, date, lignes: [{ article_id: p30, quantite: 1 }] }));
  return { client, id };
};

const complement = (qui: string, commandeId: string, articleId: string, ecart: number) =>
  comme(qui, async (c) => (await c.query("select public.modifier_complement($1, $2, $3) as t", [commandeId, articleId, ecart])).rows[0].t as number);

async function erreur(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return codeErreur(e);
  }
  return "aucune erreur";
}

describe("compléments ajoutés par le livreur", () => {
  it("ajoute au prix du catalogue, ajuste la quantité, retire ; le total suit", async () => {
    const { id } = await commande(aujourdhui);
    expect(await complement(livreur, id, fraises, 1)).toBe(3450);
    expect(await complement(livreur, id, fraises, 2)).toBe(4350);
    const { rows } = await base.client.query(
      "select quantite, prix_unitaire_centimes from public.lignes_commande where commande_id = $1 and article_id = $2",
      [id, fraises],
    );
    expect(rows).toEqual([{ quantite: 3, prix_unitaire_centimes: 450 }]);
    expect(await complement(livreur, id, fraises, -3)).toBe(3000);
  });

  it("à la livraison, le compte du client reçoit la commande ajustée", async () => {
    const { client, id } = await commande(aujourdhui);
    await complement(livreur, id, fraises, 2);
    await comme(livreur, (c) => c.query("select public.marquer_livraison($1, true, null, false)", [id]));
    const { rows } = await base.client.query("select solde_centimes from public.soldes_clients where client_id = $1", [client]);
    expect(rows[0].solde_centimes).toBe(3900);
  });

  it("refuse : commande livrée, panier ou supplément hors saison, client, commande hors tournée du livreur", async () => {
    const { id } = await commande(aujourdhui);
    expect(await erreur(complement(livreur, id, panier50, 1))).toBe("PN004");
    expect(await erreur(complement(livreur, id, horsSaison, 1))).toBe("PN004");
    expect(await erreur(complement(livreur, id, fraises, 0))).toBe("PN010");

    const compteClient = await creerCompteEnLigne(base.client, "curieux@exemple.fr");
    expect(await erreur(complement(compteClient, id, fraises, 1))).toBe("42501");

    const lointaine = await commande(loin);
    expect(await erreur(complement(livreur, lointaine.id, fraises, 1))).toBe("42501");
    // L'administrateur, lui, peut
    expect(await complement(admin, lointaine.id, fraises, 1)).toBe(3450);

    await comme(livreur, (c) => c.query("select public.marquer_livraison($1, true)", [id]));
    expect(await erreur(complement(livreur, id, fraises, 1))).toBe("PN055");
  });
});
