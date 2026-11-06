import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, type BaseDeTest } from "./outils";

let base: BaseDeTest;

beforeAll(async () => {
  base = await creerBaseDeTest({ avecDemo: true });
});

afterAll(async () => {
  await base?.detruire();
});

describe("données de démonstration", () => {
  it("se chargent sans erreur avec 3 secteurs et 20 clients", async () => {
    const { rows } = await base.client.query(
      `select (select count(*) from public.secteurs)::int as secteurs,
              (select count(*) from public.clients)::int as clients,
              (select count(*) from public.clients where not actif)::int as inactifs,
              (select count(*) from public.clients where parrain_id is not null)::int as filleuls`,
    );
    expect(rows[0]).toEqual({ secteurs: 3, clients: 20, inactifs: 1, filleuls: 5 });
  });

  it("contiennent des commandes livrées et à livrer, toutes avec au moins un panier", async () => {
    const { rows } = await base.client.query(
      `select statut, count(*)::int as n from public.commandes group by statut order by statut`,
    );
    expect(rows.map((r) => r.statut)).toEqual(["a_livrer", "livree"]);

    const sansPanier = await base.client.query(
      `select id from public.commandes c
       where not exists (select 1 from public.lignes_commande l where l.commande_id = c.id and l.categorie = 'panier')`,
    );
    expect(sansPanier.rows).toEqual([]);
  });

  it("placent chaque commande sur le jour du secteur du client", async () => {
    const { rows } = await base.client.query(
      `select count(*)::int as n from public.commandes co
       join public.clients c on c.id = co.client_id
       join public.secteurs s on s.id = c.secteur_id
       where extract(isodow from co.date_livraison) <> s.jour`,
    );
    expect(rows[0].n).toBe(0);
  });
});
