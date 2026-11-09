"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { clientSupabase } from "@/lib/supabase/serveur";
import { erreursParChamp, messageErreur, type Resultat } from "@/lib/erreurs";

const schemaAjustement = z.object({
  clientId: z.uuid(),
  quantite: z
    .number()
    .int("Nombre entier.")
    .min(-1000)
    .max(1000)
    .refine((q) => q !== 0, "Indiquez un nombre de graines différent de 0."),
  note: z.string().trim().min(1, "Indiquez la raison (ex. geste commercial).").max(200),
});

/** Ajoute (ou retire, si négatif) des tampons à la main, avec une raison. */
export async function ajusterTampons(donnees: z.input<typeof schemaAjustement>): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaAjustement.safeParse(donnees);
  if (!saisie.success) {
    return { ok: false, erreur: "Vérifiez les champs signalés.", champs: erreursParChamp(saisie.error.issues) };
  }
  const supabase = await clientSupabase();
  const { error } = await supabase.from("tampons").insert({
    client_id: saisie.data.clientId,
    quantite: saisie.data.quantite,
    motif: "ajustement",
    note: saisie.data.note,
  });
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath(`/clients/${saisie.data.clientId}`);
  return { ok: true };
}
