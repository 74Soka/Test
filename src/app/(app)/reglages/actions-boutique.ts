"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { aujourdhui, estDateIso, jourSemaine, lundiDeLaSemaine } from "@/lib/domaine/dates";
import { annoncerComposition } from "@/lib/notifications";
import { erreursParChamp, messageErreur, type Resultat } from "@/lib/erreurs";
import { clientSupabase } from "@/lib/supabase/serveur";

const schemaParametres = z.object({
  commandes_ouvertes: z.boolean(),
  cloture_jour: z.number().int().min(1).max(7),
  cloture_heure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide."),
  message_clients: z.string().trim().max(500, "500 caractères au plus."),
});

export type DonneesCommandesEnLigne = z.input<typeof schemaParametres>;

export async function enregistrerCommandesEnLigne(donnees: DonneesCommandesEnLigne): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaParametres.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const supabase = await clientSupabase();
  const { error } = await supabase
    .from("parametres_commandes")
    .update({ ...saisie.data, message_clients: saisie.data.message_clients || null })
    .eq("id", true);
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

const schemaComposition = z.object({
  semaine: z.string().refine((d) => estDateIso(d) && jourSemaine(d) === 1, "Semaine invalide."),
  contenus: z.record(z.uuid(), z.string().max(2000, "2 000 caractères au plus.")),
  /** Prévenir les clients par notification (une fois par semaine) */
  prevenir: z.boolean().default(false),
  /** Panier dont le contenu illustre la notification */
  panierPrincipal: z.uuid().nullable().default(null),
});

export type ResultatComposition = Resultat & { prevenus?: number | null };

/** Composition des paniers d'une semaine : un texte par panier (vide = retiré). */
export async function enregistrerComposition(donnees: z.input<typeof schemaComposition>): Promise<ResultatComposition> {
  await exigerAdmin();
  const saisie = schemaComposition.safeParse(donnees);
  if (!saisie.success) return { ok: false, erreur: "Composition invalide." };
  const { semaine, contenus } = saisie.data;
  const supabase = await clientSupabase();

  const remplis = Object.entries(contenus)
    .map(([article_id, contenu]) => ({ semaine, article_id, contenu: contenu.trim() }))
    .filter((c) => c.contenu);
  const vides = Object.entries(contenus)
    .filter(([, contenu]) => !contenu.trim())
    .map(([article_id]) => article_id);

  if (remplis.length) {
    const { error } = await supabase.from("compositions").upsert(remplis, { onConflict: "semaine,article_id" });
    if (error) return { ok: false, erreur: messageErreur(error) };
  }
  if (vides.length) {
    const { error } = await supabase.from("compositions").delete().eq("semaine", semaine).in("article_id", vides);
    if (error) return { ok: false, erreur: messageErreur(error) };
  }

  // Annonce aux clients : semaine en cours ou à venir, composition remplie
  let prevenus: number | null = null;
  if (saisie.data.prevenir && remplis.length && semaine >= lundiDeLaSemaine(aujourdhui())) {
    const principal = remplis.find((r) => r.article_id === saisie.data.panierPrincipal) ?? remplis[0];
    prevenus = await annoncerComposition(semaine, principal.contenu).catch((e: unknown) => {
      console.error("Annonce de la composition :", e);
      return null;
    });
  }
  revalidatePath("/", "layout");
  return { ok: true, prevenus };
}

const schemaRecette = z.object({
  semaine: z.string().refine((d) => estDateIso(d) && jourSemaine(d) === 1, "Semaine invalide."),
  titre: z.string().trim().max(200, "200 caractères au plus."),
  infos: z.string().trim().max(200, "200 caractères au plus."),
  ingredients: z.string().trim().max(3000, "3 000 caractères au plus."),
  etapes: z.string().trim().max(6000, "6 000 caractères au plus."),
  astuce: z.string().trim().max(1000, "1 000 caractères au plus."),
});

export type DonneesRecette = z.input<typeof schemaRecette>;

/** Recette de la semaine (page publique /paniers). Titre vide = recette retirée. */
export async function enregistrerRecette(donnees: DonneesRecette): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaRecette.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const { semaine, titre, infos, ingredients, etapes, astuce } = saisie.data;
  const supabase = await clientSupabase();

  if (!titre && !ingredients && !etapes) {
    const { error } = await supabase.from("recettes").delete().eq("semaine", semaine);
    if (error) return { ok: false, erreur: messageErreur(error) };
  } else {
    const champs: Record<string, string> = {};
    if (!titre) champs.titre = "Donnez un nom à la recette.";
    if (!ingredients) champs.ingredients = "Indiquez les ingrédients.";
    if (!etapes) champs.etapes = "Indiquez les étapes.";
    if (Object.keys(champs).length) return { ok: false, erreur: "Vérifiez les champs signalés.", champs };
    const { error } = await supabase
      .from("recettes")
      .upsert(
        { semaine, titre, infos: infos || null, ingredients, etapes, astuce: astuce || null },
        { onConflict: "semaine" },
      );
    if (error) return { ok: false, erreur: messageErreur(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
