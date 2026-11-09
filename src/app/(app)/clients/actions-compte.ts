"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { saisieVersCentimes } from "@/lib/domaine/argent";
import { messageErreur, type Resultat } from "@/lib/erreurs";
import { clientSupabase } from "@/lib/supabase/serveur";

const schemaMouvement = z.object({
  clientId: z.uuid(),
  /** paiement : le client a réglé ; du : il doit cette somme ; avoir : on lui doit */
  type: z.enum(["paiement", "du", "avoir"]),
  montant: z.string(),
  note: z.string().trim().max(200, "200 caractères au plus."),
});

/** Paiement reçu à part (virement, chèque…) ou correction du compte d'un client. */
export async function enregistrerMouvement(donnees: z.input<typeof schemaMouvement>): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaMouvement.safeParse(donnees);
  if (!saisie.success) return { ok: false, erreur: "Saisie invalide." };
  const { clientId, type, note } = saisie.data;
  const centimes = saisieVersCentimes(saisie.data.montant);
  if (!centimes) return { ok: false, erreur: "Vérifiez les champs signalés.", champs: { montant: "Montant invalide, ex. 30 ou 12,50." } };

  const supabase = await clientSupabase();
  const { error } = await supabase.from("mouvements_compte").insert({
    client_id: clientId,
    montant_centimes: type === "du" ? centimes : -centimes,
    motif: type === "paiement" ? "paiement" : "ajustement",
    note: note || null,
  });
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** Retire un mouvement noté à la main (erreur de saisie). */
export async function supprimerMouvement(clientId: string, mouvementId: string): Promise<Resultat> {
  await exigerAdmin();
  if (!z.uuid().safeParse(mouvementId).success) return { ok: false, erreur: "Mouvement inconnu." };
  const supabase = await clientSupabase();
  const { error } = await supabase.from("mouvements_compte").delete().eq("id", mouvementId).is("commande_id", null);
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
