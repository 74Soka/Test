"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { clientSupabase } from "@/lib/supabase/serveur";
import { commandeDeLaSemaine } from "@/lib/donnees";
import { estDateIso, lundiDeLaSemaine } from "@/lib/domaine/dates";
import { erreursParChamp, messageErreur, type Resultat } from "@/lib/erreurs";

const schemaCommande = z.object({
  clientId: z.uuid("Choisissez un client."),
  date: z.string().refine(estDateIso, "Choisissez une date de livraison."),
  /** Autre secteur pour cette livraison seulement (vide : secteur du client) */
  secteurId: z.uuid("Secteur inconnu.").nullable().optional(),
  quantites: z.record(z.uuid(), z.number().int().min(0).max(99)),
  notes: z.string().max(1000).optional(),
  /** Suppléments libres (nom et prix saisis à la main) */
  libres: z
    .array(
      z.object({
        libelle: z.string().trim().min(1, "Nom du supplément manquant.").max(60),
        quantite: z.number().int().min(1).max(99),
        prix_unitaire_centimes: z.number().int().min(0, "Prix invalide.").max(50000, "Prix trop élevé (500 € maximum)."),
      }),
    )
    .max(20)
    .default([]),
  recompenses: z
    .array(
      z.object({
        id: z.uuid().nullable().optional(),
        recompense_id: z.uuid(),
        articles: z.array(z.object({ article_id: z.uuid(), quantite: z.number().int().min(1).max(99) })),
      }),
    )
    .max(20)
    .default([]),
});

export type DonneesCommande = z.input<typeof schemaCommande>;

export async function enregistrerCommande(donnees: DonneesCommande, id?: string): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaCommande.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const { clientId, date, secteurId, quantites, notes, recompenses, libres } = saisie.data;
  const lignes = Object.entries(quantites)
    .filter(([, q]) => q > 0)
    .map(([article_id, quantite]) => ({ article_id, quantite }));

  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("enregistrer_commande", {
    p_client_id: clientId,
    p_date_livraison: date,
    p_lignes: lignes,
    p_notes: notes || undefined,
    p_commande_id: id,
    p_recompenses: recompenses.map((r) => ({ id: r.id ?? null, recompense_id: r.recompense_id, articles: r.articles })),
    p_libres: libres,
  });

  if (error) {
    if (error.code === "PN003") {
      const existante = await commandeDeLaSemaine(clientId, lundiDeLaSemaine(date));
      if (existante && existante.id !== id) {
        return {
          ok: false,
          erreur: error.message,
          lien: { href: `/commandes/${existante.id}`, libelle: "Ouvrir la commande existante" },
        };
      }
    }
    return { ok: false, erreur: messageErreur(error) };
  }

  // Secteur ponctuel (la base cale alors la date sur le jour de ce secteur, même semaine).
  // La date est renvoyée avec : en revenant au secteur habituel, elle reprend le jour choisi.
  const secteur = await supabase
    .from("commandes")
    .update({ secteur_id: secteurId ?? null, date_livraison: date })
    .eq("id", data);
  if (secteur.error) {
    return {
      ok: false,
      erreur: `Commande enregistrée, mais le secteur n'a pas pu être changé : ${messageErreur(secteur.error)}`,
      lien: { href: `/commandes/${data}`, libelle: "Ouvrir la commande" },
    };
  }

  revalidatePath("/", "layout");
  redirect(`/commandes/${data}?enregistree=1`);
}

const statuts = z.enum(["a_livrer", "livree", "annulee"]);

export async function changerStatut(id: string, statut: z.infer<typeof statuts>): Promise<Resultat> {
  await exigerAdmin();
  const s = statuts.safeParse(statut);
  if (!s.success) return { ok: false, erreur: "Statut inconnu." };
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("changer_statut_commande", { p_commande_id: id, p_statut: s.data });
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function supprimerCommande(id: string, retour: string): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { error } = await supabase.from("commandes").delete().eq("id", id);
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  redirect(retour.startsWith("/") && !retour.startsWith("//") ? retour : "/livraisons");
}
