import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, en, codeErreur, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande, type Ligne } from "./fabrique";

let base: BaseDeTest;
let admin: string;
let secteur: string;
let p30: string;
let p50: string;
let oeufs: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  secteur = await creerSecteur(base.client);
  p30 = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
  p50 = await creerArticle(base.client, { categorie: "panier", prix: 5000 });
  oeufs = await creerArticle(base.client, { categorie: "supplement", prix: 500 });
});

afterAll(async () => {
  await base?.detruire();
});

const commeAdmin = <T>(fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId: admin }, fn);

const enregistrer = (p: Parameters<typeof enregistrerCommande>[1]) =>
  commeAdmin((c) => enregistrerCommande(c, p));

const changerStatut = (id: string, statut: string) =>
  commeAdmin((c) => c.query("select public.changer_statut_commande($1, $2)", [id, statut]));

async function lignes(commandeId: string) {
  const { rows } = await base.client.query<{
    article_id: string;
    quantite: number;
    prix_unitaire_centimes: number;
  }>(
    "select article_id, quantite, prix_unitaire_centimes from public.lignes_commande where commande_id = $1 order by prix_unitaire_centimes desc",
    [commandeId],
  );
  return rows;
}

async function commande(id: string) {
  const { rows } = await base.client.query<{ statut: string; livree_le: Date | null; semaine: Date }>(
    "select statut, livree_le, semaine from public.commandes where id = $1",
    [id],
  );
  return rows[0];
}

describe("contenu d'une commande", () => {
  it("enregistre plusieurs paniers et des suppléments avec les prix du catalogue", async () => {
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({
      clientId: client,
      date: "2026-11-07",
      lignes: [
        { article_id: p50, quantite: 1 },
        { article_id: p30, quantite: 2 },
        { article_id: oeufs, quantite: 3 },
      ],
    });
    expect(await lignes(id)).toEqual([
      { article_id: p50, quantite: 1, prix_unitaire_centimes: 5000 },
      { article_id: p30, quantite: 2, prix_unitaire_centimes: 3000 },
      { article_id: oeufs, quantite: 3, prix_unitaire_centimes: 500 },
    ]);
  });

  it("regroupe les doublons et ignore les quantités nulles", async () => {
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({
      clientId: client,
      date: "2026-11-07",
      lignes: [
        { article_id: p30, quantite: 1 },
        { article_id: p30, quantite: 1 },
        { article_id: oeufs, quantite: 0 },
      ],
    });
    expect(await lignes(id)).toEqual([{ article_id: p30, quantite: 2, prix_unitaire_centimes: 3000 }]);
  });

  it("refuse une commande sans panier (suppléments seuls)", async () => {
    const client = await creerClient(base.client, secteur);
    await expect(
      enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: oeufs, quantite: 2 }] }),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN002");
  });

  it("refuse une commande vide", async () => {
    const client = await creerClient(base.client, secteur);
    await expect(enregistrer({ clientId: client, date: "2026-11-07", lignes: [] })).rejects.toSatisfy(
      (e) => codeErreur(e) === "PN002",
    );
  });

  it("garde-fou en base : impossible de retirer le dernier panier directement dans la table", async () => {
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({
      clientId: client,
      date: "2026-11-07",
      lignes: [
        { article_id: p30, quantite: 1 },
        { article_id: oeufs, quantite: 1 },
      ],
    });
    await expect(
      commeAdmin((c) =>
        c.query("delete from public.lignes_commande where commande_id = $1 and article_id = $2", [id, p30]),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN002");
    expect(await lignes(id)).toHaveLength(2);
  });

  it("refuse plus de 99 exemplaires d'un article", async () => {
    const client = await creerClient(base.client, secteur);
    await expect(
      enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p30, quantite: 100 }] }),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN010");
  });

  it("refuse un article désactivé (supplément hors saison)", async () => {
    const horsSaison = await creerArticle(base.client, { categorie: "supplement", prix: 500, actif: false });
    const client = await creerClient(base.client, secteur);
    await expect(
      enregistrer({
        clientId: client,
        date: "2026-11-07",
        lignes: [
          { article_id: p30, quantite: 1 },
          { article_id: horsSaison, quantite: 1 },
        ],
      }),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN004");
  });

  it("refuse une commande pour un client inactif", async () => {
    const client = await creerClient(base.client, secteur, { actif: false });
    await expect(
      enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p30, quantite: 1 }] }),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN007");
  });
});

describe("une commande par client et par semaine", () => {
  it("refuse une deuxième commande la même semaine (samedi puis dimanche)", async () => {
    const client = await creerClient(base.client, secteur);
    await enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p30, quantite: 1 }] });
    await expect(
      enregistrer({ clientId: client, date: "2026-11-08", lignes: [{ article_id: p50, quantite: 1 }] }),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN003");
  });

  it("accepte des commandes sur deux semaines différentes", async () => {
    const client = await creerClient(base.client, secteur);
    await enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p30, quantite: 1 }] });
    await enregistrer({ clientId: client, date: "2026-11-14", lignes: [{ article_id: p30, quantite: 1 }] });
  });

  it("calcule la semaine à partir du lundi", async () => {
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({ clientId: client, date: "2026-11-08", lignes: [{ article_id: p30, quantite: 1 }] });
    const { semaine } = await commande(id);
    expect(semaine.getFullYear()).toBe(2026);
    expect(semaine.getMonth()).toBe(10);
    expect(semaine.getDate()).toBe(2);
  });

  it("une commande annulée libère la semaine, mais on ne peut pas la rétablir ensuite", async () => {
    const client = await creerClient(base.client, secteur);
    const premiere = await enregistrer({
      clientId: client,
      date: "2026-11-07",
      lignes: [{ article_id: p30, quantite: 1 }],
    });
    await changerStatut(premiere, "annulee");
    await enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p50, quantite: 1 }] });
    await expect(changerStatut(premiere, "a_livrer")).rejects.toSatisfy((e) => codeErreur(e) === "PN003");
  });
});

describe("modification d'une commande", () => {
  it("garde le prix figé des lignes existantes et prend le prix actuel pour les nouvelles", async () => {
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p30, quantite: 1 }] });

    await base.client.query("update public.articles set prix_centimes = 3200 where id = $1", [p30]);
    await base.client.query("update public.articles set prix_centimes = 600 where id = $1", [oeufs]);
    try {
      const nouvelles: Ligne[] = [
        { article_id: p30, quantite: 2 },
        { article_id: oeufs, quantite: 1 },
      ];
      await enregistrer({ clientId: client, date: "2026-11-07", lignes: nouvelles, commandeId: id });
      expect(await lignes(id)).toEqual([
        { article_id: p30, quantite: 2, prix_unitaire_centimes: 3000 },
        { article_id: oeufs, quantite: 1, prix_unitaire_centimes: 600 },
      ]);
    } finally {
      await base.client.query("update public.articles set prix_centimes = 3000 where id = $1", [p30]);
      await base.client.query("update public.articles set prix_centimes = 500 where id = $1", [oeufs]);
    }
  });

  it("retire les lignes absentes de la nouvelle version", async () => {
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({
      clientId: client,
      date: "2026-11-07",
      lignes: [
        { article_id: p30, quantite: 1 },
        { article_id: oeufs, quantite: 2 },
      ],
    });
    await enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p50, quantite: 1 }], commandeId: id });
    expect(await lignes(id)).toEqual([{ article_id: p50, quantite: 1, prix_unitaire_centimes: 5000 }]);
  });

  it("une ligne existante peut garder un article devenu hors saison", async () => {
    const saisonnier = await creerArticle(base.client, { categorie: "supplement", prix: 500 });
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({
      clientId: client,
      date: "2026-11-07",
      lignes: [
        { article_id: p30, quantite: 1 },
        { article_id: saisonnier, quantite: 1 },
      ],
    });
    await base.client.query("update public.articles set actif = false where id = $1", [saisonnier]);
    await enregistrer({
      clientId: client,
      date: "2026-11-07",
      lignes: [
        { article_id: p30, quantite: 2 },
        { article_id: saisonnier, quantite: 1 },
      ],
      commandeId: id,
    });
    expect(await lignes(id)).toHaveLength(2);
  });

  it("refuse de modifier une commande livrée ou annulée", async () => {
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p30, quantite: 1 }] });
    await changerStatut(id, "livree");
    await expect(
      enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p50, quantite: 1 }], commandeId: id }),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN005");
  });
});

describe("statut", () => {
  it("« livrée » horodate la livraison ; revenir à « à livrer » efface l'horodatage", async () => {
    const client = await creerClient(base.client, secteur);
    const id = await enregistrer({ clientId: client, date: "2026-11-07", lignes: [{ article_id: p30, quantite: 1 }] });

    await changerStatut(id, "livree");
    const livree = await commande(id);
    expect(livree.statut).toBe("livree");
    expect(livree.livree_le).toBeInstanceOf(Date);

    // Marquer deux fois « livrée » ne change pas l'heure de livraison
    await changerStatut(id, "livree");
    expect((await commande(id)).livree_le).toEqual(livree.livree_le);

    await changerStatut(id, "a_livrer");
    expect(await commande(id)).toMatchObject({ statut: "a_livrer", livree_le: null });
  });

  it("signale une commande introuvable", async () => {
    await expect(changerStatut("00000000-0000-0000-0000-000000000000", "livree")).rejects.toSatisfy(
      (e) => codeErreur(e) === "PN006",
    );
  });
});
