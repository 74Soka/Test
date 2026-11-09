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
