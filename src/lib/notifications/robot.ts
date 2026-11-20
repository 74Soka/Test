import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { formaterEcheance } from "@/lib/domaine/dates";
import { configSupabase } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { origineDuSite } from "@/lib/site";
import { clesDeNetlify } from "./cles-env";
import { creerEnvoyeurBrevo } from "@/lib/emails/brevo";
import { creerEnvoyeurPush, type ClesVapid } from "./envoi";
import { messageAnnonce, messageRappel } from "./messages";
import { NOMS_JOURS } from "@/lib/domaine/dates";

/**
 * Rappels du jeudi, envoyés sans compte connecté : le planificateur de
 * Supabase fournit le jeton secret, que la base vérifie à chaque appel.
 */

export type Moment = "midi" | "soir";

/** 12 h → midi, 18 h → soir (heure de Paris) ; sinon rien à envoyer. */
export function momentDuRappel(maintenant: Date = new Date()): Moment | null {
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(maintenant)
      .find((p) => p.type === "hour")?.value,
  );
  return heure === 12 ? "midi" : heure === 18 ? "soir" : null;
}

export class JetonRefuse extends Error {}

/** Clés de signature pour le robot : celles de Netlify, sinon celles de la base (jeton exigé). */
async function clesDuRobot(supabase: ReturnType<typeof createClient<Database>>, jeton: string): Promise<ClesVapid> {
  const deNetlify = clesDeNetlify();
  if (deNetlify) return deNetlify;
  const { data: cles, error } = await supabase.rpc("cles_push_robot", { p_jeton: jeton });
  if (error || !cles) throw new Error(error?.message ?? "Clés de notification absentes.");
  return z.object({ publique: z.string(), privee: z.string() }).parse(cles);
}

export async function envoyerRappels(jeton: string, moment: Moment): Promise<{ rappels: number; envoyes: number }> {
  const { url, cle } = configSupabase();
  const supabase = createClient<Database>(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: lignes, error } = await supabase.rpc("rappels_a_envoyer", { p_jeton: jeton, p_moment: moment });
  if (error) {
    if (error.code === "42501") throw new JetonRefuse();
    throw new Error(error.message);
  }
  if (!lignes?.length) return { rappels: 0, envoyes: 0 };

  const origine = await origineDuSite();
  const envoyeur = creerEnvoyeurPush({
    cles: await clesDuRobot(supabase, jeton),
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

/**
 * Alertes aux administrateurs (inscription à valider, commande en ligne) :
 * appelé par la base avec le jeton, juste après l'action du client.
 */
export async function envoyerAlertesEquipe(jeton: string): Promise<{ alertes: number; envoyes: number }> {
  const { url, cle } = configSupabase();
  const supabase = createClient<Database>(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: lignes, error } = await supabase.rpc("alertes_a_envoyer", { p_jeton: jeton });
  if (error) {
    if (error.code === "42501") throw new JetonRefuse();
    throw new Error(error.message);
  }
  if (!lignes?.length) return { alertes: 0, envoyes: 0 };

  const origine = await origineDuSite();
  const envoyeur = creerEnvoyeurPush({
    cles: await clesDuRobot(supabase, jeton),
    sujet: origine.startsWith("https://") ? origine : "mailto:contact@example.org",
  });

  const resultats = await Promise.all(
    lignes.map(async (l) => {
      const r = await envoyeur.envoyer(l, { titre: l.titre, corps: l.corps, url: l.url, tag: `equipe-${l.alerte_id}` });
      if (r === "expire") await supabase.rpc("supprimer_abonnement_robot", { p_jeton: jeton, p_endpoint: l.endpoint });
      return r;
    }),
  );
  return { alertes: new Set(lignes.map((l) => l.alerte_id)).size, envoyes: resultats.filter((r) => r === "envoye").length };
}

/**
 * Annonce des paniers programmée (12 h 30) : appelée par le planificateur de
 * Supabase avec le jeton ; chaque annonce n'est envoyée qu'une fois.
 */
export async function envoyerAnnonces(jeton: string): Promise<{ annonces: number; envoyes: number }> {
  const { url, cle } = configSupabase();
  const supabase = createClient<Database>(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: lignes, error } = await supabase.rpc("annonces_a_envoyer", { p_jeton: jeton });
  if (error) {
    if (error.code === "42501") throw new JetonRefuse();
    throw new Error(error.message);
  }
  if (!lignes?.length) return { annonces: 0, envoyes: 0 };

  const origine = await origineDuSite();
  const envoyeur = creerEnvoyeurPush({
    cles: await clesDuRobot(supabase, jeton),
    sujet: origine.startsWith("https://") ? origine : "mailto:contact@example.org",
  });

  const resultats = await Promise.all(
    lignes.map(async (l) => {
      const [h, m] = (l.cloture_heure ?? "12:00").split(":");
      const cloture = l.cloture_jour
        ? `${NOMS_JOURS[l.cloture_jour - 1]} ${Number(h)} h${m === "00" ? "" : ` ${m}`}`
        : null;
      const r = await envoyeur.envoyer(l, messageAnnonce(l.contenu, cloture));
      if (r === "expire") await supabase.rpc("supprimer_abonnement_robot", { p_jeton: jeton, p_endpoint: l.endpoint });
      return r;
    }),
  );
  return { annonces: new Set(lignes.map((l) => l.semaine)).size, envoyes: resultats.filter((r) => r === "envoye").length };
}

/**
 * E-mails ponctuels déposés dans la base (prive.emails_a_envoyer), envoyés par
 * Brevo depuis l'adresse du site. Chaque e-mail n'est remis qu'une fois ; le
 * résultat (envoyé ou erreur) est noté dans la base.
 */
export async function envoyerEmailsPonctuels(jeton: string): Promise<{ emails: number; envoyes: number }> {
  const { url, cle } = configSupabase();
  const supabase = createClient<Database>(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: lignes, error } = await supabase.rpc("emails_a_envoyer", { p_jeton: jeton });
  if (error) {
    if (error.code === "42501") throw new JetonRefuse();
    throw new Error(error.message);
  }
  if (!lignes?.length) return { emails: 0, envoyes: 0 };

  const cleBrevo = process.env.BREVO_API_KEY;
  const expediteur = process.env.EMAIL_EXPEDITEUR;
  const envoyeur =
    cleBrevo && expediteur
      ? creerEnvoyeurBrevo({
          cle: cleBrevo,
          expediteur: { email: expediteur, nom: process.env.EMAIL_NOM_EXPEDITEUR || "Frais et Français" },
          baseUrl: process.env.BREVO_URL || undefined,
        })
      : null;

  let envoyes = 0;
  for (const l of lignes) {
    let erreur: string | undefined;
    if (!envoyeur) {
      erreur = "Envoi d'e-mails non réglé (BREVO_API_KEY, EMAIL_EXPEDITEUR).";
    } else {
      try {
        await envoyeur.envoyer({ a: [l.destinataire], sujet: l.sujet, texte: l.texte, repondreA: expediteur });
        envoyes++;
      } catch (e) {
        erreur = e instanceof Error ? e.message : String(e);
        console.error("E-mail ponctuel :", e);
      }
    }
    await supabase.rpc("email_envoye", { p_jeton: jeton, p_id: l.id, ...(erreur ? { p_erreur: erreur } : {}) });
  }
  return { emails: lignes.length, envoyes };
}
