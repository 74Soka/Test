"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { clientSupabase } from "@/lib/supabase/serveur";
import { erreursParChamp, messageErreur, type Resultat } from "@/lib/erreurs";

const schemaSecteur = z.object({
  nom: z.string().trim().min(1, "Donnez un nom au secteur.").max(80),
  jour: z.number().int().min(1).max(7),
  creneau: z.enum(["matin", "apres_midi", "journee"]),
  couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide."),
  depart: z.object(
    {
      adresse: z.string().trim().min(1),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    },
    { error: "Choisissez l'adresse du point de départ dans la liste." },
  ),
  communes: z
    .array(z.object({ code_insee: z.string().regex(/^[0-9][0-9AB][0-9]{3}$/), nom: z.string().min(1) }))
    .max(200),
});

export type DonneesSecteur = z.input<typeof schemaSecteur>;

export async function enregistrerSecteur(donnees: DonneesSecteur, id?: string): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaSecteur.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const { communes, depart, ...secteur } = saisie.data;
  const ligne = { ...secteur, depart_adresse: depart.adresse, depart_lat: depart.lat, depart_lng: depart.lng };
  const supabase = await clientSupabase();

  let secteurId = id;
  if (id) {
    const { error } = await supabase.from("secteurs").update(ligne).eq("id", id);
    if (error) return { ok: false, erreur: messageErreur(error, { "23505": "Un secteur porte déjà ce nom." }) };
  } else {
    const { data, error } = await supabase.from("secteurs").insert(ligne).select("id").single();
    if (error) return { ok: false, erreur: messageErreur(error, { "23505": "Un secteur porte déjà ce nom." }) };
    secteurId = data.id;
  }

  // Communes : on ajoute les nouvelles puis on retire celles qui ne sont plus dans la liste
  const uniques = [...new Map(communes.map((c) => [c.code_insee, c])).values()];
  if (uniques.length) {
    const ajout = await supabase
      .from("secteur_communes")
      .upsert(uniques.map((c) => ({ ...c, secteur_id: secteurId! })), { onConflict: "secteur_id,code_insee" });
    if (ajout.error) return { ok: false, erreur: messageErreur(ajout.error) };
  }
  let retrait = supabase.from("secteur_communes").delete().eq("secteur_id", secteurId!);
  if (uniques.length) {
    // Codes INSEE validés ci-dessus : pas de caractère spécial possible
    retrait = retrait.not("code_insee", "in", `(${uniques.map((c) => `"${c.code_insee}"`).join(",")})`);
  }
  const { error: erreurRetrait } = await retrait;
  if (erreurRetrait) return { ok: false, erreur: messageErreur(erreurRetrait) };

  revalidatePath("/", "layout");
  redirect("/reglages/secteurs");
}

export async function supprimerSecteur(id: string): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { error } = await supabase.from("secteurs").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      erreur: messageErreur(error, {
        "23503": "Ce secteur contient encore des clients : déplacez-les dans un autre secteur avant de le supprimer.",
      }),
    };
  }
  revalidatePath("/", "layout");
  redirect("/reglages/secteurs");
}
