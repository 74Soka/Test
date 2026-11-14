import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, creerCompteEnLigne, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

let base: BaseDeTest;
let admin: string;
let livreur: string;
let secteur: string;
let panier: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  livreur = await creerCompte(base.client, "livreur");
  secteur = await creerSecteur(base.client);
  panier = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
});

afterAll(async () => {
  await base?.detruire();
});

const comme = <T>(userId: string, fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId }, fn);

async function jour(date: string, clients: string[]) {
  const ids: Record<string, string> = {};
  for (const c of clients) {
    ids[c] = await comme(admin, (x) => enregistrerCommande(x, { clientId: c, date, lignes: [{ article_id: panier, quantite: 1 }] }));
  }
  return ids;
}

const preference = async () =>
  (await base.client.query("select clients from public.tournees_preferees where secteur_id = $1", [secteur])).rows[0]?.clients;

describe("ordre préféré des tournées", () => {
  it("retient l'ordre organisé par le livreur, et le met à jour la semaine suivante", async () => {
    const [a, b, c, d] = [
      await creerClient(base.client, secteur),
      await creerClient(base.client, secteur),
      await creerClient(base.client, secteur),
      await creerClient(base.client, secteur),
    ];
    const s1 = await jour("2030-11-16", [a, b, c]);
    await comme(livreur, (x) => x.query("select public.enregistrer_ordre_tournee($1)", [[s1[c], s1[a], s1[b]]]));
    expect(await preference()).toEqual([c, a, b]);

    // Semaine suivante : c absent, d nouveau ; le livreur organise b, d, a
    const s2 = await jour("2030-11-23", [a, b, d]);
    await comme(livreur, (x) => x.query("select public.enregistrer_ordre_tournee($1)", [[s2[b], s2[d], s2[a]]]));
    // c (absent) garde sa place : en tête, comme avant
    expect(await preference()).toEqual([c, b, d, a]);

    // L'équipe lit la préférence ; un client non
    expect(await comme(livreur, async (x) => (await x.query("select count(*)::int as n from public.tournees_preferees")).rows[0].n)).toBe(1);
    const compte = await creerCompteEnLigne(base.client, "curieux@exemple.fr");
    expect(await comme(compte, async (x) => (await x.query("select count(*)::int as n from public.tournees_preferees")).rows[0].n)).toBe(0);
  });
});
