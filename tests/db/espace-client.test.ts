import type { ClientBase } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codeErreur, creerBaseDeTest, creerCompte, creerCompteEnLigne, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande, recompense, type Ligne } from "./fabrique";

/**
 * Espace client : rattachement des comptes, isolement des données, commandes
 * en ligne (clôture, récompenses, cadeaux), inscriptions, RGPD.
 */

let base: BaseDeTest;
let admin: string;
let livreur: string;
let secteur: string;
let autreSecteur: string;
let p30: string;
let p50: string;
let sup1: string;
let sup2: string;
let supInactif: string;
let oeufs: string;
let confiture: string;
let recSupplement: string;
let recConfitureSupplement: string;
let recPanier30: string;
let recOeufs: string;
let recConfiture: string;
let demain: string;
let dansHuitJours: string;
let jourAujourdhui: number;

let alice: string; // fiche
let compteAlice: string;
let bob: string;
let compteBob: string;

const comme = <T>(userId: string, fn: (c: ClientBase) => Promise<T>) =>
  en(base.client, { role: "authenticated", userId }, fn);

type Situation = {
  etat: string;
  client_id?: string;
  prochaine_livraison?: string;
  cloture?: string;
  commande_id?: string | null;
  commandes_ouvertes?: boolean;
};

const situation = (userId: string) =>
  comme(userId, async (c) => (await c.query<{ s: Situation }>("select public.ma_situation() as s")).rows[0].s);

type NouvelleRecompense = { recompense_id: string; articles?: Ligne[] };

const passer = (
  userId: string,
  p: { lignes: Ligne[]; gardees?: string[]; nouvelles?: NouvelleRecompense[]; notes?: string | null },
) =>
  comme(userId, async (c) => {
    const { rows } = await c.query<{ r: { commande_id: string; nouvelle: boolean; date_livraison: string } }>(
      "select public.passer_commande($1::jsonb, $2::uuid[], $3::jsonb, $4) as r",
      [JSON.stringify(p.lignes), p.gardees ?? [], JSON.stringify(p.nouvelles ?? []), p.notes ?? null],
    );
    return rows[0].r;
  });

const panier30 = (quantite = 1): Ligne[] => [{ article_id: p30, quantite }];

async function erreur(promesse: Promise<unknown>): Promise<string | undefined> {
  try {
    await promesse;
  } catch (e) {
    return codeErreur(e);
  }
  return "aucune erreur";
}

const sql = async <T extends Record<string, unknown>>(texte: string, valeurs: unknown[] = []) =>
  (await base.client.query<T>(texte, valeurs)).rows;

async function solde(clientId: string): Promise<number> {
  const [r] = await sql<{ solde: number }>("select solde from public.fidelite_clients where client_id = $1", [clientId]);
  return r.solde;
}

/** Clôture « aujourd'hui à cette heure » : 23:59:59 = commandes ouvertes pour demain, 00:00 = closes */
async function cloture(heure: string) {
  await sql("update public.parametres_commandes set cloture_jour = $1, cloture_heure = $2", [jourAujourdhui, heure]);
}

beforeAll(async () => {
  base = await creerBaseDeTest();
  const c = base.client;
  admin = await creerCompte(c, "admin");
  livreur = await creerCompte(c, "livreur");

  const [d] = await sql<{ demain: string; huit: string; jour_ajd: number; jour_demain: number }>(`
    select to_char(j + 1, 'YYYY-MM-DD') as demain,
           to_char(j + 8, 'YYYY-MM-DD') as huit,
           extract(isodow from j)::integer as jour_ajd,
           extract(isodow from j + 1)::integer as jour_demain
    from (select (now() at time zone 'Europe/Paris')::date as j) x`);
  demain = d.demain;
  dansHuitJours = d.huit;
  jourAujourdhui = d.jour_ajd;

  // Le secteur est livré demain ; la clôture tombe aujourd'hui en fin de journée
  secteur = await creerSecteur(c, { jour: d.jour_demain });
  autreSecteur = await creerSecteur(c, { jour: d.jour_demain });
  await cloture("23:59:59");

  p30 = await creerArticle(c, { categorie: "panier", prix: 3000, tampons: 1 });
  p50 = await creerArticle(c, { categorie: "panier", prix: 5000, tampons: 2 });
  sup1 = await creerArticle(c, { categorie: "supplement", prix: 500 });
  sup2 = await creerArticle(c, { categorie: "supplement", prix: 500 });
  supInactif = await creerArticle(c, { categorie: "supplement", prix: 500, actif: false });
  oeufs = await creerArticle(c, { categorie: "supplement", prix: 300 });
  confiture = await creerArticle(c, { categorie: "supplement", prix: 800 });

  recSupplement = await recompense(c, "Supplément offert");
  recConfitureSupplement = await recompense(c, "Confiture + supplément offerts");
  recPanier30 = await recompense(c, "Panier 30 € offert");
  recOeufs = await recompense(c, "Œufs offerts au filleul");
  recConfiture = await recompense(c, "Confiture offerte au parrain");
  await sql("update public.recompenses set article_id = $1 where id = $2", [p30, recPanier30]);
  await sql("update public.recompenses set article_id = $1 where id = $2", [oeufs, recOeufs]);
  await sql("update public.parametres_fidelite set parrainage_cadeaux_debut = current_date - 30");

  alice = await creerClient(c, secteur);
  await sql("update public.clients set email = 'alice@exemple.fr' where id = $1", [alice]);
  compteAlice = await creerCompteEnLigne(c, "Alice@Exemple.fr");
  bob = await creerClient(c, autreSecteur);
  await sql("update public.clients set email = 'bob@exemple.fr' where id = $1", [bob]);
  compteBob = await creerCompteEnLigne(c, "bob@exemple.fr");
  // Rattachement à la première visite
  await situation(compteAlice);
  await situation(compteBob);
});

afterAll(async () => {
  await base?.detruire();
});

describe("rattachement du compte à la fiche client", () => {
  it("relie le compte dont l'e-mail confirmé correspond (sans tenir compte des majuscules)", async () => {
    const s = await situation(compteAlice);
    expect(s.etat).toBe("client");
    expect(s.client_id).toBe(alice);
    expect(s.prochaine_livraison).toBe(demain);
    expect(s.commandes_ouvertes).toBe(true);
    const [r] = await sql<{ locale: string }>(
      "select to_char($1::timestamptz at time zone 'Europe/Paris', 'HH24:MI:SS') as locale",
      [s.cloture],
    );
    expect(r.locale).toBe("23:59:59");
  });

  it("ne relie pas un e-mail non confirmé", async () => {
    const fiche = await creerClient(base.client, secteur);
    await sql("update public.clients set email = 'claire@exemple.fr' where id = $1", [fiche]);
    const compte = await creerCompteEnLigne(base.client, "claire@exemple.fr", false);
    expect((await situation(compte)).etat).toBe("nouveau");
    expect(await sql("select 1 from public.comptes_clients where user_id = $1", [compte])).toHaveLength(0);
  });

  it("ne relie pas un e-mail partagé par deux fiches (l'administrateur choisit)", async () => {
    for (let i = 0; i < 2; i++) {
      const f = await creerClient(base.client, secteur);
      await sql("update public.clients set email = 'famille@exemple.fr' where id = $1", [f]);
    }
    const compte = await creerCompteEnLigne(base.client, "famille@exemple.fr");
    expect((await situation(compte)).etat).toBe("nouveau");
  });

  it("un compte de l'équipe est reconnu comme tel", async () => {
    expect((await situation(admin)).etat).toBe("equipe");
    expect((await situation(livreur)).etat).toBe("equipe");
  });
});

describe("un client ne voit que ses propres données", () => {
  beforeAll(async () => {
    await comme(admin, (c) =>
      enregistrerCommande(c, { clientId: bob, date: demain, lignes: [{ article_id: p50, quantite: 1 }] }),
    );
  });

  it("sa fiche, son secteur, son compte, ses tampons, sa ligne de fidélité", async () => {
    await comme(compteAlice, async (c) => {
      expect((await c.query("select id from public.clients")).rows).toEqual([{ id: alice }]);
      expect((await c.query("select id from public.secteurs")).rows).toEqual([{ id: secteur }]);
      expect((await c.query("select client_id from public.comptes_clients")).rows).toEqual([{ client_id: alice }]);
      expect((await c.query("select distinct client_id from public.tampons")).rows).toEqual([{ client_id: alice }]);
      expect((await c.query("select client_id from public.fidelite_clients")).rows).toEqual([{ client_id: alice }]);
      expect((await c.query("select 1 from public.inscriptions")).rows).toEqual([]);
      expect((await c.query("select 1 from public.profils")).rows).toEqual([]);
    });
  });

  it("pas les commandes des autres", async () => {
    await comme(compteAlice, async (c) => {
      expect((await c.query("select 1 from public.commandes where client_id = $1", [bob])).rows).toEqual([]);
      expect(
        (
          await c.query(
            "select 1 from public.lignes_commande l join public.commandes co on co.id = l.commande_id where co.client_id = $1",
            [bob],
          )
        ).rows,
      ).toEqual([]);
    });
  });

  it("n'écrit rien directement, ni par les fonctions de l'équipe", async () => {
    expect(
      await erreur(
        comme(compteAlice, (c) =>
          c.query("insert into public.commandes (client_id, date_livraison) values ($1, $2)", [alice, demain]),
        ),
      ),
    ).toBe("42501");
    expect(
      await erreur(
        comme(compteAlice, (c) => enregistrerCommande(c, { clientId: bob, date: dansHuitJours, lignes: panier30() })),
      ),
    ).toBe("PN011"); // la fiche de Bob lui est invisible
    expect(
      await erreur(
        comme(compteAlice, (c) => enregistrerCommande(c, { clientId: alice, date: dansHuitJours, lignes: panier30() })),
      ),
    ).toBe("PN011"); // même pour elle-même (pas le droit de verrouiller sa fiche) : seulement par passer_commande
    expect(
      await sql("select 1 from public.commandes where date_livraison = $1 and client_id in ($2, $3)", [
        dansHuitJours,
        alice,
        bob,
      ]),
    ).toHaveLength(0);
    const { rowCount } = await comme(compteAlice, (c) =>
      c.query("update public.clients set actif = true, nom = 'Pirate' where id = $1", [alice]),
    );
    expect(rowCount).toBe(0);
    const [commandeBob] = await sql<{ id: string }>("select id from public.commandes where client_id = $1", [bob]);
    expect(
      await erreur(comme(compteAlice, (c) => c.query("select public.marquer_livraison($1, true)", [commandeBob.id]))),
    ).toBe("42501");
    expect(
      await erreur(comme(compteAlice, (c) => c.query("select public.enregistrer_ordre_tournee($1::uuid[])", [[commandeBob.id]]))),
    ).toBe("42501");
    expect(
      await erreur(comme(compteAlice, (c) => c.query("select public.annuler_ma_commande($1)", [commandeBob.id]))),
    ).toBe("PN006");
    expect(
      await erreur(comme(compteAlice, (c) => c.query("select public.valider_inscription($1, $2)", [compteAlice, secteur]))),
    ).toBe("42501");
    for (const requete of [
      "update public.parametres_commandes set commandes_ouvertes = false",
      `insert into public.compositions (semaine, article_id, contenu) values (date_trunc('week', now())::date, '${p30}', 'x')`,
    ]) {
      const r = await erreur(comme(compteAlice, (c) => c.query(requete)));
      expect(["42501", "aucune erreur"]).toContain(r);
    }
    const [p] = await sql<{ commandes_ouvertes: boolean }>("select commandes_ouvertes from public.parametres_commandes");
    expect(p.commandes_ouvertes).toBe(true);
    expect(await sql("select 1 from public.compositions")).toHaveLength(0);
  });

  it("le livreur garde l'accès à la tournée", async () => {
    const [commandeBob] = await sql<{ id: string }>("select id from public.commandes where client_id = $1", [bob]);
    await comme(livreur, (c) => c.query("select public.marquer_livraison($1, true)", [commandeBob.id]));
    await comme(livreur, (c) => c.query("select public.marquer_livraison($1, false)", [commandeBob.id]));
    const [r] = await sql<{ statut: string }>("select statut from public.commandes where id = $1", [commandeBob.id]);
    expect(r.statut).toBe("a_livrer");
  });
});

describe("commander en ligne", () => {
  it("crée la commande de la prochaine livraison, puis la modifie", async () => {
    const r = await passer(compteAlice, { lignes: panier30(), notes: "Sonner fort" });
    expect(r.nouvelle).toBe(true);
    expect(r.date_livraison).toBe(demain);
    const [co] = await sql<{ source: string; client_id: string; notes: string; date: string }>(
      "select source, client_id, notes, to_char(date_livraison, 'YYYY-MM-DD') as date from public.commandes where id = $1",
      [r.commande_id],
    );
    expect(co).toEqual({ source: "client", client_id: alice, notes: "Sonner fort", date: demain });

    const r2 = await passer(compteAlice, {
      lignes: [
        { article_id: p50, quantite: 2 },
        { article_id: sup1, quantite: 1 },
      ],
    });
    expect(r2).toMatchObject({ commande_id: r.commande_id, nouvelle: false });
    const lignes = await sql<{ article_id: string; quantite: number }>(
      "select article_id, quantite from public.lignes_commande where commande_id = $1 order by quantite desc",
      [r.commande_id],
    );
    expect(lignes).toEqual([
      { article_id: p50, quantite: 2 },
      { article_id: sup1, quantite: 1 },
    ]);
    expect((await situation(compteAlice)).commande_id).toBe(r.commande_id);
  });

  it("refuse une commande sans panier sous 30 € ou avec un article retiré", async () => {
    expect(await erreur(passer(compteAlice, { lignes: [{ article_id: sup1, quantite: 5 }] }))).toBe("PN002");
    // Sans panier, à partir de 30 € de suppléments : accepté
    const r = await passer(compteAlice, { lignes: [{ article_id: sup1, quantite: 6 }] });
    expect(r.commande_id).toBeTruthy();
    await passer(compteAlice, { lignes: panier30() });
    expect(
      await erreur(passer(compteAlice, { lignes: [...panier30(), { article_id: supInactif, quantite: 1 }] })),
    ).toBe("PN004");
  });

  it("annule jusqu'à la clôture, puis peut recommander", async () => {
    const { commande_id } = await passer(compteAlice, { lignes: panier30() });
    await comme(compteAlice, (c) => c.query("select public.annuler_ma_commande($1)", [commande_id]));
    const [co] = await sql<{ statut: string }>("select statut from public.commandes where id = $1", [commande_id]);
    expect(co.statut).toBe("annulee");
    expect((await situation(compteAlice)).commande_id).toBeNull();
    const r = await passer(compteAlice, { lignes: panier30() });
    expect(r.nouvelle).toBe(true);
  });

  it("après la clôture : plus d'annulation, la commande suivante est pour la semaine d'après", async () => {
    const { commande_id } = await passer(compteBob, { lignes: panier30() });
    await cloture("00:00");
    try {
      expect(await erreur(comme(compteBob, (c) => c.query("select public.annuler_ma_commande($1)", [commande_id])))).toBe(
        "PN036",
      );
      expect((await situation(compteBob)).prochaine_livraison).toBe(dansHuitJours);
      const r = await passer(compteBob, { lignes: panier30() });
      expect(r).toMatchObject({ nouvelle: true, date_livraison: dansHuitJours });
    } finally {
      await cloture("23:59:59");
    }
  });

  it("une commande saisie par l'équipe se modifie aussi en ligne (elle reste « équipe »)", async () => {
    const fiche = await creerClient(base.client, secteur);
    await sql("update public.clients set email = 'dora@exemple.fr' where id = $1", [fiche]);
    const compte = await creerCompteEnLigne(base.client, "dora@exemple.fr");
    await situation(compte);
    const id = await comme(admin, (c) => enregistrerCommande(c, { clientId: fiche, date: demain, lignes: panier30() }));
    const r = await passer(compte, { lignes: panier30(2) });
    expect(r).toMatchObject({ commande_id: id, nouvelle: false });
    const [co] = await sql<{ source: string }>("select source from public.commandes where id = $1", [id]);
    expect(co.source).toBe("equipe");
  });

  it("refuse une commande livrée, des commandes fermées ou un compte suspendu", async () => {
    const fiche = await creerClient(base.client, secteur);
    await sql("update public.clients set email = 'eric@exemple.fr' where id = $1", [fiche]);
    const compte = await creerCompteEnLigne(base.client, "eric@exemple.fr");
    await situation(compte);
    const { commande_id } = await passer(compte, { lignes: panier30() });
    await comme(admin, (c) => c.query("select public.changer_statut_commande($1, 'livree')", [commande_id]));
    expect(await erreur(passer(compte, { lignes: panier30(2) }))).toBe("PN034");

    await sql("update public.parametres_commandes set commandes_ouvertes = false");
    try {
      expect(await erreur(passer(compteAlice, { lignes: panier30() }))).toBe("PN032");
    } finally {
      await sql("update public.parametres_commandes set commandes_ouvertes = true");
    }

    await sql("update public.clients set actif = false where id = $1", [fiche]);
    expect(await erreur(passer(compte, { lignes: panier30() }))).toBe("PN031");
  });
});

describe("récompenses en ligne", () => {
  let fiche: string;
  let compte: string;

  beforeAll(async () => {
    fiche = await creerClient(base.client, secteur);
    await sql("update public.clients set email = 'fanny@exemple.fr' where id = $1", [fiche]);
    compte = await creerCompteEnLigne(base.client, "fanny@exemple.fr");
    await situation(compte);
    await sql("insert into public.tampons (client_id, quantite, motif) values ($1, 11, 'ajustement')", [fiche]);
  });

  it("applique les règles : nombre de suppléments, suppléments actifs, niveau, solde", async () => {
    const cas: [NouvelleRecompense, string][] = [
      [{ recompense_id: recSupplement, articles: [{ article_id: sup1, quantite: 2 }] }, "PN035"],
      [{ recompense_id: recSupplement, articles: [{ article_id: p30, quantite: 1 }] }, "PN035"],
      [{ recompense_id: recSupplement, articles: [{ article_id: supInactif, quantite: 1 }] }, "PN035"],
      [{ recompense_id: recSupplement, articles: [] }, "PN035"],
      [{ recompense_id: recPanier30 }, "PN021"],
      [{ recompense_id: recOeufs, articles: [{ article_id: oeufs, quantite: 1 }] }, "PN024"],
      [{ recompense_id: recConfiture, articles: [{ article_id: confiture, quantite: 1 }] }, "PN024"],
    ];
    for (const [nouvelle, code] of cas) {
      expect(await erreur(passer(compte, { lignes: panier30(), nouvelles: [nouvelle] })), JSON.stringify(nouvelle)).toBe(
        code,
      );
    }
    expect(
      await erreur(
        passer(compte, {
          lignes: panier30(),
          nouvelles: [
            { recompense_id: recConfitureSupplement, articles: [{ article_id: confiture, quantite: 1 }, { article_id: sup1, quantite: 1 }] },
            { recompense_id: recSupplement, articles: [{ article_id: sup2, quantite: 1 }] },
          ],
        }),
      ),
    ).toBe("PN020");
  });

  it("utilise, garde puis rend une récompense", async () => {
    const r = await passer(compte, {
      lignes: panier30(),
      nouvelles: [
        { recompense_id: recConfitureSupplement, articles: [{ article_id: confiture, quantite: 1 }, { article_id: sup1, quantite: 1 }] },
      ],
    });
    expect(await solde(fiche)).toBe(1 + 11 - 10);
    const [u] = await sql<{ id: string }>("select id from public.recompenses_utilisees where commande_id = $1", [r.commande_id]);
    const cadeaux = await sql<{ article_id: string }>(
      "select article_id from public.cadeaux where utilisation_id = $1 order by libelle",
      [u.id],
    );
    expect(cadeaux.map((x) => x.article_id).sort()).toEqual([confiture, sup1].sort());

    // Modification en gardant la récompense
    await passer(compte, { lignes: panier30(2), gardees: [u.id] });
    expect(await solde(fiche)).toBe(2);
    expect(await sql("select 1 from public.cadeaux where utilisation_id = $1", [u.id])).toHaveLength(2);

    // Modification sans la garder : tampons rendus
    await passer(compte, { lignes: panier30() });
    expect(await solde(fiche)).toBe(12);
  });

  it("ajoute tout seul les œufs à la première commande d'un filleul", async () => {
    const filleul = await creerClient(base.client, secteur, { parrainId: alice });
    await sql("update public.clients set email = 'gael@exemple.fr' where id = $1", [filleul]);
    const compteFilleul = await creerCompteEnLigne(base.client, "gael@exemple.fr");
    await situation(compteFilleul);
    const r = await passer(compteFilleul, { lignes: panier30() });
    const utilisations = await sql<{ type: string; article_id: string }>(
      `select ru.type, ca.article_id from public.recompenses_utilisees ru
       join public.cadeaux ca on ca.utilisation_id = ru.id where ru.commande_id = $1`,
      [r.commande_id],
    );
    expect(utilisations).toEqual([{ type: "bienvenue_filleul", article_id: oeufs }]);
    // Une modification ne le double pas
    await passer(compteFilleul, { lignes: panier30(2) });
    expect(await sql("select 1 from public.recompenses_utilisees where commande_id = $1", [r.commande_id])).toHaveLength(1);
  });

  it("ajoute la confiture due au parrain quand son article est réglé", async () => {
    // Alice a un filleul qui vient de commander (test précédent)
    const sansArticle = await passer(compteAlice, { lignes: panier30() });
    expect(
      await sql("select 1 from public.recompenses_utilisees where commande_id = $1 and type = 'cadeau_parrain'", [
        sansArticle.commande_id,
      ]),
    ).toHaveLength(0);

    await sql("update public.recompenses set article_id = $1 where id = $2", [confiture, recConfiture]);
    const r = await passer(compteAlice, { lignes: panier30() });
    expect(
      await sql("select 1 from public.recompenses_utilisees where commande_id = $1 and type = 'cadeau_parrain'", [
        r.commande_id,
      ]),
    ).toHaveLength(1);
  });

  it("sa carte de fidélité compte ses filleuls, que la RLS lui cache", async () => {
    await sql("update public.parametres_fidelite set filleuls_vip = 1, filleuls_livres_seulement = false");
    try {
      const f = await comme(compteAlice, async (c) => (await c.query("select public.ma_fidelite() as f")).rows[0].f);
      expect(f.niveau).toBe("vip");
      expect(f.filleuls).toEqual([{ prenom: "Test", initiale: "C", livre: false }]);
      const vue = await comme(compteAlice, async (c) => (await c.query("select niveau from public.fidelite_clients")).rows);
      expect(vue).toEqual([{ niveau: "standard" }]);
    } finally {
      await sql("update public.parametres_fidelite set filleuls_vip = 5, filleuls_livres_seulement = true");
    }
  });
});

describe("inscription d'un nouveau client", () => {
  const formulaire = [
    "Hélène",
    "Nouvelle",
    "+33612345678",
    "4 Rue Neuve",
    null,
    "83000",
    "Toulon",
    "83137",
    43.12,
    5.93,
    "Portail vert",
    "Alice",
  ];
  const envoyer = (userId: string, valeurs: unknown[] = formulaire) =>
    comme(userId, (c) => c.query("select public.envoyer_inscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", valeurs));

  it("envoie, corrige, puis l'administrateur valide : fiche créée et reliée", async () => {
    const compte = await creerCompteEnLigne(base.client, "helene@exemple.fr");
    expect((await situation(compte)).etat).toBe("nouveau");
    await envoyer(compte);
    expect((await situation(compte)).etat).toBe("en_attente");
    await envoyer(compte, formulaire.map((v, i) => (i === 3 ? "5 Rue Neuve" : v)));
    const [i] = await comme(compte, async (c) => (await c.query("select email, adresse from public.inscriptions")).rows);
    expect(i).toEqual({ email: "helene@exemple.fr", adresse: "5 Rue Neuve" });

    expect(
      await erreur(comme(livreur, (c) => c.query("select public.valider_inscription($1, $2)", [compte, secteur]))),
    ).toBe("42501");
    expect(await erreur(comme(admin, (c) => c.query("select public.valider_inscription($1)", [compte])))).toBe("PN045");

    const [{ id }] = await comme(admin, async (c) =>
      (await c.query("select public.valider_inscription($1, $2, null, $3) as id", [compte, secteur, alice])).rows,
    );
    const [fiche] = await sql<Record<string, unknown>>(
      "select nom, prenom, email, telephone, adresse, secteur_id, parrain_id, notes_livraison, source_position from public.clients where id = $1",
      [id],
    );
    expect(fiche).toEqual({
      nom: "Nouvelle",
      prenom: "Hélène",
      email: "helene@exemple.fr",
      telephone: "+33612345678",
      adresse: "5 Rue Neuve",
      secteur_id: secteur,
      parrain_id: alice,
      notes_livraison: "Portail vert",
      source_position: "adresse",
    });
    expect(await sql("select 1 from public.inscriptions where user_id = $1", [compte])).toHaveLength(0);
    expect((await situation(compte)).etat).toBe("client");
    expect(await sql("select 1 from public.tampons where client_id = $1 and motif = 'bienvenue'", [id])).toHaveLength(1);
    expect(await erreur(envoyer(compte))).toBe("PN043");
  });

  it("peut relier l'inscription à une fiche existante", async () => {
    const existante = await creerClient(base.client, secteur);
    const compte = await creerCompteEnLigne(base.client, "ines@exemple.fr");
    await envoyer(compte);
    await comme(admin, (c) => c.query("select public.valider_inscription($1, null, $2)", [compte, existante]));
    const [f] = await sql<{ email: string }>("select email from public.clients where id = $1", [existante]);
    expect(f.email).toBe("ines@exemple.fr");
    expect((await situation(compte)).client_id).toBe(existante);

    const autre = await creerCompteEnLigne(base.client, "intrus@exemple.fr");
    await envoyer(autre);
    expect(
      await erreur(comme(admin, (c) => c.query("select public.valider_inscription($1, null, $2)", [autre, existante]))),
    ).toBe("PN042");
  });

  it("une inscription refusée ne peut plus être renvoyée", async () => {
    const compte = await creerCompteEnLigne(base.client, "jules@exemple.fr");
    await envoyer(compte);
    await comme(admin, (c) => c.query("update public.inscriptions set statut = 'refusee' where user_id = $1", [compte]));
    expect((await situation(compte)).etat).toBe("refusee");
    expect(await erreur(envoyer(compte))).toBe("PN044");
  });

  it("un compte en attente ne peut pas commander et ne voit que sa propre inscription", async () => {
    const compte = await creerCompteEnLigne(base.client, "karim@exemple.fr");
    await envoyer(compte);
    expect(await erreur(passer(compte, { lignes: panier30() }))).toBe("PN030");
    const lignes = await comme(compte, async (c) => (await c.query("select user_id from public.inscriptions")).rows);
    expect(lignes).toEqual([{ user_id: compte }]);
  });
});

describe("coordonnées et suppression du compte (RGPD)", () => {
  it("modifie son téléphone et ses consignes, avec un téléphone valide", async () => {
    await comme(compteAlice, (c) =>
      c.query("select public.modifier_mes_coordonnees($1, $2)", ["+33698765432", " Code 1234 "]),
    );
    const [f] = await sql<{ telephone: string; notes_livraison: string }>(
      "select telephone, notes_livraison from public.clients where id = $1",
      [alice],
    );
    expect(f).toEqual({ telephone: "+33698765432", notes_livraison: "Code 1234" });
    expect(
      await erreur(comme(compteAlice, (c) => c.query("select public.modifier_mes_coordonnees($1, null)", ["0612"]))),
    ).toBe("23514");
  });

  it("supprime son compte, sa fiche et ses commandes", async () => {
    const fiche = await creerClient(base.client, secteur);
    await sql("update public.clients set email = 'luc@exemple.fr' where id = $1", [fiche]);
    const compte = await creerCompteEnLigne(base.client, "luc@exemple.fr");
    await situation(compte);
    const { commande_id } = await passer(compte, { lignes: panier30() });

    await comme(compte, (c) => c.query("select public.supprimer_mon_compte()"));
    expect(await sql("select 1 from public.clients where id = $1", [fiche])).toHaveLength(0);
    expect(await sql("select 1 from public.commandes where id = $1", [commande_id])).toHaveLength(0);
    expect(await sql("select 1 from auth.users where id = $1", [compte])).toHaveLength(0);
  });

  it("un compte de l'équipe ne se supprime pas ainsi", async () => {
    expect(await erreur(comme(admin, (c) => c.query("select public.supprimer_mon_compte()")))).toBe("PN046");
  });
});

describe("composition des paniers et paramètres", () => {
  it("l'administrateur saisit la composition, les clients la lisent", async () => {
    await comme(admin, (c) =>
      c.query(
        "insert into public.compositions (semaine, article_id, contenu) values (date_trunc('week', $1::date)::date, $2, $3)",
        [demain, p30, "1 kg de tomates\n1 salade"],
      ),
    );
    const lues = await comme(compteAlice, async (c) => (await c.query("select contenu from public.compositions")).rows);
    expect(lues).toEqual([{ contenu: "1 kg de tomates\n1 salade" }]);
    expect(
      await erreur(
        comme(admin, (c) =>
          c.query("insert into public.compositions (semaine, article_id, contenu) values ('2026-11-10', $1, 'x')", [p50]),
        ),
      ),
    ).toBe("23514");
  });

  it("le visiteur anonyme n'a accès à rien de nouveau", async () => {
    for (const table of ["parametres_commandes", "compositions", "comptes_clients", "inscriptions"]) {
      expect(await erreur(en(base.client, { role: "anon" }, (c) => c.query(`select * from public.${table}`)))).toBe("42501");
    }
    expect(await erreur(en(base.client, { role: "anon" }, (c) => c.query("select public.ma_situation()")))).toBe("42501");
  });
});
