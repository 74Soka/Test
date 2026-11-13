import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientSupabase } from "@/lib/supabase/serveur";
import type { Enums } from "@/lib/supabase/database.types";

export type Utilisateur = {
  id: string;
  email: string | null;
  role: Enums<"role_utilisateur"> | null;
};

/** Utilisateur connecté (une seule lecture par requête), ou null. */
export const utilisateurCourant = cache(async (): Promise<Utilisateur | null> => {
  const supabase = await clientSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profil } = await supabase.from("profils").select("role").eq("id", claims.sub).maybeSingle();
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: profil?.role ?? null,
  };
});

/**
 * À appeler en tête de chaque page et de chaque Server Action de gestion :
 * renvoie vers la connexion si besoin, refuse les comptes non administrateurs.
 * (La RLS protège aussi les données côté base.)
 */
export async function exigerAdmin(): Promise<Utilisateur> {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion");
  if (utilisateur.role === "livreur") redirect("/tournee");
  // Un compte sans profil est un compte client : son espace
  if (utilisateur.role !== "admin") redirect("/espace");
  return utilisateur;
}

/** Écrans de terrain (tournée) : administrateur ou livreur. */
export async function exigerEquipe(): Promise<Utilisateur & { role: "admin" | "livreur" }> {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion");
  if (utilisateur.role !== "admin" && utilisateur.role !== "livreur") redirect("/espace");
  return utilisateur as Utilisateur & { role: "admin" | "livreur" };
}

const schemaSituation = z.discriminatedUnion("etat", [
  z.object({ etat: z.literal("equipe") }),
  z.object({ etat: z.literal("nouveau") }),
  z.object({ etat: z.literal("en_attente") }),
  z.object({ etat: z.literal("refusee") }),
  z.object({
    etat: z.literal("client"),
    client_id: z.string(),
    prenom: z.string(),
    nom: z.string(),
    actif: z.boolean(),
    /** Vide pour un secteur réservé à l'équipe (nom non montré au client) */
    secteur: z.string().nullable(),
    creneau: z.enum(["matin", "apres_midi", "journee"]),
    prochaine_livraison: z.string().nullable(),
    cloture: z.string().nullable(),
    commande_id: z.string().nullable(),
    commandes_ouvertes: z.boolean(),
    message_clients: z.string().nullable(),
  }),
]);

export type SituationClient = z.infer<typeof schemaSituation>;
export type SituationClientRelie = Extract<SituationClient, { etat: "client" }>;

/**
 * Situation du compte connecté côté client (une lecture par requête). Relie
 * au passage le compte à sa fiche si l'e-mail confirmé correspond.
 */
export const situationClient = cache(async (): Promise<SituationClient> => {
  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("ma_situation");
  if (error) throw new Error(`Situation du compte : ${error.message}`);
  return schemaSituation.parse(data);
});

/**
 * À appeler en tête des pages de l'espace client : renvoie l'équipe vers ses
 * écrans et les visiteurs vers la connexion.
 */
export async function exigerClient(): Promise<{ utilisateur: Utilisateur; situation: SituationClient }> {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion");
  if (utilisateur.role === "admin") redirect("/livraisons");
  if (utilisateur.role === "livreur") redirect("/tournee");
  return { utilisateur, situation: await situationClient() };
}

/** Pages réservées aux clients reliés à une fiche (commander, fidélité…). */
export async function exigerClientRelie(): Promise<{ utilisateur: Utilisateur; situation: SituationClientRelie }> {
  const { utilisateur, situation } = await exigerClient();
  if (situation.etat !== "client") redirect("/espace");
  return { utilisateur, situation };
}
