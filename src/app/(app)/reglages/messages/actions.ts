"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { erreursParChamp, messageErreur, type Resultat } from "@/lib/erreurs";
import { envoyerMessageClients } from "@/lib/notifications";
import { clientSupabase } from "@/lib/supabase/serveur";

const schemaMessage = z.object({
  titre: z.string().trim().min(1, "Donnez un titre.").max(60, "60 caractères au plus."),
  corps: z.string().trim().min(1, "Écrivez le message.").max(200, "200 caractères au plus."),
  lien: z.enum(["/paniers", "/espace/commander", "/espace"]),
});

export type DonneesMessage = z.input<typeof schemaMessage>;
export type ResultatMessage = Resultat & { telephones?: number };

/** Envoie une notification à tous les clients abonnés (et la garde dans l'historique). */
export async function envoyerMessage(donnees: DonneesMessage): Promise<ResultatMessage> {
  await exigerAdmin();
  const saisie = schemaMessage.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const { titre, corps, lien } = saisie.data;
  const supabase = await clientSupabase();

  // Même message il y a moins de 2 minutes : sans doute un double appui
  const depuis = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("messages_clients")
    .select("id")
    .eq("titre", titre)
    .eq("corps", corps)
    .gte("envoye_le", depuis)
    .limit(1);
  if (recent?.length) return { ok: false, erreur: "Ce message vient déjà d'être envoyé." };

  const { data: ligne, error } = await supabase
    .from("messages_clients")
    .insert({ titre, corps, lien })
    .select("id")
    .single();
  if (error) return { ok: false, erreur: messageErreur(error) };

  let telephones: number;
  try {
    telephones = await envoyerMessageClients({ titre, corps, url: lien, tag: `message-${ligne.id}` });
  } catch (e) {
    console.error("Message aux clients :", e);
    return { ok: false, erreur: "L'envoi n'a pas pu se faire. Réessayez dans un instant." };
  }
  await supabase.from("messages_clients").update({ telephones }).eq("id", ligne.id);
  revalidatePath("/reglages/messages");
  return { ok: true, telephones };
}
