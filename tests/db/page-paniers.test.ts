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
  it("la semaine en cours jusqu'au dimanche 23 h, close aux commandes après la clôture", async () => {
    const { rows } = await base.client.query(
      `select date_trunc('week', (now() at time zone 'Europe/Paris') + interval '1 hour')::date::text as base,
              (date_trunc('week', (now() at time zone 'Europe/Paris') + interval '1 hour')::date + 7)::text as suivante`,
    );
    const { base: semaineAttendue, suivante } = rows[0];
    const panier = (await base.client.query("select id from public.articles where categorie = 'panier' order by ordre limit 1")).rows[0].id;
    for (const [semaine, contenu] of [
      [semaineAttendue, "Panier de la semaine"],
      [suivante, "Panier de la semaine suivante"],
    ]) {
      await base.client.query(
        "insert into public.compositions (semaine, article_id, contenu) values ($1, $2, $3) on conflict (semaine, article_id) do update set contenu = excluded.contenu",
        [semaine, panier, contenu],
      );
    }
    const lire = async () =>
      (await sansCompte(async (c) => (await c.query("select public.paniers_publics() as d")).rows[0].d)) as {
        semaine: string;
        semaine_close: boolean;
      };

    // Même après la clôture (fixée aujourd'hui à 00 h 00), le panier de la semaine reste affiché, marqué « clos »
    await base.client.query(
      "update public.parametres_commandes set cloture_jour = extract(isodow from now() at time zone 'Europe/Paris'), cloture_heure = '00:00'",
    );
    const apres = await lire();
    expect(apres.semaine).toBe(semaineAttendue);
    expect(apres.semaine_close).toBe(true);

    // Clôture encore loin (dimanche 23 h 59) : même semaine, commandes ouvertes
    await base.client.query("update public.parametres_commandes set cloture_jour = 7, cloture_heure = '23:59'");
    const avant = await lire();
    expect(avant.semaine).toBe(semaineAttendue);

    // Semaine en cours non saisie : on montre la suivante dès qu'elle l'est, jamais une semaine passée
    await base.client.query("delete from public.compositions where semaine = $1", [semaineAttendue]);
    expect((await lire()).semaine).toBe(suivante);
    await base.client.query("update public.parametres_commandes set cloture_jour = 5, cloture_heure = '12:00'");
  });
});
