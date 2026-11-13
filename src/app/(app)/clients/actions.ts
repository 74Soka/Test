"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { geocodeur } from "@/lib/geocodage";
import { meilleurePosition, texteAdresse } from "@/lib/geocodage/localiser";
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
  ),
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

  // Pas de repère sur la carte (fiche importée, adresse saisie à la main…) :
  // on le cherche d'après l'adresse ; introuvable, une fiche existante est
  // enregistrée quand même (l'équipe n'a pas à le replacer pour un autre changement)
  if (d.adresse.lat === null || d.adresse.lng === null) {
    const trouvee = await localiser(d.adresse);
    if (trouvee) {
      d.adresse = { ...d.adresse, lat: trouvee.lat, lng: trouvee.lng, codeInsee: d.adresse.codeInsee ?? trouvee.codeInsee, source: "adresse" };
    } else if (!id) {
      // Nouvelle fiche : le repère est demandé (une fiche existante s'enregistre sans)
      return {
        ok: false,
        erreur: "Vérifiez les champs signalés.",
        champs: { "adresse.position": "Position manquante : touchez la carte à l'endroit de la livraison." },
      };
    }
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
    source_position: d.adresse.lat === null ? null : (d.adresse.source ?? "manuelle"),
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

async function localiser(a: { ligne: string; codePostal: string; commune: string }) {
  try {
    return meilleurePosition(a, await geocodeur.rechercherAdresses(texteAdresse(a), { limite: 3 }));
  } catch (e) {
    console.error("Repère automatique :", e);
    return null;
  }
}

/**
 * Fiches sans repère sur la carte : on les place d'après leur adresse, par
 * paquets (le service d'adresses répond en quelques dixièmes de seconde).
 * Renvoie combien ont été placées, et combien restent (introuvables ou suivantes).
 */
export async function placerClientsSansRepere(): Promise<Resultat & { places?: number; restants?: number; introuvables?: string[] }> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("id, nom, prenom, adresse, code_postal, commune, code_insee")
    .is("lat", null)
    .order("nom");
  if (error) return { ok: false, erreur: messageErreur(error) };

  const paquet = data.slice(0, 25);
  let places = 0;
  const introuvables: string[] = [];
  for (const c of paquet) {
    const trouvee = await localiser({ ligne: c.adresse, codePostal: c.code_postal, commune: c.commune });
    if (!trouvee) {
      introuvables.push(`${c.prenom} ${c.nom}`.trim());
      continue;
    }
    const maj = await supabase
      .from("clients")
      .update({ lat: trouvee.lat, lng: trouvee.lng, code_insee: c.code_insee ?? trouvee.codeInsee, source_position: "adresse" })
      .eq("id", c.id)
      .is("lat", null);
    if (!maj.error) places++;
  }
  revalidatePath("/", "layout");
  return { ok: true, places, restants: data.length - places, introuvables };
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
