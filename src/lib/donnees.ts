import "server-only";
import { notFound } from "next/navigation";
import { clientSupabase } from "@/lib/supabase/serveur";
import { comparerSecteurs } from "@/lib/domaine/secteurs";
import type { DateIso } from "@/lib/domaine/dates";
import type { FideliteSaisie } from "@/lib/domaine/fidelite";

/**
 * Lectures de la base, faites avec la session de l'utilisateur (RLS appliquée).
 * Les erreurs inattendues remontent à la page d'erreur.
 */

type Reponse = { data: unknown; error: { message: string } | null };

/** Liste : sans erreur, la base renvoie toujours un tableau. */
function verifier<R extends Reponse>(resultat: R): NonNullable<R["data"]> {
  if (resultat.error) throw new Error(resultat.error.message);
  return resultat.data as NonNullable<R["data"]>;
}

/** Ligne unique éventuelle (maybeSingle). */
function verifierOuNull<R extends Reponse>(resultat: R): R["data"] | null {
  if (resultat.error) throw new Error(resultat.error.message);
  return resultat.data;
}

export async function listerSecteurs() {
  const supabase = await clientSupabase();
  const secteurs = verifier(
    await supabase.from("secteurs").select("*, communes:secteur_communes(code_insee, nom)").order("nom"),
  );
  return secteurs
    .map((s) => ({ ...s, communes: [...s.communes].sort((a, b) => a.nom.localeCompare(b.nom, "fr")) }))
    .sort(comparerSecteurs);
}
export type SecteurAvecCommunes = Awaited<ReturnType<typeof listerSecteurs>>[number];

export async function lireSecteur(id: string) {
  const supabase = await clientSupabase();
  const secteur = verifierOuNull(
    await supabase
      .from("secteurs")
      .select("*, communes:secteur_communes(code_insee, nom)")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!secteur) notFound();
  return secteur;
}

export async function compterClientsParSecteur(): Promise<Record<string, number>> {
  const supabase = await clientSupabase();
  const lignes = verifier(await supabase.from("clients").select("secteur_id"));
  const comptes: Record<string, number> = {};
  for (const l of lignes) comptes[l.secteur_id] = (comptes[l.secteur_id] ?? 0) + 1;
  return comptes;
}

const CHAMPS_LISTE_CLIENT = "id, nom, prenom, telephone, adresse, code_postal, commune, secteur_id, actif" as const;

export async function listerClients() {
  const supabase = await clientSupabase();
  return verifier(await supabase.from("clients").select(CHAMPS_LISTE_CLIENT).order("nom").order("prenom"));
}
export type ClientListe = Awaited<ReturnType<typeof listerClients>>[number];

export async function lireClient(id: string) {
  const supabase = await clientSupabase();
  const client = verifierOuNull(await supabase.from("clients").select("*").eq("id", id).maybeSingle());
  if (!client) notFound();

  const [parrain, filleuls, commandes] = await Promise.all([
    client.parrain_id
      ? supabase.from("clients").select("id, nom, prenom, commune").eq("id", client.parrain_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("clients").select("id, nom, prenom, commune, actif").eq("parrain_id", id).order("nom"),
    supabase
      .from("commandes")
      .select(
        "id, date_livraison, statut, livree_le, lignes:lignes_commande(article_id, libelle, categorie, quantite, prix_unitaire_centimes), recompenses:recompenses_utilisees(id, nom, cout_tampons)",
      )
      .eq("client_id", id)
      .order("date_livraison", { ascending: false })
      .limit(20),
  ]);

  return {
    client,
    parrain: verifierOuNull(parrain),
    filleuls: verifier(filleuls),
    commandes: verifier(commandes),
  };
}

/** Carte de fidélité d'un client : solde, niveau et historique complet. */
export async function lireFideliteClient(clientId: string) {
  const supabase = await clientSupabase();
  const [resume, gains, depenses, confitures] = await Promise.all([
    supabase.from("fidelite_clients").select("*").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("tampons")
      .select(
        "id, quantite, motif, note, created_at, commande:commandes(date_livraison), filleul:clients!tampons_filleul_id_fkey(prenom, nom)",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("commandes")
      .select("id, date_livraison, statut, recompenses:recompenses_utilisees(id, nom, cout_tampons, type, created_at)")
      .eq("client_id", clientId),
    supabase
      .from("confitures_parrain_dues")
      .select("filleul_id, filleul_prenom, filleul_nom, premiere_commande")
      .eq("client_id", clientId)
      .order("premiere_commande"),
  ]);

  const r = verifierOuNull(resume);
  return {
    solde: r?.solde ?? 0,
    gagnes: r?.tampons_gagnes ?? 0,
    utilises: r?.tampons_utilises ?? 0,
    filleuls: r?.filleuls ?? 0,
    filleulsComptes: r?.filleuls_comptes ?? 0,
    niveau: r?.niveau ?? "standard",
    filleul: Boolean(r?.parrain_id),
    commandesNonAnnulees: r?.commandes_non_annulees ?? 0,
    confituresDues: verifier(confitures),
    gains: verifier(gains),
    depenses: verifier(depenses).flatMap((c) =>
      c.recompenses.map((ru) => ({ ...ru, commande_id: c.id, date_livraison: c.date_livraison, statut: c.statut })),
    ),
  };
}
export type FideliteClient = Awaited<ReturnType<typeof lireFideliteClient>>;

/** Solde, niveau et cadeaux de parrainage de tous les clients (pour la saisie des commandes). */
/** Solde de chaque client qui en a un : + dû, − avoir (centimes). */
export async function listerSoldes(): Promise<Record<string, number>> {
  const supabase = await clientSupabase();
  const lignes = verifier(await supabase.from("soldes_clients").select("client_id, solde_centimes"));
  return Object.fromEntries(
    lignes.flatMap((l) => (l.client_id && l.solde_centimes ? [[l.client_id, l.solde_centimes]] : [])),
  );
}

export async function listerFidelite() {
  const supabase = await clientSupabase();
  const lignes = verifier(
    await supabase
      .from("fidelite_clients")
      .select("client_id, solde, niveau, parrain_id, commandes_non_annulees, confitures_dues"),
  );
  const parClient: Record<string, FideliteSaisie> = {};
  for (const l of lignes) {
    if (!l.client_id) continue;
    parClient[l.client_id] = {
      solde: l.solde ?? 0,
      niveau: l.niveau ?? "standard",
      filleul: Boolean(l.parrain_id),
      commandes: l.commandes_non_annulees ?? 0,
      confitures: l.confitures_dues ?? 0,
    };
  }
  return parClient;
}

export async function listerRecompenses(options: { actifsSeulement?: boolean } = {}) {
  const supabase = await clientSupabase();
  let requete = supabase.from("recompenses").select("*").order("ordre").order("cout_tampons");
  if (options.actifsSeulement) requete = requete.eq("actif", true);
  return verifier(await requete);
}
export type Recompense = Awaited<ReturnType<typeof listerRecompenses>>[number];

export async function lireParametresFidelite() {
  const supabase = await clientSupabase();
  const p = verifierOuNull(await supabase.from("parametres_fidelite").select("*").maybeSingle());
  if (!p) throw new Error("Paramètres de fidélité introuvables : la migration fidélité est-elle appliquée ?");
  return p;
}

export async function listerArticles(options: { actifsSeulement?: boolean } = {}) {
  const supabase = await clientSupabase();
  let requete = supabase.from("articles").select("*").order("categorie").order("ordre").order("nom");
  if (options.actifsSeulement) requete = requete.eq("actif", true);
  return verifier(await requete);
}
export type Article = Awaited<ReturnType<typeof listerArticles>>[number];

const CHAMPS_COMMANDE = `id, client_id, date_livraison, statut, livree_le, notes, source, secteur_id, payee,
  client:clients(id, nom, prenom, adresse, complement_adresse, code_postal, commune, telephone, secteur_id, notes_livraison, actif),
  lignes:lignes_commande(article_id, libelle, categorie, quantite, prix_unitaire_centimes),
  recompenses:recompenses_utilisees(id, recompense_id, nom, cout_tampons, cadeaux(article_id, libelle, categorie, quantite))` as const;

export async function listerCommandes(du: DateIso, au: DateIso) {
  const supabase = await clientSupabase();
  return verifier(
    await supabase
      .from("commandes")
      .select(CHAMPS_COMMANDE)
      .gte("date_livraison", du)
      .lte("date_livraison", au)
      .order("date_livraison"),
  );
}
export type CommandeDetaillee = Awaited<ReturnType<typeof listerCommandes>>[number];

export async function lireCommande(id: string) {
  const supabase = await clientSupabase();
  const commande = verifierOuNull(
    await supabase.from("commandes").select(CHAMPS_COMMANDE).eq("id", id).maybeSingle(),
  );
  if (!commande) notFound();
  return commande;
}

/** Commande (non annulée) d'un client pour la semaine commençant le lundi donné. */
export async function commandeDeLaSemaine(clientId: string, lundi: DateIso) {
  const supabase = await clientSupabase();
  return verifierOuNull(
    await supabase
      .from("commandes")
      .select("id, date_livraison")
      .eq("client_id", clientId)
      .eq("semaine", lundi)
      .neq("statut", "annulee")
      .maybeSingle(),
  );
}

export async function compterCommandesClient(clientId: string): Promise<number> {
  const supabase = await clientSupabase();
  const { count, error } = await supabase
    .from("commandes")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const CHAMPS_TOURNEE = `id, date_livraison, statut, livree_le, notes, ordre_tournee, secteur_id, payee, montant_recu_centimes, mode_paiement,
  client:clients(id, nom, prenom, adresse, complement_adresse, code_postal, commune, telephone, secteur_id, notes_livraison, lat, lng),
  lignes:lignes_commande(article_id, libelle, categorie, quantite, prix_unitaire_centimes),
  recompenses:recompenses_utilisees(id, nom, cadeaux(article_id, libelle, categorie, quantite))` as const;

/** Commandes (non annulées) d'un jour de livraison, pour les tournées. */
export async function listerCommandesDuJour(date: DateIso) {
  const supabase = await clientSupabase();
  return verifier(
    await supabase
      .from("commandes")
      .select(CHAMPS_TOURNEE)
      .eq("date_livraison", date)
      .neq("statut", "annulee")
      .order("ordre_tournee", { ascending: true, nullsFirst: false }),
  );
}
export type CommandeTournee = Awaited<ReturnType<typeof listerCommandesDuJour>>[number];

/** La fiche est-elle reliée à un compte client en ligne ? */
export async function aUnCompteEnLigne(clientId: string): Promise<boolean> {
  const supabase = await clientSupabase();
  const { count, error } = await supabase
    .from("comptes_clients")
    .select("user_id", { count: "exact", head: true })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Nombre de téléphones du client abonnés aux notifications (équipe). */
export async function compterTelephonesNotifies(clientId: string): Promise<number> {
  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("abonnements_du_client", { p_client_id: clientId });
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Avis du client sur une commande (équipe), ou null. */
export async function lireAvisCommande(commandeId: string) {
  const supabase = await clientSupabase();
  return verifierOuNull(
    await supabase
      .from("avis_livraison")
      .select("note, commentaire, traite_le")
      .eq("commande_id", commandeId)
      .maybeSingle(),
  );
}

/**
 * Ce que chaque client devait avant ces commandes (+ = dû, − = avoir) :
 * son compte, sans les mouvements des commandes données.
 */
export async function soldesAvant(clientIds: string[], commandeIds: string[]): Promise<Map<string, number>> {
  const resultat = new Map<string, number>();
  if (!clientIds.length) return resultat;
  const supabase = await clientSupabase();
  const lignes = verifier(
    await supabase.from("mouvements_compte").select("client_id, commande_id, montant_centimes").in("client_id", clientIds),
  );
  const exclues = new Set(commandeIds);
  for (const l of lignes) {
    if (l.commande_id && exclues.has(l.commande_id)) continue;
    resultat.set(l.client_id, (resultat.get(l.client_id) ?? 0) + l.montant_centimes);
  }
  return resultat;
}

/** Compte d'un client : solde et derniers mouvements. */
export async function lireCompteClient(clientId: string) {
  const supabase = await clientSupabase();
  const mouvements = verifier(
    await supabase
      .from("mouvements_compte")
      .select("id, montant_centimes, motif, mode_paiement, note, created_at, commande_id, commande:commandes(date_livraison)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  );
  return { solde: mouvements.reduce((t, m) => t + m.montant_centimes, 0), mouvements: mouvements.slice(0, 15) };
}
