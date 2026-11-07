"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { clientSupabase } from "@/lib/supabase/serveur";
import { erreursParChamp, messageErreur, type Resultat } from "@/lib/erreurs";

const entier = (min: number, max: number) =>
  z
    .string()
    .transform((t) => Number(t))
    .refine((n) => Number.isInteger(n) && n >= min && n <= max, `Nombre entier entre ${min} et ${max}.`);

const schemaParametres = z
  .object({
    tampons_bienvenue: entier(0, 100),
    tampons_parrainage: entier(0, 100),
    tampons_parrain_par_commande: entier(0, 100),
    filleuls_vip: entier(1, 1000),
    filleuls_ultra: entier(1, 1000),
    filleuls_livres_seulement: z.boolean(),
    parrainage_cadeaux_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  })
  .refine((p) => p.filleuls_ultra >= p.filleuls_vip, {
    path: ["filleuls_ultra"],
    message: "Le niveau Ultra doit demander au moins autant de filleuls que le niveau VIP.",
  });

export type DonneesParametres = z.input<typeof schemaParametres>;

export async function enregistrerParametres(donnees: DonneesParametres): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaParametres.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const supabase = await clientSupabase();
  const { error } = await supabase.from("parametres_fidelite").update(saisie.data).eq("id", true);
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

const schemaRecompense = z.object({
  nom: z.string().trim().min(1, "Donnez un nom à la récompense.").max(80),
  description: z.string().trim().max(200).optional(),
  cout_tampons: entier(1, 1000),
  niveau: z.enum(["standard", "vip", "ultra"]),
  article_id: z.string().optional(),
  actif: z.boolean(),
});

export type DonneesRecompense = z.input<typeof schemaRecompense>;

export async function enregistrerRecompense(donnees: DonneesRecompense, id?: string): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  // Cadeau de parrainage : ni coût ni niveau (il est offert, pas acheté en tampons)
  const existant = id ? (await supabase.from("recompenses").select("type").eq("id", id).maybeSingle()).data : null;
  const cadeau = existant && existant.type !== "tampons";
  const saisie = schemaRecompense.safeParse(cadeau ? { ...donnees, cout_tampons: "1", niveau: "standard" } : donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const { article_id, description, cout_tampons, niveau, ...reste } = saisie.data;
  const ligne = {
    ...reste,
    ...(cadeau ? {} : { cout_tampons, niveau }),
    description: description || null,
    article_id: article_id && z.uuid().safeParse(article_id).success ? article_id : null,
  };
  const { error } = id
    ? await supabase.from("recompenses").update(ligne).eq("id", id)
    : await supabase
        .from("recompenses")
        .insert({ ...ligne, cout_tampons: cout_tampons as number, niveau: niveau ?? "standard" });
  if (error) return { ok: false, erreur: messageErreur(error, { "23505": "Une récompense porte déjà ce nom." }) };
  revalidatePath("/", "layout");
  redirect("/reglages/fidelite");
}

export async function supprimerRecompense(id: string): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { error } = await supabase.from("recompenses").delete().eq("id", id);
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  redirect("/reglages/fidelite");
}
