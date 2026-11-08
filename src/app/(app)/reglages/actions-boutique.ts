"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { estDateIso, jourSemaine } from "@/lib/domaine/dates";
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
});

/** Composition des paniers d'une semaine : un texte par panier (vide = retiré). */
export async function enregistrerComposition(donnees: z.input<typeof schemaComposition>): Promise<Resultat> {
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
  revalidatePath("/", "layout");
  return { ok: true };
}
