"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clientSupabase } from "@/lib/supabase/serveur";

export type EtatConnexion = { erreur?: string; email?: string };

const schema = z.object({
  email: z.string().trim().email(),
  motDePasse: z.string().min(1),
  suite: z.string().optional(),
});

/** N'accepte que des chemins internes, pour éviter toute redirection vers un autre site. */
function cheminSur(suite: string | undefined): string {
  if (suite && suite.startsWith("/") && !suite.startsWith("//") && !suite.startsWith("/connexion")) {
    return suite;
  }
  return "/livraisons";
}

export async function seConnecter(_etat: EtatConnexion, formulaire: FormData): Promise<EtatConnexion> {
  const saisie = schema.safeParse({
    email: formulaire.get("email"),
    motDePasse: formulaire.get("motDePasse"),
    suite: formulaire.get("suite") ?? undefined,
  });
  const email = String(formulaire.get("email") ?? "");
  if (!saisie.success) {
    return { erreur: "Saisissez votre adresse e-mail et votre mot de passe.", email };
  }

  const supabase = await clientSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: saisie.data.email,
    password: saisie.data.motDePasse,
  });
  if (error) {
    const message =
      error.code === "invalid_credentials"
        ? "E-mail ou mot de passe incorrect."
        : "Connexion impossible pour le moment. Réessayez dans un instant.";
    return { erreur: message, email };
  }

  redirect(cheminSur(saisie.data.suite));
}

export async function seDeconnecter() {
  const supabase = await clientSupabase();
  await supabase.auth.signOut();
  redirect("/connexion");
}
