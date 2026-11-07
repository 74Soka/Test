import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, en, codeErreur, type BaseDeTest } from "./outils";
import {
  creerArticle,
  creerClient,
  creerSecteur,
  enregistrerCommande,
  fidelite,
  livrer,
  recompense,
  type Ligne,
  type RecompenseDemandee,
} from "./fabrique";

let base: BaseDeTest;
let admin: string;
let secteur: string;
let p30: string;
let p50: string;
let haricots: string;
let confiture: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  secteur = await creerSecteur(base.client);
  p30 = await creerArticle(base.client, { categorie: "panier", prix: 3000, tampons: 1 });
  p50 = await creerArticle(base.client, { categorie: "panier", prix: 5000, tampons: 2 });
  haricots = await creerArticle(base.client, { categorie: "supplement", prix: 500 });
  confiture = await creerArticle(base.client, { categorie: "supplement", prix: 800 });
  await base.client.query("update public.recompenses set article_id = $1 where nom = 'Panier 30 € offert'", [p30]);
  await base.client.query("update public.recompenses set article_id = $1 where nom = 'Panier 50 € offert'", [p50]);
});

afterAll(async () => {
  await base?.detruire();
});

const commeAdmin = <T>(fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId: admin }, fn);

/** Samedi de la semaine n (semaines distinctes : une commande par semaine et par client). */
const samedi = (n: number) => {
  const d = new Date(Date.UTC(2026, 10, 7 + 7 * n));
  return d.toISOString().slice(0, 10);
};

const commander = (
  clientId: string,
  semaine: number,
  lignes: Ligne[],
  recompenses: RecompenseDemandee[] = [],
  commandeId?: string,
) =>
  commeAdmin((c) =>
    enregistrerCommande(c, { clientId, date: samedi(semaine), lignes, recompenses, commandeId }),
  );

const statut = (commandeId: string, s: string) =>
  commeAdmin((c) => c.query("select public.changer_statut_commande($1, $2)", [commandeId, s]));

const solde = async (clientId: string) => (await fidelite(base.client, clientId)).solde;

async function motifs(clientId: string) {
  const { rows } = await base.client.query<{ motif: string; quantite: number }>(
    "select motif::text, quantite from public.tampons where client_id = $1 order by created_at, motif",
    [clientId],
  );
  return rows;
}

/** Client qui a déjà `cible` tampons (bienvenue + Paniers 50 € livrés + ajustement). */
async function clientAvecSolde(cible: number) {
  const id = await creerClient(base.client, secteur);
  if (cible > 1) {
    await base.client.query(
      "insert into public.tampons (client_id, quantite, motif, note) values ($1, $2, 'ajustement', 'test')",
      [id, cible - 1],
    );
  }
  return id;
}

describe("tampons gagnés", () => {
  it("un nouveau client reçoit 1 tampon de bienvenue", async () => {
    const id = await creerClient(base.client, secteur);
    expect(await motifs(id)).toEqual([{ motif: "bienvenue", quantite: 1 }]);
    expect(await solde(id)).toBe(1);
  });

  it("parrainer : le parrain gagne 1 tampon, le filleul n'a que celui de bienvenue", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    expect(await solde(parrain)).toBe(2);
    expect(await solde(filleul)).toBe(1);
  });

  it("le tampon de parrainage suit le parrain si on le change, et disparaît si on le retire", async () => {
    const a = await creerClient(base.client, secteur);
    const b = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: a });

    await commeAdmin((c) => c.query("update public.clients set parrain_id = $1 where id = $2", [b, filleul]));
    expect(await solde(a)).toBe(1);
    expect(await solde(b)).toBe(2);

    await commeAdmin((c) => c.query("update public.clients set parrain_id = null where id = $1", [filleul]));
    expect(await solde(b)).toBe(1);
  });

  it("à la livraison : 1 tampon par Panier 30 €, 2 par Panier 50 €, rien pour les suppléments", async () => {
    const id = await creerClient(base.client, secteur);
    const cmd = await commander(id, 0, [
      { article_id: p30, quantite: 2 },
      { article_id: p50, quantite: 1 },
      { article_id: haricots, quantite: 3 },
    ]);
    expect(await solde(id)).toBe(1); // pas encore livrée
    await statut(cmd, "livree");
    expect(await solde(id)).toBe(5); // 1 + 2×1 + 1×2
  });

  it("marquer deux fois « livrée » ne donne jamais deux fois les tampons", async () => {
    const id = await creerClient(base.client, secteur);
    const cmd = await commander(id, 0, [{ article_id: p50, quantite: 1 }]);
    await statut(cmd, "livree");
    await statut(cmd, "livree");
    expect(await solde(id)).toBe(3);
    const { rows } = await base.client.query(
      "select count(*)::int as n from public.tampons where commande_id = $1 and motif = 'commande'",
      [cmd],
    );
    expect(rows[0].n).toBe(1);
  });

  it("annuler la livraison ou la commande retire les tampons liés", async () => {
    const id = await creerClient(base.client, secteur);
    const cmd = await commander(id, 0, [{ article_id: p50, quantite: 1 }]);
    await statut(cmd, "livree");
    await statut(cmd, "a_livrer");
    expect(await solde(id)).toBe(1);
    await statut(cmd, "livree");
    await statut(cmd, "annulee");
    expect(await solde(id)).toBe(1);
  });

  it("le parrain gagne 1 tampon à chaque commande livrée de son filleul", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    const c1 = await commander(filleul, 1, [{ article_id: p30, quantite: 2 }]);
    const c2 = await commander(filleul, 2, [{ article_id: p50, quantite: 1 }]);
    await statut(c1, "livree");
    await statut(c2, "livree");
    expect(await solde(parrain)).toBe(4); // 1 bienvenue + 1 parrainage + 2 commandes du filleul
    expect(await solde(filleul)).toBe(5); // 1 + 2 + 2
  });

  it("supprimer une commande livrée retire ses tampons (client et parrain)", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    const cmd = await commander(filleul, 3, [{ article_id: p50, quantite: 1 }]);
    await statut(cmd, "livree");
    await commeAdmin((c) => c.query("delete from public.commandes where id = $1", [cmd]));
    expect(await solde(filleul)).toBe(1);
    expect(await solde(parrain)).toBe(2);
  });

  it("supprimer un filleul (RGPD) : le parrain garde les tampons gagnés grâce à lui", async () => {
    const parrain = await creerClient(base.client, secteur);
    const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
    const cmd = await commander(filleul, 4, [{ article_id: p30, quantite: 1 }]);
    await statut(cmd, "livree");
    expect(await solde(parrain)).toBe(3);
    await commeAdmin((c) => c.query("delete from public.clients where id = $1", [filleul]));
    expect(await solde(parrain)).toBe(3);
  });

  it("un changement de paramètre vaut pour la suite, pas pour le passé", async () => {
    const ancien = await creerClient(base.client, secteur);
    await base.client.query("update public.parametres_fidelite set tampons_bienvenue = 2");
    try {
      const nouveau = await creerClient(base.client, secteur);
      expect(await solde(nouveau)).toBe(2);
      expect(await solde(ancien)).toBe(1);
    } finally {
      await base.client.query("update public.parametres_fidelite set tampons_bienvenue = 1");
    }
  });

  it("ajustement manuel par l'admin, en plus ou en moins ; les autres motifs restent automatiques", async () => {
    const id = await creerClient(base.client, secteur);
    await commeAdmin((c) =>
      c.query(
        "insert into public.tampons (client_id, quantite, motif, note) values ($1, -1, 'ajustement', 'erreur de saisie')",
        [id],
      ),
    );
    expect(await solde(id)).toBe(0);
    await expect(
      commeAdmin((c) =>
        c.query("insert into public.tampons (client_id, quantite, motif) values ($1, 10, 'commande')", [id]),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "42501");
  });
});

describe("récompenses", () => {
  it("comme une carte de fidélité : avec 7 tampons, le supplément offert (5) en laisse 2", async () => {
    const id = await clientAvecSolde(7);
    const offert = await recompense(base.client, "Supplément offert");
    const cmd = await commander(
      id,
      5,
      [{ article_id: p30, quantite: 1 }],
      [{ recompense_id: offert, articles: [{ article_id: haricots, quantite: 1 }] }],
    );
    expect(await solde(id)).toBe(2);

    const { rows } = await base.client.query(
      `select ru.nom, ru.cout_tampons, ca.libelle, ca.quantite
       from public.recompenses_utilisees ru join public.cadeaux ca on ca.utilisation_id = ru.id
       where ru.commande_id = $1`,
      [cmd],
    );
    expect(rows).toEqual([{ nom: "Supplément offert", cout_tampons: 5, libelle: expect.any(String), quantite: 1 }]);
  });

  it("refuse une récompense si le solde ne suffit pas", async () => {
    const id = await clientAvecSolde(4);
    const offert = await recompense(base.client, "Supplément offert");
    await expect(
      commander(id, 5, [{ article_id: p30, quantite: 1 }], [
        { recompense_id: offert, articles: [{ article_id: haricots, quantite: 1 }] },
      ]),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN020");
  });

  it("deux récompenses dans la même commande ne peuvent pas dépenser plus que le solde", async () => {
    const id = await clientAvecSolde(7);
    const offert = await recompense(base.client, "Supplément offert");
    const r = { recompense_id: offert, articles: [{ article_id: haricots, quantite: 1 }] };
    await expect(commander(id, 5, [{ article_id: p30, quantite: 1 }], [r, r])).rejects.toSatisfy(
      (e) => codeErreur(e) === "PN020",
    );
    expect(await solde(id)).toBe(7);
  });

  it("10 tampons : confiture + supplément offerts", async () => {
    const id = await clientAvecSolde(10);
    const r = await recompense(base.client, "Confiture + supplément offerts");
    await commander(id, 5, [{ article_id: p30, quantite: 1 }], [
      {
        recompense_id: r,
        articles: [
          { article_id: confiture, quantite: 1 },
          { article_id: haricots, quantite: 1 },
        ],
      },
    ]);
    expect(await solde(id)).toBe(0);
  });

  it("une récompense doit offrir au moins un article", async () => {
    const id = await clientAvecSolde(5);
    const offert = await recompense(base.client, "Supplément offert");
    await expect(
      commander(id, 5, [{ article_id: p30, quantite: 1 }], [{ recompense_id: offert, articles: [] }]),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN022");
  });

  it("annuler la commande rend les tampons de la récompense ; la rétablir les reprend", async () => {
    const id = await clientAvecSolde(5);
    const offert = await recompense(base.client, "Supplément offert");
    const cmd = await commander(id, 6, [{ article_id: p30, quantite: 1 }], [
      { recompense_id: offert, articles: [{ article_id: haricots, quantite: 1 }] },
    ]);
    expect(await solde(id)).toBe(0);
    await statut(cmd, "annulee");
    expect(await solde(id)).toBe(5);
    await statut(cmd, "a_livrer");
    expect(await solde(id)).toBe(0);
  });

  it("modifier la commande garde la récompense ; la retirer rend les tampons", async () => {
    const id = await clientAvecSolde(5);
    const offert = await recompense(base.client, "Supplément offert");
    const cmd = await commander(id, 7, [{ article_id: p30, quantite: 1 }], [
      { recompense_id: offert, articles: [{ article_id: haricots, quantite: 1 }] },
    ]);
    const { rows } = await base.client.query<{ id: string }>(
      "select id from public.recompenses_utilisees where commande_id = $1",
      [cmd],
    );

    // On change ce qui est offert, la récompense reste (pas de nouvelle dépense)
    await commander(
      id,
      7,
      [{ article_id: p50, quantite: 1 }],
      [{ id: rows[0].id, recompense_id: offert, articles: [{ article_id: confiture, quantite: 1 }] }],
      cmd,
    );
    expect(await solde(id)).toBe(0);

    // On la retire : tampons rendus
    await commander(id, 7, [{ article_id: p50, quantite: 1 }], [], cmd);
    expect(await solde(id)).toBe(5);
  });

  it("la livraison d'une commande avec cadeau rapporte les tampons des seuls articles achetés", async () => {
    const id = await clientAvecSolde(5);
    const offert = await recompense(base.client, "Supplément offert");
    const cmd = await commander(id, 8, [{ article_id: p30, quantite: 1 }], [
      { recompense_id: offert, articles: [{ article_id: haricots, quantite: 1 }] },
    ]);
    await statut(cmd, "livree");
    expect(await solde(id)).toBe(1); // 5 - 5 + 1
  });

  it("refuse de passer à un autre client une commande qui contient une récompense", async () => {
    const id = await clientAvecSolde(5);
    const autre = await creerClient(base.client, secteur);
    const offert = await recompense(base.client, "Supplément offert");
    const r = { recompense_id: offert, articles: [{ article_id: haricots, quantite: 1 }] };
    const cmd = await commander(id, 9, [{ article_id: p30, quantite: 1 }], [r]);
    await expect(
      commeAdmin((c) =>
        enregistrerCommande(c, {
          clientId: autre,
          date: samedi(9),
          lignes: [{ article_id: p30, quantite: 1 }],
          commandeId: cmd,
        }),
      ),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN023");
  });
});

describe("niveaux VIP et Ultra", () => {
  /** Parrain avec `n` filleuls, dont `livres` déjà livrés une fois. */
  async function parrainAvec(n: number, livres: number, semaine: number) {
    const parrain = await creerClient(base.client, secteur);
    for (let i = 0; i < n; i++) {
      const filleul = await creerClient(base.client, secteur, { parrainId: parrain });
      if (i < livres) {
        const cmd = await commander(filleul, semaine, [{ article_id: p30, quantite: 1 }]);
        await livrer(base.client, cmd);
      }
    }
    return parrain;
  }

  it("VIP à 5 filleuls déjà livrés ; un filleul jamais livré ne compte pas", async () => {
    const parrain = await parrainAvec(6, 4, 10);
    expect(await fidelite(base.client, parrain)).toMatchObject({ filleuls: 6, filleuls_comptes: 4, niveau: "standard" });

    const { rows } = await base.client.query<{ id: string }>(
      "select id from public.clients where parrain_id = $1 and id not in (select client_id from public.commandes) limit 1",
      [parrain],
    );
    await livrer(base.client, await commander(rows[0].id, 11, [{ article_id: p30, quantite: 1 }]));
    expect(await fidelite(base.client, parrain)).toMatchObject({ filleuls_comptes: 5, niveau: "vip" });
  });

  it("option : compter tous les filleuls, même jamais livrés", async () => {
    const parrain = await parrainAvec(5, 0, 12);
    expect((await fidelite(base.client, parrain)).niveau).toBe("standard");
    await base.client.query("update public.parametres_fidelite set filleuls_livres_seulement = false");
    try {
      expect((await fidelite(base.client, parrain)).niveau).toBe("vip");
    } finally {
      await base.client.query("update public.parametres_fidelite set filleuls_livres_seulement = true");
    }
  });

  it("le panier offert est réservé aux VIP, même avec assez de tampons", async () => {
    const id = await clientAvecSolde(25);
    const panierOffert = await recompense(base.client, "Panier 30 € offert");
    await expect(
      commander(id, 13, [], [{ recompense_id: panierOffert, articles: [{ article_id: p30, quantite: 1 }] }]),
    ).rejects.toSatisfy((e) => codeErreur(e) === "PN021");
  });

  it("un VIP utilise 20 tampons pour un Panier 30 € offert, seul dans la commande", async () => {
    const parrain = await parrainAvec(5, 5, 14);
    await base.client.query(
      "insert into public.tampons (client_id, quantite, motif, note) values ($1, 20, 'ajustement', 'test')",
      [parrain],
    );
    const avant = await solde(parrain);
    const panierOffert = await recompense(base.client, "Panier 30 € offert");
    const cmd = await commander(parrain, 15, [], [
      { recompense_id: panierOffert, articles: [{ article_id: p30, quantite: 1 }] },
    ]);
    expect(await solde(parrain)).toBe(avant - 20);

    // Le panier offert ne rapporte pas de tampon à la livraison
    await statut(cmd, "livree");
    expect(await solde(parrain)).toBe(avant - 20);
  });

  it("Ultra à 10 filleuls livrés : panier 50 € offert ; refusé à un simple VIP", async () => {
    await base.client.query("update public.parametres_fidelite set filleuls_vip = 2, filleuls_ultra = 3");
    try {
      const vip = await parrainAvec(2, 2, 16);
      const ultra = await parrainAvec(3, 3, 17);
      for (const id of [vip, ultra]) {
        await base.client.query(
          "insert into public.tampons (client_id, quantite, motif, note) values ($1, 30, 'ajustement', 'test')",
          [id],
        );
      }
      const r = await recompense(base.client, "Panier 50 € offert");
      const demande = [{ recompense_id: r, articles: [{ article_id: p50, quantite: 1 }] }];
      expect((await fidelite(base.client, ultra)).niveau).toBe("ultra");
      await expect(commander(vip, 18, [], demande)).rejects.toSatisfy((e) => codeErreur(e) === "PN021");
      await commander(ultra, 18, [], demande);
    } finally {
      await base.client.query("update public.parametres_fidelite set filleuls_vip = 5, filleuls_ultra = 10");
    }
  });
});
