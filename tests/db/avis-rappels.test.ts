import type { ClientBase } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codeErreur, creerBaseDeTest, creerCompte, creerCompteEnLigne, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

/** Avis après livraison, annonce des paniers, rappels automatiques du jeudi. */

let base: BaseDeTest;
let admin: string;
let livreur: string;
let secteur: string;
let p30: string;
let demain: string;
let jourAujourdhui: number;
let jeton: string;

const comme = <T>(userId: string, fn: (c: ClientBase) => Promise<T>) =>
  en(base.client, { role: "authenticated", userId }, fn);
const anonyme = <T>(fn: (c: ClientBase) => Promise<T>) => en(base.client, { role: "anon" }, fn);

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

/** Client avec compte en ligne (et éventuellement un téléphone abonné) */
async function client(email: string, abonne = true) {
  const id = await creerClient(base.client, secteur);
  await sql("update public.clients set email = $1 where id = $2", [email, id]);
  const compte = await creerCompteEnLigne(base.client, email);
  await comme(compte, (c) => c.query("select public.ma_situation()"));
  if (abonne) {
    await comme(compte, (c) =>
      c.query("select public.enregistrer_abonnement_push($1, $2, $3)", [`https://push.exemple/${email}`, "B".repeat(87), "A".repeat(22)]),
    );
  }
  return { id, compte };
}

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  livreur = await creerCompte(base.client, "livreur");
  const [d] = await sql<{ demain: string; jour_ajd: number; jour_demain: number }>(`
    select to_char(j + 1, 'YYYY-MM-DD') as demain, extract(isodow from j)::integer as jour_ajd,
           extract(isodow from j + 1)::integer as jour_demain
    from (select (now() at time zone 'Europe/Paris')::date as j) x`);
  demain = d.demain;
  jourAujourdhui = d.jour_ajd;
  secteur = await creerSecteur(base.client, { jour: d.jour_demain });
  // Livraison demain, clôture aujourd'hui en fin de journée : dans moins de 48 h
  await sql("update public.parametres_commandes set cloture_jour = $1, cloture_heure = '23:59:59'", [jourAujourdhui]);
  p30 = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
  [{ jeton }] = await sql<{ jeton: string }>("select jeton from prive.parametres_robot");
});

afterAll(async () => {
  await base?.detruire();
});

describe("avis après livraison", () => {
  it("le client donne son avis sur sa commande livrée, l'équipe le lit et le traite", async () => {
    const { id, compte } = await client("avis@exemple.fr", false);
    const commande = await enregistrerCommande(base.client, { clientId: id, date: demain, lignes: [{ article_id: p30, quantite: 1 }] });
    const donner = (userId: string, note: number | null, texte: string | null) =>
      comme(userId, (c) => c.query("select public.donner_mon_avis($1, $2::smallint, $3)", [commande, note, texte]));

    expect(await erreur(donner(compte, 4, "Bien"))).toBe("PN050");
    await sql("select public.changer_statut_commande($1, 'livree')", [commande]);
    expect(await erreur(donner(compte, null, "  "))).toBe("PN052");
    expect(await erreur(donner(compte, 6, null))).toBe("23514");

    await donner(compte, 2, " Une salade abîmée ");
    await comme(admin, (c) => c.query("select public.traiter_avis($1, true)", [commande]));
    const [traite] = await sql<{ traite_le: Date | null }>("select traite_le from public.avis_livraison where commande_id = $1", [commande]);
    expect(traite.traite_le).not.toBeNull();

    // Corriger son avis le remet à traiter
    await donner(compte, 3, "Finalement correct");
    const [avis] = await sql<{ note: number; commentaire: string; traite_le: Date | null }>(
      "select note, commentaire, traite_le from public.avis_livraison where commande_id = $1",
      [commande],
    );
    expect(avis).toEqual({ note: 3, commentaire: "Finalement correct", traite_le: null });

    // Un autre client ne peut ni le lire ni en donner un
    const autre = await client("autre-avis@exemple.fr", false);
    expect(await erreur(donner(autre.compte, 5, "Je triche"))).toBe("PN006");
    const vus = await comme(autre.compte, async (c) => (await c.query("select 1 from public.avis_livraison")).rows);
    expect(vus).toEqual([]);
    const vusEquipe = await comme(admin, async (c) => (await c.query("select note from public.avis_livraison")).rows);
    expect(vusEquipe).toEqual([{ note: 3 }]);
    // Les avis ne concernent pas le livreur
    expect(await comme(livreur, async (c) => (await c.query("select note from public.avis_livraison")).rows)).toEqual([]);
    expect(await erreur(comme(livreur, (c) => c.query("select public.traiter_avis($1, true)", [commande])))).toBe("42501");

    // Une livraison de plus d'un mois
    await sql("update public.commandes set livree_le = now() - interval '40 days' where id = $1", [commande]);
    expect(await erreur(donner(compte, 5, "Tard"))).toBe("PN051");
  });
});

describe("annonce de la composition", () => {
  it("une seule fois par semaine, par l'administrateur", async () => {
    const reserver = (userId: string) =>
      comme(userId, async (c) => (await c.query("select public.reserver_annonce('2026-11-09') as ok")).rows[0].ok);
    expect(await reserver(admin)).toBe(true);
    expect(await reserver(admin)).toBe(false);
    expect(await erreur(reserver(livreur))).toBe("42501");
  });

  it("l'équipe retrouve les téléphones des clients actifs", async () => {
    const { id } = await client("annonce@exemple.fr");
    const inactif = await client("inactif@exemple.fr");
    await sql("update public.clients set actif = false where id = $1", [inactif.id]);
    const lignes = await comme(admin, async (c) => (await c.query("select client_id from public.abonnements_clients_actifs()")).rows);
    // Envoyer à tous les clients : administrateur seulement
    expect(await erreur(comme(livreur, (c) => c.query("select * from public.abonnements_clients_actifs()")))).toBe("42501");
    expect(lignes.map((l) => l.client_id)).toContain(id);
    expect(lignes.map((l) => l.client_id)).not.toContain(inactif.id);
    const { compte } = await client("curieux@exemple.fr", false);
    expect(await erreur(comme(compte, (c) => c.query("select * from public.abonnements_clients_actifs()")))).toBe("42501");
  });
});

describe("rappels automatiques", () => {
  const rappels = (j: string, moment = "midi") =>
    anonyme(async (c) => (await c.query("select client_id, date_livraison::text as date from public.rappels_a_envoyer($1, $2)", [j, moment])).rows);

  it("seulement les clients abonnés et actifs sans commande, une fois par moment", async () => {
    const sansCommande = await client("rappel@exemple.fr");
    const avecCommande = await client("deja@exemple.fr");
    await enregistrerCommande(base.client, { clientId: avecCommande.id, date: demain, lignes: [{ article_id: p30, quantite: 1 }] });
    const nonAbonne = await client("muet@exemple.fr", false);

    const premiers = await rappels(jeton);
    const ids = premiers.map((r) => r.client_id);
    expect(ids).toContain(sansCommande.id);
    expect(ids).not.toContain(avecCommande.id);
    expect(ids).not.toContain(nonAbonne.id);
    expect(premiers.find((r) => r.client_id === sansCommande.id)?.date).toBe(demain);

    expect((await rappels(jeton)).map((r) => r.client_id)).not.toContain(sansCommande.id);
    expect((await rappels(jeton, "soir")).map((r) => r.client_id)).toContain(sansCommande.id);
  });

  it("rien quand les commandes sont fermées ou la clôture lointaine", async () => {
    const loin = await client("loin@exemple.fr");
    await sql("update public.parametres_commandes set commandes_ouvertes = false");
    expect(await rappels(jeton, "midi")).toEqual([]);
    await sql("update public.parametres_commandes set commandes_ouvertes = true");
    // Clôture repoussée : livraison de demain fermée, la suivante clôt dans 7 jours
    await sql("update public.parametres_commandes set cloture_heure = '00:00'");
    try {
      expect((await rappels(jeton, "midi")).map((r) => r.client_id)).not.toContain(loin.id);
    } finally {
      await sql("update public.parametres_commandes set cloture_heure = '23:59:59'");
    }
  });

  it("protégés par le jeton secret ; le reste du schéma privé reste fermé aux visiteurs", async () => {
    expect(await erreur(rappels("faux-jeton-".repeat(5)))).toBe("42501");
    expect(await erreur(anonyme((c) => c.query("select public.cles_push_robot('x')")))).toBe("42501");
    for (const f of [
      "prive.est_admin()",
      "prive.est_equipe()",
      "prive.mon_client_id()",
      "prive.ma_situation()",
      "prive.cles_push()",
      "prive.declencher_rappels()",
      "prive.noter_url_site('https://x.fr')",
    ]) {
      expect(await erreur(anonyme((c) => c.query(`select ${f}`))), f).toBe("42501");
    }
    expect(await erreur(anonyme((c) => c.query("select * from prive.parametres_robot")))).toBe("42501");
    expect(await erreur(comme(admin, (c) => c.query("select * from prive.parametres_robot")))).toBe("42501");
  });

  it("l'équipe note l'adresse publique du site (https seulement)", async () => {
    await comme(livreur, (c) => c.query("select public.noter_url_site('http://localhost:3000')"));
    expect((await sql<{ url_site: string | null }>("select url_site from prive.parametres_robot"))[0].url_site).toBeNull();
    await comme(livreur, (c) => c.query("select public.noter_url_site('https://fraisetfrancais.fr')"));
    expect((await sql<{ url_site: string }>("select url_site from prive.parametres_robot"))[0].url_site).toBe("https://fraisetfrancais.fr");
    const { compte } = await client("pirate@exemple.fr", false);
    expect(await erreur(comme(compte, (c) => c.query("select public.noter_url_site('https://pirate.fr')")))).toBe("42501");
  });
});
