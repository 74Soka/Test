"use server";

import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { messageErreur, type Resultat } from "@/lib/erreurs";
import { clientSupabase } from "@/lib/supabase/serveur";

const schemaAbonnement = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Abonne le téléphone d'un administrateur aux alertes (inscriptions, commandes en ligne). */
export async function abonnerTelephoneEquipe(abonnement: unknown, appareil: string): Promise<Resultat> {
  await exigerAdmin();
  const saisie = schemaAbonnement.safeParse(abonnement);
  if (!saisie.success) return { ok: false, erreur: "Ce téléphone n'a pas pu être abonné." };
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("enregistrer_abonnement_push", {
    p_endpoint: saisie.data.endpoint,
    p_p256dh: saisie.data.keys.p256dh,
    p_auth: saisie.data.keys.auth,
    p_appareil: appareil.slice(0, 200),
  });
  if (error) return { ok: false, erreur: messageErreur(error) };
  return { ok: true };
}

export async function desabonnerTelephoneEquipe(endpoint: string): Promise<Resultat> {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("supprimer_abonnement_push", { p_endpoint: endpoint.slice(0, 1000) });
  if (error) return { ok: false, erreur: messageErreur(error) };
  return { ok: true };
}
