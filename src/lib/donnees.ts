import "server-only";
import { notFound } from "next/navigation";
import { clientSupabase } from "@/lib/supabase/serveur";
import { comparerSecteurs } from "@/lib/domaine/secteurs";
import type { DateIso } from "@/lib/domaine/dates";

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
  const [resume, gains, depenses] = await Promise.all([
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
      .select("id, date_livraison, statut, recompenses:recompenses_utilisees(id, nom, cout_tampons, created_at)")
      .eq("client_id", clientId),
  ]);

  const r = verifierOuNull(resume);
  return {
    solde: r?.solde ?? 0,
    gagnes: r?.tampons_gagnes ?? 0,
    utilises: r?.tampons_utilises ?? 0,
    filleuls: r?.filleuls ?? 0,
    filleulsComptes: r?.filleuls_comptes ?? 0,
    niveau: r?.niveau ?? "standard",
    gains: verifier(gains),
    depenses: verifier(depenses).flatMap((c) =>
      c.recompenses.map((ru) => ({ ...ru, commande_id: c.id, date_livraison: c.date_livraison, statut: c.statut })),
    ),
  };
}
export type FideliteClient = Awaited<ReturnType<typeof lireFideliteClient>>;

/** Solde et niveau de tous les clients (pour la saisie des commandes). */
export async function listerFidelite() {
  const supabase = await clientSupabase();
  const lignes = verifier(await supabase.from("fidelite_clients").select("client_id, solde, niveau, filleuls_comptes"));
  const parClient: Record<string, { solde: number; niveau: "standard" | "vip" | "ultra" }> = {};
  for (const l of lignes) {
    if (l.client_id) parClient[l.client_id] = { solde: l.solde ?? 0, niveau: l.niveau ?? "standard" };
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

const CHAMPS_COMMANDE = `id, client_id, date_livraison, statut, livree_le, notes,
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
