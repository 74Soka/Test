"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { messageErreur, type Resultat } from "@/lib/erreurs";
import { clientSupabase } from "@/lib/supabase/serveur";

export async function traiterRetour(commandeId: string, traite: boolean): Promise<Resultat> {
  await exigerAdmin();
  if (!z.uuid().safeParse(commandeId).success) return { ok: false, erreur: "Retour introuvable." };
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("traiter_avis", { p_commande_id: commandeId, p_traite: traite });
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
