import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, en, type BaseDeTest } from "./outils";

let base: BaseDeTest;

beforeAll(async () => {
  base = await creerBaseDeTest({ avecDemo: true });
});

afterAll(async () => {
  await base?.detruire();
});

const sansCompte = <T>(fn: Parameters<typeof en<T>>[2]) => en(base.client, { role: "anon" }, fn);

describe("page publique des paniers (sans compte)", () => {
  it("donne la composition, les suppléments et les livraisons, sans rien de personnel", async () => {
    const d = await sansCompte(async (c) => (await c.query("select public.paniers_publics() as d")).rows[0].d);
    expect(d.paniers.length).toBeGreaterThan(0);
    expect(d.supplements.length).toBeGreaterThan(0);
    expect(d.secteurs[0]).toEqual(
      expect.objectContaining({ nom: expect.any(String), jour: expect.any(Number), communes: expect.any(Array) }),
    );
    // Aucune donnée de client, ni adresse de départ des tournées
    const texte = JSON.stringify(d);
    expect(texte).not.toMatch(/telephone|adresse|email|depart|\+336/i);
  });

  it("les tables restent fermées sans compte", async () => {
    for (const table of ["clients", "compositions", "articles", "secteurs", "commandes"]) {
      await expect(sansCompte((c) => c.query(`select * from public.${table} limit 1`))).rejects.toThrow(/permission/);
    }
  });
});

describe("recette de la semaine", () => {
  it("sort sur la page publique, mais la table reste fermée sans compte", async () => {
    await base.client.query(
      // Plusieurs semaines autour d'aujourd'hui : la page choisit selon le jour (week-end = semaine suivante)
      `insert into public.recettes (semaine, titre, infos, ingredients, etapes)
       select s::date, 'Poêlée paysanne', '4 personnes', '3 poireaux', 'Émincez les poireaux.'
       from generate_series(date_trunc('week', current_date) - interval '7 days',
                            date_trunc('week', current_date) + interval '21 days', interval '7 days') s
       on conflict (semaine) do nothing`,
    );
    const d = await sansCompte(async (c) => (await c.query("select public.paniers_publics() as d")).rows[0].d);
    expect(d.recette).toEqual(expect.objectContaining({ titre: "Poêlée paysanne", ingredients: "3 poireaux" }));
    await expect(sansCompte((c) => c.query("select * from public.recettes"))).rejects.toThrow(/permission/);
  });
});

describe("semaine montrée aux clients", () => {
  it("passe à la semaine suivante dès la clôture des commandes, jamais en arrière", async () => {
    const lundi = (await base.client.query("select date_trunc('week', now() at time zone 'Europe/Paris')::date::text as l")).rows[0].l;
    const suivant = (await base.client.query("select ($1::date + 7)::text as s", [lundi])).rows[0].s;
    const panier = (await base.client.query("select id from public.articles where categorie = 'panier' order by ordre limit 1")).rows[0].id;
    for (const [semaine, contenu] of [
      [lundi, "Panier de cette semaine"],
      [suivant, "Panier de la semaine prochaine"],
    ]) {
      await base.client.query(
        "insert into public.compositions (semaine, article_id, contenu) values ($1, $2, $3) on conflict (semaine, article_id) do update set contenu = excluded.contenu",
        [semaine, panier, contenu],
      );
    }
    const semaineMontree = async () =>
      (await sansCompte(async (c) => (await c.query("select public.paniers_publics()->>'semaine' as s")).rows[0].s)) as string;

    // Clôture aujourd'hui à 00 h 00 : déjà passée pour les livraisons de cette semaine → semaine suivante
    await base.client.query(
      "update public.parametres_commandes set cloture_jour = extract(isodow from now() at time zone 'Europe/Paris'), cloture_heure = '00:00'",
    );
    const apresCloture = await semaineMontree();
    // Clôture au jour d'aujourd'hui à 23 h 59 : encore ouverte pour la livraison la plus proche
    await base.client.query("update public.parametres_commandes set cloture_heure = '23:59'");
    const avantCloture = await semaineMontree();

    expect([lundi, suivant]).toContain(avantCloture);
    expect(apresCloture >= avantCloture).toBe(true);
    // Jamais une semaine passée
    expect(apresCloture >= lundi && avantCloture >= lundi).toBe(true);
    await base.client.query("update public.parametres_commandes set cloture_jour = 5, cloture_heure = '12:00'");
  });
});
