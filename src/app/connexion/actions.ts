"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cheminInterne, origineDuSite } from "@/lib/site";
import { clientSupabase } from "@/lib/supabase/serveur";

export type EtatConnexion = { erreur?: string; email?: string };

const schema = z.object({
  email: z.string().trim().email(),
  motDePasse: z.string().min(1),
  suite: z.string().optional(),
});

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
        : error.code === "email_not_confirmed"
          ? "Confirmez d'abord votre adresse : cliquez sur le lien reçu par e-mail."
          : "Connexion impossible pour le moment. Réessayez dans un instant.";
    return { erreur: message, email };
  }

  // L'accueil aiguille : équipe vers ses écrans, clients vers leur espace
  const suite = cheminInterne(saisie.data.suite);
  redirect(suite.startsWith("/connexion") ? "/" : suite);
}

export async function seDeconnecter() {
  const supabase = await clientSupabase();
  await supabase.auth.signOut();
  redirect("/connexion");
}

// --- Création de compte client -------------------------------------------------

export type EtatInscription = { erreur?: string; champs?: Record<string, string>; envoyeA?: string; valeurs?: Record<string, string> };

const schemaInscription = z.object({
  prenom: z.string().trim().max(100),
  nom: z.string().trim().min(1, "Indiquez votre nom.").max(100),
  email: z.string().trim().email("Adresse e-mail invalide."),
  motDePasse: z.string().min(8, "8 caractères au moins.").max(72, "72 caractères au plus."),
});

export async function creerCompteClient(_etat: EtatInscription, formulaire: FormData): Promise<EtatInscription> {
  const brut = {
    prenom: String(formulaire.get("prenom") ?? ""),
    nom: String(formulaire.get("nom") ?? ""),
    email: String(formulaire.get("email") ?? ""),
    motDePasse: String(formulaire.get("motDePasse") ?? ""),
  };
  const valeurs = { prenom: brut.prenom, nom: brut.nom, email: brut.email };
  const saisie = schemaInscription.safeParse(brut);
  if (!saisie.success) {
    const champs: Record<string, string> = {};
    for (const i of saisie.error.issues) champs[String(i.path[0])] ??= i.message;
    return { champs, valeurs };
  }

  const supabase = await clientSupabase();
  const { error } = await supabase.auth.signUp({
    email: saisie.data.email,
    password: saisie.data.motDePasse,
    options: {
      emailRedirectTo: `${await origineDuSite()}/auth/confirmer?suite=/espace`,
      data: { prenom: saisie.data.prenom, nom: saisie.data.nom },
    },
  });
  if (error) {
    const erreur =
      error.code === "weak_password"
        ? "Mot de passe trop simple : allongez-le ou ajoutez des chiffres."
        : error.code === "signup_disabled"
          ? "Les inscriptions en ligne ne sont pas ouvertes pour le moment."
          : error.code === "over_email_send_rate_limit" || error.status === 429
            ? "Trop de demandes pour le moment : réessayez dans une heure."
            : error.code === "email_address_invalid"
              ? "Cette adresse e-mail n'est pas acceptée."
              : "Création du compte impossible pour le moment. Réessayez dans un instant.";
    return { erreur, valeurs };
  }
  // Même réponse si l'adresse a déjà un compte : on ne révèle pas qui est inscrit
  return { envoyeA: saisie.data.email };
}

// --- Mot de passe oublié --------------------------------------------------------

export type EtatOubli = { erreur?: string; envoyeA?: string };

export async function demanderNouveauMotDePasse(_etat: EtatOubli, formulaire: FormData): Promise<EtatOubli> {
  const email = z.string().trim().email().safeParse(formulaire.get("email"));
  if (!email.success) return { erreur: "Saisissez votre adresse e-mail." };
  const supabase = await clientSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await origineDuSite()}/auth/confirmer?suite=/nouveau-mot-de-passe`,
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.status === 429)) {
    return { erreur: "Trop de demandes pour le moment : réessayez dans une heure." };
  }
  return { envoyeA: email.data };
}

export type EtatNouveauMotDePasse = { erreur?: string };

export async function changerMotDePasse(
  _etat: EtatNouveauMotDePasse,
  formulaire: FormData,
): Promise<EtatNouveauMotDePasse> {
  const motDePasse = z.string().min(8).max(72).safeParse(formulaire.get("motDePasse"));
  if (!motDePasse.success) return { erreur: "Le mot de passe doit faire entre 8 et 72 caractères." };
  const supabase = await clientSupabase();
  const { error } = await supabase.auth.updateUser({ password: motDePasse.data });
  if (error) {
    return {
      erreur:
        error.code === "same_password"
          ? "Choisissez un mot de passe différent de l'ancien."
          : error.code === "weak_password"
            ? "Mot de passe trop simple : allongez-le ou ajoutez des chiffres."
            : "Changement impossible : le lien a peut-être expiré. Redemandez un e-mail.",
    };
  }
  redirect("/");
}
