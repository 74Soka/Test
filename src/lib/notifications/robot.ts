import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { formaterEcheance } from "@/lib/domaine/dates";
import { configSupabase } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { origineDuSite } from "@/lib/site";
import { creerEnvoyeurPush } from "./envoi";
import { messageRappel } from "./messages";

/**
 * Rappels du jeudi, envoyés sans compte connecté : le planificateur de
 * Supabase fournit le jeton secret, que la base vérifie à chaque appel.
 */

export type Moment = "midi" | "soir";

/** 12 h → midi, 19 h → soir (heure de Paris) ; sinon rien à envoyer. */
export function momentDuRappel(maintenant: Date = new Date()): Moment | null {
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(maintenant)
      .find((p) => p.type === "hour")?.value,
  );
  return heure === 12 ? "midi" : heure === 19 ? "soir" : null;
}

export class JetonRefuse extends Error {}

export async function envoyerRappels(jeton: string, moment: Moment): Promise<{ rappels: number; envoyes: number }> {
  const { url, cle } = configSupabase();
  const supabase = createClient<Database>(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: lignes, error } = await supabase.rpc("rappels_a_envoyer", { p_jeton: jeton, p_moment: moment });
  if (error) {
    if (error.code === "42501") throw new JetonRefuse();
    throw new Error(error.message);
  }
  if (!lignes?.length) return { rappels: 0, envoyes: 0 };

  const { data: cles, error: e2 } = await supabase.rpc("cles_push_robot", { p_jeton: jeton });
  if (e2 || !cles) throw new Error(e2?.message ?? "Clés de notification absentes.");
  const origine = await origineDuSite();
  const envoyeur = creerEnvoyeurPush({
    cles: z.object({ publique: z.string(), privee: z.string() }).parse(cles),
    sujet: origine.startsWith("https://") ? origine : "mailto:contact@example.org",
  });

  const resultats = await Promise.all(
    lignes.map(async (l) => {
      const r = await envoyeur.envoyer(l, messageRappel(moment, l.prenom, formaterEcheance(l.cloture)));
      if (r === "expire") await supabase.rpc("supprimer_abonnement_robot", { p_jeton: jeton, p_endpoint: l.endpoint });
      return r;
    }),
  );
  return { rappels: new Set(lignes.map((l) => l.client_id)).size, envoyes: resultats.filter((r) => r === "envoye").length };
}
