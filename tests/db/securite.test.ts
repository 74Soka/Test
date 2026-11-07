import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, en, codeErreur, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

const TABLES = [
  "profils",
  "secteurs",
  "secteur_communes",
  "clients",
  "articles",
  "commandes",
  "lignes_commande",
  "parametres_fidelite",
  "recompenses",
  "tampons",
  "recompenses_utilisees",
  "cadeaux",
  "fidelite_clients",
];

let base: BaseDeTest;
let admin: string;
let livreur: string;
let sansProfil: string;
let secteur: string;
let clientId: string;
let panier: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  const c = base.client;
  admin = await creerCompte(c, "admin");
  livreur = await creerCompte(c, "livreur");
  sansProfil = await creerCompte(c, null);
  secteur = await creerSecteur(c, { communes: ["83137"] });
  clientId = await creerClient(c, secteur);
  panier = await creerArticle(c, { categorie: "panier", prix: 3000 });
  await enregistrerCommande(c, { clientId, date: "2026-11-07", lignes: [{ article_id: panier, quantite: 1 }] });
});

afterAll(async () => {
  await base?.detruire();
});

describe("RLS activée partout", () => {
  it("chaque table de l'application a la RLS activée", async () => {
    const { rows } = await base.client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    for (const t of TABLES.filter((t) => t !== "fidelite_clients")) {
      const ligne = rows.find((r) => r.relname === t);
      expect(ligne, t).toBeDefined();
      expect(ligne!.relrowsecurity, t).toBe(true);
    }
    // Aucune table oubliée
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });
});

describe("fonctions d'autorisation", () => {
  it("ne sont pas dans le schéma public (exposé par l'API)", async () => {
    const { rows } = await base.client.query(
      `select proname from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('est_admin', 'est_equipe')`,
    );
    expect(rows).toEqual([]);
  });

  it("ne sont pas utilisables par un visiteur anonyme", async () => {
    await expect(
      en(base.client, { role: "anon" }, (c) => c.query("select prive.est_admin()")),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });

  it("répondent pour l'utilisateur connecté uniquement", async () => {
    const reponse = async (userId: string) =>
      (
        await en(base.client, { role: "authenticated", userId }, (c) =>
          c.query<{ admin: boolean; equipe: boolean }>("select prive.est_admin() as admin, prive.est_equipe() as equipe"),
        )
      ).rows[0];
    expect(await reponse(admin)).toEqual({ admin: true, equipe: true });
    expect(await reponse(livreur)).toEqual({ admin: false, equipe: true });
    expect(await reponse(sansProfil)).toEqual({ admin: false, equipe: false });
  });
});

describe("visiteur anonyme", () => {
  it.each(TABLES)("n'a aucun accès à %s", async (table) => {
    await expect(
      en(base.client, { role: "anon" }, (c) => c.query(`select * from public.${table}`)),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });

  it("ne peut pas appeler enregistrer_commande", async () => {
    await expect(
      en(base.client, { role: "anon" }, (c) =>
        enregistrerCommande(c, { clientId, date: "2026-11-14", lignes: [{ article_id: panier, quantite: 1 }] }),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });
});

describe("compte connecté mais sans profil (ex. inscription non autorisée)", () => {
  it.each(TABLES)("ne voit aucune ligne de %s", async (table) => {
    const { rows } = await en(base.client, { role: "authenticated", userId: sansProfil }, (c) =>
      c.query(`select * from public.${table}`),
    );
    expect(rows).toEqual([]);
  });

  it("ne peut pas créer de client", async () => {
    await expect(
      en(base.client, { role: "authenticated", userId: sansProfil }, (c) =>
        c.query(
          `insert into public.clients (nom, adresse, code_postal, commune, secteur_id)
           values ('Intrus', '1 rue', '83000', 'Toulon', $1)`,
          [secteur],
        ),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });

  it("ne peut pas se donner le rôle admin", async () => {
    await expect(
      en(base.client, { role: "authenticated", userId: sansProfil }, (c) =>
        c.query("insert into public.profils (id, role) values ($1, 'admin')", [sansProfil]),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });
});

describe("livreur", () => {
  it("lit les clients et les commandes", async () => {
    const { rows } = await en(base.client, { role: "authenticated", userId: livreur }, (c) =>
      c.query("select id from public.clients"),
    );
    expect(rows.length).toBeGreaterThan(0);
    const commandes = await en(base.client, { role: "authenticated", userId: livreur }, (c) =>
      c.query("select id from public.commandes"),
    );
    expect(commandes.rows.length).toBeGreaterThan(0);
  });

  it("ne peut ni modifier ni supprimer un client", async () => {
    const maj = await en(base.client, { role: "authenticated", userId: livreur }, (c) =>
      c.query("update public.clients set nom = 'Pirate' where id = $1", [clientId]),
    );
    expect(maj.rowCount).toBe(0);
    const suppr = await en(base.client, { role: "authenticated", userId: livreur }, (c) =>
      c.query("delete from public.clients where id = $1", [clientId]),
    );
    expect(suppr.rowCount).toBe(0);
  });

  it("ne peut pas créer de commande", async () => {
    // Refus par la RLS (42501) ou client invisible en écriture (PN011)
    await expect(
      en(base.client, { role: "authenticated", userId: livreur }, (c) =>
        enregistrerCommande(c, { clientId, date: "2026-11-21", lignes: [{ article_id: panier, quantite: 1 }] }),
      ),
    ).rejects.toSatisfy((e) => ["42501", "PN011"].includes(codeErreur(e)!));
  });

  it("ne peut pas s'ajouter de tampons", async () => {
    await expect(
      en(base.client, { role: "authenticated", userId: livreur }, (c) =>
        c.query("insert into public.tampons (client_id, quantite, motif) values ($1, 50, 'ajustement')", [clientId]),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });

  it("ne voit que son propre profil", async () => {
    const { rows } = await en(base.client, { role: "authenticated", userId: livreur }, (c) =>
      c.query<{ id: string }>("select id from public.profils"),
    );
    expect(rows.map((r) => r.id)).toEqual([livreur]);
  });
});

describe("admin", () => {
  it("crée, modifie et supprime un client", async () => {
    const id = await en(base.client, { role: "authenticated", userId: admin }, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into public.clients (nom, adresse, code_postal, commune, secteur_id)
         values ('Nouveau', '1 rue', '83000', 'Toulon', $1) returning id`,
        [secteur],
      );
      return rows[0].id;
    });
    const maj = await en(base.client, { role: "authenticated", userId: admin }, (c) =>
      c.query("update public.clients set prenom = 'Jean' where id = $1", [id]),
    );
    expect(maj.rowCount).toBe(1);
    const suppr = await en(base.client, { role: "authenticated", userId: admin }, (c) =>
      c.query("delete from public.clients where id = $1", [id]),
    );
    expect(suppr.rowCount).toBe(1);
  });

  it("voit tous les profils", async () => {
    const { rows } = await en(base.client, { role: "authenticated", userId: admin }, (c) =>
      c.query("select id from public.profils"),
    );
    expect(rows.length).toBe(2);
  });

  it("crée une commande via enregistrer_commande", async () => {
    const autre = await creerClient(base.client, secteur);
    const id = await en(base.client, { role: "authenticated", userId: admin }, (c) =>
      enregistrerCommande(c, { clientId: autre, date: "2026-11-07", lignes: [{ article_id: panier, quantite: 2 }] }),
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
