import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
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
  if (utilisateur.role !== "admin") redirect("/acces-refuse");
  return utilisateur;
}
