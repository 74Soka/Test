"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { clientSupabase } from "@/lib/supabase/serveur";
import { saisieVersCentimes } from "@/lib/domaine/argent";
import { erreursParChamp, messageErreur, type Resultat } from "@/lib/erreurs";

const schemaArticle = z.object({
  nom: z.string().trim().min(1, "Donnez un nom à l'article.").max(80),
  categorie: z.enum(["panier", "supplement"]),
  prix: z
    .string()
    .transform((p) => saisieVersCentimes(p))
    .refine((p): p is number => p !== null, "Prix invalide (ex. 30 ou 4,50)."),
  ordre: z.number().int().optional(),
  tampons: z
    .string()
    .optional()
    .transform((t) => (t === undefined || t.trim() === "" ? 0 : Number(t)))
    .refine((t) => Number.isInteger(t) && t >= 0 && t <= 100, "Nombre entier entre 0 et 100."),
});

export type DonneesArticle = z.input<typeof schemaArticle>;

const MESSAGES = { "23505": "Un article porte déjà ce nom." };

export async function enregistrerArticle(donnees: DonneesArticle, id?: string): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaArticle.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const { prix, ...reste } = saisie.data;
  const ligne = { ...reste, prix_centimes: prix as number };
  const supabase = await clientSupabase();
  const { error } = id
    ? await supabase.from("articles").update(ligne).eq("id", id)
    : await supabase.from("articles").insert(ligne);
  if (error) return { ok: false, erreur: messageErreur(error, MESSAGES) };

  revalidatePath("/", "layout");
  if (id) redirect("/reglages/catalogue");
  return { ok: true };
}

export async function basculerArticle(id: string, actif: boolean): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { error } = await supabase.from("articles").update({ actif }).eq("id", id);
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function supprimerArticle(id: string): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { error } = await supabase.from("articles").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      erreur: messageErreur(error, {
        "23503": "Cet article figure dans des commandes : désactivez-le plutôt (il restera dans l'historique).",
      }),
    };
  }
  revalidatePath("/", "layout");
  redirect("/reglages/catalogue");
}
