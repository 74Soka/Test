import "server-only";
import { z } from "zod";
import { clientSupabase } from "@/lib/supabase/serveur";
import type { DateIso } from "@/lib/domaine/dates";

/**
 * Lectures de l'espace client, avec la session du client : la RLS ne lui
 * montre que ses propres données (et le catalogue actif).
 */

type Reponse = { data: unknown; error: { message: string } | null };

function verifier<R extends Reponse>(resultat: R): NonNullable<R["data"]> {
  if (resultat.error) throw new Error(resultat.error.message);
  return resultat.data as NonNullable<R["data"]>;
}

function verifierOuNull<R extends Reponse>(resultat: R): R["data"] | null {
  if (resultat.error) throw new Error(resultat.error.message);
  return resultat.data;
}

/** Articles proposés (actifs), paniers d'abord. */
export async function lireCatalogue() {
  const supabase = await clientSupabase();
  return verifier(
    await supabase
      .from("articles")
      .select("id, nom, categorie, prix_centimes, ordre, actif")
      .eq("actif", true)
      .order("categorie")
      .order("ordre")
      .order("nom"),
  );
}
export type ArticleCatalogue = Awaited<ReturnType<typeof lireCatalogue>>[number];

/**
 * Composition des paniers pour la semaine du lundi donné ; à défaut (pas
 * encore saisie), la plus proche à venir.
 */
export async function lireComposition(lundi: DateIso) {
  const supabase = await clientSupabase();
  const lignes = verifier(
    await supabase
      .from("compositions")
      .select("semaine, article_id, contenu")
      .gte("semaine", lundi)
      .order("semaine")
      .limit(20),
  );
  const semaine = lignes[0]?.semaine;
  return {
    semaine: semaine ?? null,
    exacte: semaine === lundi,
    contenus: Object.fromEntries(lignes.filter((l) => l.semaine === semaine).map((l) => [l.article_id, l.contenu])),
  };
}

const CHAMPS_COMMANDE = `id, date_livraison, statut, livree_le, notes, source,
  lignes:lignes_commande(article_id, libelle, categorie, quantite, prix_unitaire_centimes),
  recompenses:recompenses_utilisees(id, recompense_id, nom, cout_tampons, type, cadeaux(article_id, libelle, categorie, quantite))` as const;

export async function lireCommandeClient(id: string) {
  const supabase = await clientSupabase();
  return verifierOuNull(await supabase.from("commandes").select(CHAMPS_COMMANDE).eq("id", id).maybeSingle());
}
export type CommandeClient = NonNullable<Awaited<ReturnType<typeof lireCommandeClient>>>;

export async function listerMesCommandes() {
  const supabase = await clientSupabase();
  return verifier(
    await supabase.from("commandes").select(CHAMPS_COMMANDE).order("date_livraison", { ascending: false }).limit(60),
  );
}

const schemaFidelite = z.object({
  solde: z.number(),
  tampons_gagnes: z.number(),
  tampons_utilises: z.number(),
  niveau: z.enum(["standard", "vip", "ultra"]),
  filleuls_comptes: z.number(),
  confitures_dues: z.number(),
  filleuls: z.array(z.object({ prenom: z.string(), initiale: z.string(), livre: z.boolean() })),
});
export type MaFidelite = z.infer<typeof schemaFidelite>;

export async function lireMaFidelite(): Promise<MaFidelite> {
  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("ma_fidelite");
  if (error) throw new Error(error.message);
  return schemaFidelite.parse(data);
}

export async function lireMesTampons() {
  const supabase = await clientSupabase();
  return verifier(
    await supabase
      .from("tampons")
      .select("id, quantite, motif, note, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  );
}

export async function lireMaFiche(clientId: string) {
  const supabase = await clientSupabase();
  return verifierOuNull(
    await supabase
      .from("clients")
      .select("id, nom, prenom, email, telephone, adresse, complement_adresse, code_postal, commune, notes_livraison")
      .eq("id", clientId)
      .maybeSingle(),
  );
}

export async function lireMonInscription() {
  const supabase = await clientSupabase();
  return verifierOuNull(await supabase.from("inscriptions").select("*").maybeSingle());
}

export async function lireRecompensesProposees() {
  const supabase = await clientSupabase();
  return verifier(
    await supabase
      .from("recompenses")
      .select("id, nom, description, cout_tampons, niveau, article_id, actif, type, nb_offerts")
      .eq("actif", true)
      .order("ordre")
      .order("cout_tampons"),
  );
}
export type RecompenseProposeeClient = Awaited<ReturnType<typeof lireRecompensesProposees>>[number];

export async function lireReglesFidelite() {
  const supabase = await clientSupabase();
  return verifierOuNull(
    await supabase
      .from("parametres_fidelite")
      .select("filleuls_vip, filleuls_ultra, filleuls_livres_seulement, tampons_parrainage, tampons_parrain_par_commande, parrainage_cadeaux_debut")
      .maybeSingle(),
  );
}
