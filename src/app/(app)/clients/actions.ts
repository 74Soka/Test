"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { clientSupabase } from "@/lib/supabase/serveur";
import { estDateIso } from "@/lib/domaine/dates";
import { normaliserTelephone } from "@/lib/domaine/telephone";
import { videVersNull } from "@/lib/domaine/texte";
import { erreursParChamp, messageErreur, type Resultat } from "@/lib/erreurs";

const texteFacultatif = z
  .string()
  .max(1000)
  .optional()
  .transform((t) => videVersNull(t));

const schemaClient = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100),
  prenom: z.string().trim().max(100).default(""),
  telephone: z
    .string()
    .optional()
    .transform((t, ctx) => {
      if (!t?.trim()) return null;
      const e164 = normaliserTelephone(t);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide (ex. 06 12 34 56 78)." });
        return z.NEVER;
      }
      return e164;
    }),
  email: z
    .string()
    .trim()
    .optional()
    .transform((t) => videVersNull(t))
    .pipe(z.email("Adresse e-mail invalide.").nullable()),
  adresse: z.object(
    {
      ligne: z.string().trim().min(1, "L'adresse est obligatoire."),
      codePostal: z.string().trim().regex(/^\d{5}$/, "Code postal à 5 chiffres."),
      commune: z.string().trim().min(1, "La commune est obligatoire."),
      codeInsee: z.string().nullable(),
      lat: z.number().min(-90).max(90).nullable(),
      lng: z.number().min(-180).max(180).nullable(),
      source: z.enum(["adresse", "manuelle"]).nullable(),
    },
    { error: "Recherchez l'adresse du client." },
  ).superRefine((a, ctx) => {
    if (a.lat === null || a.lng === null) {
      ctx.addIssue({
        code: "custom",
        path: ["position"],
        message: "Position manquante : touchez la carte à l'endroit de la livraison.",
      });
    }
  }),
  complementAdresse: texteFacultatif,
  notesLivraison: texteFacultatif,
  secteurId: z.uuid("Choisissez un secteur."),
  parrainId: z.uuid().nullable(),
  dateInscription: z.string().refine(estDateIso, "Date invalide."),
});

export type DonneesClient = z.input<typeof schemaClient>;

export async function enregistrerClient(donnees: DonneesClient, id?: string): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaClient.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const d = saisie.data;
  if (id && d.parrainId === id) {
    return { ok: false, erreur: "Un client ne peut pas être son propre parrain.", champs: { parrainId: "Choix impossible." } };
  }

  const ligne = {
    nom: d.nom,
    prenom: d.prenom,
    telephone: d.telephone,
    email: d.email,
    adresse: d.adresse.ligne,
    complement_adresse: d.complementAdresse,
    code_postal: d.adresse.codePostal,
    commune: d.adresse.commune,
    code_insee: d.adresse.codeInsee,
    lat: d.adresse.lat,
    lng: d.adresse.lng,
    source_position: d.adresse.source ?? "manuelle",
    notes_livraison: d.notesLivraison,
    secteur_id: d.secteurId,
    parrain_id: d.parrainId,
    date_inscription: d.dateInscription,
  };

  const supabase = await clientSupabase();
  const { data, error } = id
    ? await supabase.from("clients").update(ligne).eq("id", id).select("id").single()
    : await supabase.from("clients").insert(ligne).select("id").single();
  if (error) return { ok: false, erreur: messageErreur(error) };

  revalidatePath("/", "layout");
  redirect(`/clients/${data.id}`);
}

export async function changerActivite(id: string, actif: boolean): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { error } = await supabase.from("clients").update({ actif }).eq("id", id);
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Suppression définitive (RGPD) : le client, ses commandes et leurs lignes. */
export async function supprimerClient(id: string): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { error, count } = await supabase.from("clients").delete({ count: "exact" }).eq("id", id);
  if (error) return { ok: false, erreur: messageErreur(error) };
  if (count === 0) return { ok: false, erreur: "Ce client n'existe plus." };
  revalidatePath("/", "layout");
  redirect("/clients?supprime=1");
}
