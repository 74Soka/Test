import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { listerCommandesDuJour, lireSecteur } from "@/lib/donnees";
import { origineDuSite } from "@/lib/site";
import { clientSupabase } from "@/lib/supabase/serveur";
import { calculerTrajet } from "@/lib/tournees";
import { distance } from "@/lib/tournees/geo";
import type { Point } from "@/lib/tournees/types";
import { creerEnvoyeurPush, type ClesVapid } from "./envoi";
import { NOMS_JOURS } from "@/lib/domaine/dates";
import { secteurDeLivraison } from "@/lib/domaine/secteurs";
import {
  dureeEstimee,
  heuresArrivee,
  messageAnnonce,
  messageDepart,
  messageMerci,
  messageProchain,
  type MessagePush,
} from "./messages";

/**
 * Notifications de livraison, envoyées depuis les actions de l'équipe
 * (démarrer la tournée, « Livré »). Jamais bloquantes : une panne d'envoi
 * n'empêche pas de livrer.
 */

/** Au-delà, un appui « Livré » envoyé en différé (hors connexion) ne prévient plus le suivant. */
export const FRAICHEUR_MAX_MS = 15 * 60 * 1000;

const schemaCles = z.object({ publique: z.string(), privee: z.string() });
let clesEnMemoire: ClesVapid | null = null;

/** Clés de signature : lues en base, créées à la première utilisation (équipe). */
export async function clesVapid(): Promise<ClesVapid> {
  if (clesEnMemoire) return clesEnMemoire;
  const supabase = await clientSupabase();
  const lire = async () => {
    const { data, error } = await supabase.rpc("cles_push");
    if (error) throw new Error(`Clés de notification : ${error.message}`);
    return data ? schemaCles.parse(data) : null;
  };
  let cles = await lire();
  if (!cles) {
    const nouvelles = webpush.generateVAPIDKeys();
    const { error } = await supabase.rpc("enregistrer_cles_push", {
      p_publique: nouvelles.publicKey,
      p_privee: nouvelles.privateKey,
    });
    if (error) throw new Error(`Clés de notification : ${error.message}`);
    cles = await lire();
  }
  if (!cles) throw new Error("Clés de notification introuvables.");
  clesEnMemoire = cles;
  return cles;
}

/** Clé publique pour abonner un téléphone (null tant que l'équipe ne les a pas créées). */
export async function clePubliqueVapid(): Promise<string | null> {
  const supabase = await clientSupabase();
  const { data } = await supabase.rpc("cle_publique_push");
  return data ?? null;
}

/** Contact du site, exigé par le protocole (https ou mailto). */
async function sujetVapid(): Promise<string> {
  const origine = await origineDuSite();
  if (origine.startsWith("https://")) return origine;
  const email = (process.env.EMAIL_ALERTES ?? "").split(",")[0]?.trim();
  return `mailto:${email || "contact@example.org"}`;
}

/** Envoie le message à tous les téléphones du client ; renvoie le nombre de téléphones atteints. */
export async function notifierClient(clientId: string, message: MessagePush): Promise<number> {
  const supabase = await clientSupabase();
  const { data: abonnements, error } = await supabase.rpc("abonnements_du_client", { p_client_id: clientId });
  if (error) throw new Error(error.message);
  if (!abonnements?.length) return 0;

  const envoyeur = creerEnvoyeurPush({ cles: await clesVapid(), sujet: await sujetVapid() });
  const resultats = await Promise.all(
    abonnements.map(async (a) => {
      const r = await envoyeur.envoyer(a, message);
      if (r === "expire") await supabase.rpc("supprimer_abonnement_push", { p_endpoint: a.endpoint });
      return r;
    }),
  );
  return resultats.filter((r) => r === "envoye").length;
}

/** Temps de route entre deux points, par les routes si possible. */
async function dureeDeRoute(de: Point, a: Point): Promise<number> {
  const r = await calculerTrajet([de, a]);
  return r.trajet?.troncons[0]?.dureeSecondes ?? dureeEstimee(distance(de, a));
}

async function reserver(ids: string[], type: "depart" | "prochain" | "merci"): Promise<string[]> {
  if (!ids.length) return [];
  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("reserver_notifications", { p_commandes: ids, p_type: type });
  if (error) throw new Error(error.message);
  return data ?? [];
}

const position = (c: { lat: number | null; lng: number | null }): Point | null =>
  c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null;

/**
 * Départ de la tournée : chaque client à livrer reçoit son rang et son heure
 * d'arrivée estimée (une seule fois). Renvoie l'heure de départ et le nombre
 * de clients prévenus.
 */
export async function prevenirDepart(date: string, secteurId: string) {
  const supabase = await clientSupabase();
  const { data, error } = await supabase.rpc("demarrer_tournee", { p_date: date, p_secteur_id: secteurId });
  if (error) throw new Error(error.message);
  const { demarree_le } = z.object({ demarree_le: z.string() }).parse(data);

  const [secteur, commandes] = await Promise.all([lireSecteur(secteurId), listerCommandesDuJour(date)]);
  const duSecteur = commandes.filter((c) => secteurDeLivraison(c) === secteurId);
  const derniereLivree = duSecteur
    .filter((c) => c.statut === "livree" && c.livree_le && position(c.client))
    .sort((a, b) => (a.livree_le! < b.livree_le! ? -1 : 1))
    .pop();
  const depart = (derniereLivree && position(derniereLivree.client)) || { lat: secteur.depart_lat, lng: secteur.depart_lng };
  const aLivrer = duSecteur.filter((c) => c.statut === "a_livrer" && position(c.client));

  // Temps de route jusqu'à chaque arrêt, dans l'ordre de la tournée
  const points = [depart, ...aLivrer.map((c) => position(c.client)!)];
  const trajet = (await calculerTrajet(points)).trajet;
  const durees =
    trajet && trajet.troncons.length === aLivrer.length
      ? trajet.troncons.map((t) => t.dureeSecondes)
      : aLivrer.map((_, k) => dureeEstimee(distance(points[k], points[k + 1])));
  const arrivees = heuresArrivee(new Date(), durees);

  const nouvelles = new Set(await reserver(aLivrer.map((c) => c.id), "depart"));
  // Le premier arrêt est aussi « le prochain » : pas de second message pour lui
  if (aLivrer[0]) await reserver([aLivrer[0].id], "prochain");

  let prevenus = 0;
  await Promise.all(
    aLivrer.map(async (c, k) => {
      if (!nouvelles.has(c.id)) return;
      if ((await notifierClient(c.client.id, messageDepart(k + 1, arrivees[k]))) > 0) prevenus++;
    }),
  );
  return { demarreeLe: demarree_le, clients: aLivrer.length, prevenus };
}

/**
 * Après un « Livré » : merci au client livré, et le client suivant de la
 * tournée est prévenu (sauf pour un appui ancien envoyé en différé). Chaque
 * message ne part qu'une fois.
 */
export async function apresLivraison(commandeLivreeId: string, prevenirSuivant: boolean): Promise<void> {
  const supabase = await clientSupabase();
  const { data: livree, error } = await supabase
    .from("commandes")
    .select("id, date_livraison, secteur_id, client:clients(id, secteur_id, lat, lng)")
    .eq("id", commandeLivreeId)
    .maybeSingle();
  if (error || !livree) return;

  if ((await reserver([livree.id], "merci")).length) {
    await notifierClient(livree.client.id, messageMerci(livree.id));
  }
  if (prevenirSuivant) await prevenirLeSuivant(livree);
}

async function prevenirLeSuivant(livree: {
  id: string;
  date_livraison: string;
  secteur_id: string | null;
  client: { secteur_id: string; lat: number | null; lng: number | null };
}): Promise<boolean> {
  const commandes = await listerCommandesDuJour(livree.date_livraison);
  const suivant = commandes.find(
    (c) => secteurDeLivraison(c) === secteurDeLivraison(livree) && c.statut === "a_livrer" && c.id !== livree.id,
  );
  if (!suivant) return false;
  if (!(await reserver([suivant.id], "prochain")).length) return false;

  const de = position(livree.client);
  const a = position(suivant.client);
  const duree = de && a ? await dureeDeRoute(de, a) : 15 * 60;
  return (await notifierClient(suivant.client.id, messageProchain(duree, new Date()))) > 0;
}

/** L'équipe note l'adresse publique du site, utilisée par les rappels automatiques. */
let urlNotee: string | null = null;
export async function noterUrlSite(): Promise<void> {
  const url = await origineDuSite();
  if (url === urlNotee || !url.startsWith("https://")) return;
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("noter_url_site", { p_url: url });
  if (!error) urlNotee = url;
}

/**
 * Composition de la semaine publiée : tous les clients abonnés sont prévenus,
 * une seule fois par semaine. Renvoie le nombre de téléphones atteints, ou
 * null si l'annonce était déjà partie.
 */
export async function annoncerComposition(semaine: string, contenuPrincipal: string | null): Promise<number | null> {
  const supabase = await clientSupabase();
  const { data: nouvelle, error } = await supabase.rpc("reserver_annonce", { p_semaine: semaine });
  if (error) throw new Error(error.message);
  if (!nouvelle) return null;

  const [{ data: abonnements, error: e2 }, { data: p }] = await Promise.all([
    supabase.rpc("abonnements_clients_actifs"),
    supabase.from("parametres_commandes").select("cloture_jour, cloture_heure").maybeSingle(),
  ]);
  if (e2) throw new Error(e2.message);
  const [h, m] = (p?.cloture_heure ?? "12:00").split(":");
  const cloture = p ? `${NOMS_JOURS[p.cloture_jour - 1]} ${Number(h)} h${m === "00" ? "" : ` ${m}`}` : null;
  const message = messageAnnonce(contenuPrincipal, cloture);

  const envoyeur = creerEnvoyeurPush({ cles: await clesVapid(), sujet: await sujetVapid() });
  const resultats = await Promise.all(
    (abonnements ?? []).map(async (a) => {
      const r = await envoyeur.envoyer(a, message);
      if (r === "expire") await supabase.rpc("supprimer_abonnement_push", { p_endpoint: a.endpoint });
      return r;
    }),
  );
  return resultats.filter((r) => r === "envoye").length;
}


/**
 * À chaque visite de l'équipe : clés de signature prêtes et adresse du site
 * notée pour le planificateur. Ne bloque jamais la page.
 */
export async function preparerNotifications(): Promise<void> {
  await Promise.all([clesVapid(), noterUrlSite()]).catch((e) => console.error("Préparation des notifications :", e));
}
