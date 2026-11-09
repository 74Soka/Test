"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerClient, exigerClientRelie } from "@/lib/auth";
import { codeComplet, formaterCode, normaliserCode } from "@/lib/domaine/parrainage";
import { normaliserTelephone } from "@/lib/domaine/telephone";
import { nomComplet } from "@/lib/domaine/texte";
import { alerteAvis, alerteCommande, alerteInscription, envoyerAlerte, type EvenementCommande } from "@/lib/emails";
import { messageErreur, type Resultat } from "@/lib/erreurs";
import { lireCommandeClient } from "@/lib/espace-client";
import { origineDuSite } from "@/lib/site";
import { clientSupabase } from "@/lib/supabase/serveur";

const ligne = z.object({ article_id: z.uuid(), quantite: z.number().int().min(0).max(99) });

const schemaCommande = z.object({
  lignes: z.array(ligne).max(100),
  gardees: z.array(z.uuid()).max(20),
  nouvelles: z
    .array(z.object({ recompense_id: z.uuid(), articles: z.array(ligne).max(20) }))
    .max(10),
  notes: z.string().trim().max(500),
});

export type DemandeCommande = z.input<typeof schemaCommande>;

/** Notification sur le téléphone des administrateurs (jamais bloquante). */
async function notifierEquipe(type: "inscription" | "commande" | "modification" | "annulation", ref: string) {
  try {
    const supabase = await clientSupabase();
    const { error } = await supabase.rpc("demander_alerte_equipe", { p_type: type, p_ref: ref });
    if (error) console.error("Notification équipe :", error.message);
  } catch (e) {
    console.error("Notification équipe :", e);
  }
}

const TYPE_NOTIFICATION = { nouvelle: "commande", modifiee: "modification", annulee: "annulation" } as const;

async function alerter(evenement: EvenementCommande, commandeId: string, client: string) {
  await notifierEquipe(TYPE_NOTIFICATION[evenement], commandeId);
  const commande = await lireCommandeClient(commandeId);
  if (!commande) return;
  await envoyerAlerte({
    ...alerteCommande(evenement, {
      client,
      dateLivraison: commande.date_livraison,
      lignes: commande.lignes,
      offerts: commande.recompenses.flatMap((r) =>
        r.cadeaux.map((c) => ({ libelle: c.libelle, quantite: c.quantite, recompense: r.nom })),
      ),
      notes: commande.notes,
      lien: `${await origineDuSite()}/commandes/${commandeId}`,
    }),
  });
}

/** Commander, ou modifier sa commande de la semaine. */
export async function commanderEnLigne(demande: DemandeCommande): Promise<Resultat> {
  const { situation, utilisateur } = await exigerClientRelie();
  const saisie = schemaCommande.safeParse(demande);
  if (!saisie.success) return { ok: false, erreur: "Commande invalide : rechargez la page et réessayez." };

  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("passer_commande", {
    p_lignes: saisie.data.lignes.filter((l) => l.quantite > 0),
    p_recompenses_gardees: saisie.data.gardees,
    p_nouvelles_recompenses: saisie.data.nouvelles,
    p_notes: saisie.data.notes || undefined,
  });
  if (error) return { ok: false, erreur: messageErreur(error) };

  const r = z.object({ commande_id: z.uuid(), nouvelle: z.boolean() }).parse(data);
  await alerter(r.nouvelle ? "nouvelle" : "modifiee", r.commande_id, nomCompletClient(situation, utilisateur.email));
  revalidatePath("/espace", "layout");
  return { ok: true };
}

function nomCompletClient(s: { prenom: string; nom: string }, email: string | null) {
  return nomComplet(s) + (email ? ` (${email})` : "");
}

export async function annulerMaCommande(commandeId: string): Promise<Resultat> {
  const { situation, utilisateur } = await exigerClientRelie();
  if (!z.uuid().safeParse(commandeId).success) return { ok: false, erreur: "Commande introuvable." };
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("annuler_ma_commande", { p_commande_id: commandeId });
  if (error) return { ok: false, erreur: messageErreur(error) };
  await alerter("annulee", commandeId, nomCompletClient(situation, utilisateur.email));
  revalidatePath("/espace", "layout");
  return { ok: true };
}

const schemaCoordonnees = z.object({
  telephone: z
    .string()
    .trim()
    .min(1, "Indiquez un numéro de téléphone.")
    .transform((t, ctx) => {
      const n = normaliserTelephone(t);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide." });
        return z.NEVER;
      }
      return n;
    }),
  notesLivraison: z.string().trim().max(500, "500 caractères au plus."),
});

export async function modifierMesCoordonnees(donnees: { telephone: string; notesLivraison: string }): Promise<Resultat> {
  await exigerClientRelie();
  const saisie = schemaCoordonnees.safeParse(donnees);
  if (!saisie.success) {
    const champs: Record<string, string> = {};
    for (const i of saisie.error.issues) champs[String(i.path[0])] ??= i.message;
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs };
  }
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("modifier_mes_coordonnees", {
    p_telephone: saisie.data.telephone,
    p_notes_livraison: saisie.data.notesLivraison,
  });
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/espace", "layout");
  return { ok: true };
}

const schemaInscription = z.object({
  prenom: z.string().trim().max(100),
  nom: z.string().trim().min(1, "Indiquez votre nom.").max(100),
  telephone: schemaCoordonnees.shape.telephone,
  adresse: z.object(
    {
      ligne: z.string().trim().min(1, "Choisissez votre adresse dans la liste.").max(200),
      codePostal: z.string().trim().regex(/^\d{5}$/, "Code postal à 5 chiffres."),
      commune: z.string().trim().min(1).max(100),
      codeInsee: z.string().nullable(),
      lat: z.number().min(-90).max(90).nullable(),
      lng: z.number().min(-180).max(180).nullable(),
    },
    { error: "Choisissez votre adresse dans la liste." },
  ),
  complement: z.string().trim().max(200),
  notesLivraison: z.string().trim().max(500, "500 caractères au plus."),
  parrain: z.string().trim().max(100),
  connuPar: z.string().trim().max(100).default(""),
});

export type DemandeInscription = z.input<typeof schemaInscription>;

const CODE_INVALIDE = "Code invalide, veuillez réessayer.";

/** Le code de parrainage tapé par le filleul est-il valide ? (oui / non seulement) */
export async function verifierCodeParrainage(code: string): Promise<boolean> {
  await exigerClient();
  const normalise = normaliserCode(code.slice(0, 40));
  if (!codeComplet(normalise)) return false;
  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("verifier_code_parrainage", { p_code: normalise });
  if (error) {
    console.error("Code de parrainage :", error.message);
    return false;
  }
  return data === true;
}

/** Coordonnées d'un nouveau client (inscription à valider par l'équipe). */
export async function envoyerMonInscription(demande: DemandeInscription): Promise<Resultat> {
  const { utilisateur } = await exigerClient();
  if (demande.parrain?.trim() && !(await verifierCodeParrainage(demande.parrain))) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: { parrain: CODE_INVALIDE } };
  }
  const saisie = schemaInscription.safeParse(demande);
  if (!saisie.success) {
    const champs: Record<string, string> = {};
    for (const i of saisie.error.issues) champs[i.path.map(String).join(".")] ??= i.message;
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs };
  }
  const d = saisie.data;
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("envoyer_inscription", {
    p_prenom: d.prenom,
    p_nom: d.nom,
    p_telephone: d.telephone,
    p_adresse: d.adresse.ligne,
    p_complement_adresse: d.complement,
    p_code_postal: d.adresse.codePostal,
    p_commune: d.adresse.commune,
    p_code_insee: d.adresse.codeInsee ?? "",
    p_lat: d.adresse.lat as number,
    p_lng: d.adresse.lng as number,
    p_notes_livraison: d.notesLivraison,
    p_parrain: d.parrain ? normaliserCode(d.parrain) : "",
  });
  if (error) return { ok: false, erreur: messageErreur(error) };

  if (d.connuPar) {
    const { error: e2 } = await supabase.rpc("preciser_connu_par", { p_texte: d.connuPar });
    if (e2) console.error("Comment nous avez-vous connu :", e2.message);
  }
  await notifierEquipe("inscription", utilisateur.id);
  await envoyerAlerte({
    ...alerteInscription({
      nom: nomComplet(d),
      email: utilisateur.email ?? "",
      telephone: d.telephone,
      adresse: `${d.adresse.ligne}${d.complement ? `, ${d.complement}` : ""}, ${d.adresse.codePostal} ${d.adresse.commune}`,
      parrain: d.parrain ? `code ${formaterCode(d.parrain)}` : null,
      connuPar: d.connuPar || null,
      lien: `${await origineDuSite()}/clients/inscriptions`,
    }),
    repondreA: utilisateur.email ?? undefined,
  });
  revalidatePath("/espace", "layout");
  return { ok: true };
}

/** RGPD : suppression du compte et de toutes les données du client. */
export async function supprimerMonCompte(formulaire: FormData): Promise<void> {
  await exigerClient();
  if (formulaire.get("confirmation") !== "oui") redirect("/espace/compte/supprimer?erreur=confirmation");
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("supprimer_mon_compte");
  if (error) redirect("/espace/compte/supprimer?erreur=echec");
  await supabase.auth.signOut();
  redirect("/connexion?message=supprime");
}

// --- Notifications de livraison ---------------------------------------------------

const schemaAbonnement = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Abonne ce téléphone aux notifications de livraison. */
export async function enregistrerMonAbonnement(abonnement: unknown, appareil: string): Promise<Resultat> {
  await exigerClient();
  const saisie = schemaAbonnement.safeParse(abonnement);
  if (!saisie.success) return { ok: false, erreur: "Ce téléphone n'a pas pu être abonné." };
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("enregistrer_abonnement_push", {
    p_endpoint: saisie.data.endpoint,
    p_p256dh: saisie.data.keys.p256dh,
    p_auth: saisie.data.keys.auth,
    p_appareil: appareil.slice(0, 200),
  });
  if (error) return { ok: false, erreur: messageErreur(error) };
  return { ok: true };
}

export async function supprimerMonAbonnement(endpoint: string): Promise<Resultat> {
  await exigerClient();
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("supprimer_abonnement_push", { p_endpoint: endpoint.slice(0, 1000) });
  if (error) return { ok: false, erreur: messageErreur(error) };
  return { ok: true };
}

// --- Avis après livraison ------------------------------------------------------------

const schemaAvis = z
  .object({
    commandeId: z.uuid(),
    note: z.number().int().min(1).max(5).nullable(),
    commentaire: z.string().trim().max(1000, "1 000 caractères au plus."),
  })
  .refine((a) => a.note !== null || a.commentaire.length > 0, { message: "Choisissez une note ou écrivez un commentaire." });

export async function donnerMonAvis(donnees: z.input<typeof schemaAvis>): Promise<Resultat> {
  const { situation, utilisateur } = await exigerClientRelie();
  const saisie = schemaAvis.safeParse(donnees);
  if (!saisie.success) return { ok: false, erreur: saisie.error.issues[0]?.message ?? "Avis invalide." };
  const d = saisie.data;
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("donner_mon_avis", {
    p_commande_id: d.commandeId,
    p_note: d.note as number,
    p_commentaire: d.commentaire,
  });
  if (error) return { ok: false, erreur: messageErreur(error) };

  const commande = await lireCommandeClient(d.commandeId);
  await envoyerAlerte({
    ...alerteAvis({
      client: nomCompletClient(situation, utilisateur.email),
      dateLivraison: commande?.date_livraison ?? "",
      note: d.note,
      commentaire: d.commentaire || null,
      lien: `${await origineDuSite()}/clients/retours`,
    }),
    repondreA: utilisateur.email ?? undefined,
  });
  revalidatePath("/espace", "layout");
  return { ok: true };
}
