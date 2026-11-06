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
  quantites: z.record(z.uuid(), z.number().int().min(0).max(99)),
  notes: z.string().max(1000).optional(),
});

export type DonneesCommande = z.input<typeof schemaCommande>;

export async function enregistrerCommande(donnees: DonneesCommande, id?: string): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaCommande.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const { clientId, date, quantites, notes } = saisie.data;
  const lignes = Object.entries(quantites)
    .filter(([, q]) => q > 0)
    .map(([article_id, quantite]) => ({ article_id, quantite }));

  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("enregistrer_commande", {
    p_client_id: clientId,
    p_date_livraison: date,
    p_lignes: lignes,
    p_notes: notes ?? null,
    p_commande_id: id ?? null,
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
