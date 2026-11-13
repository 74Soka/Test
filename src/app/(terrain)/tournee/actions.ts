"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerEquipe } from "@/lib/auth";
import { listerCommandesDuJour, lireSecteur } from "@/lib/donnees";
import { estDateIso } from "@/lib/domaine/dates";
import { messageErreur, type Resultat } from "@/lib/erreurs";
import { clientSupabase } from "@/lib/supabase/serveur";
import { apresLivraison, FRAICHEUR_MAX_MS, prevenirDepart } from "@/lib/notifications";
import { optimiserTournee as optimiser } from "@/lib/tournees";
import { secteurDeLivraison } from "@/lib/domaine/secteurs";

export type ResultatOptimisationTournee =
  | {
      ok: true;
      ordre: string[];
      distanceMetres?: number;
      dureeSecondes?: number;
      methode: string;
      optimal?: boolean;
      avertissement?: string;
    }
  | { ok: false; erreur: string };

/**
 * Calcule l'ordre de passage : les arrêts déjà livrés restent en tête, les
 * autres sont optimisés depuis le dernier arrêt livré (ou le point de départ).
 */
export async function optimiserTournee(date: string, secteurId: string): Promise<ResultatOptimisationTournee> {
  await exigerEquipe();
  if (!estDateIso(date) || !z.uuid().safeParse(secteurId).success) return { ok: false, erreur: "Tournée inconnue." };

  const [secteur, commandes] = await Promise.all([lireSecteur(secteurId), listerCommandesDuJour(date)]);
  const duSecteur = commandes.filter((c) => secteurDeLivraison(c) === secteurId);
  const livrees = duSecteur.filter((c) => c.statut === "livree");
  const aLivrer = duSecteur.filter((c) => c.statut !== "livree" && c.client.lat !== null && c.client.lng !== null);
  const sansPosition = duSecteur.filter((c) => c.statut !== "livree" && (c.client.lat === null || c.client.lng === null));

  const dernier = livrees[livrees.length - 1]?.client;
  const depart =
    dernier && dernier.lat !== null && dernier.lng !== null
      ? { lat: dernier.lat, lng: dernier.lng }
      : { lat: secteur.depart_lat, lng: secteur.depart_lng };

  const resultat = await optimiser(
    depart,
    aLivrer.map((c) => ({ id: c.id, position: { lat: c.client.lat as number, lng: c.client.lng as number } })),
  );
  const ordre = [...livrees.map((c) => c.id), ...resultat.ordre, ...sansPosition.map((c) => c.id)];

  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("enregistrer_ordre_tournee", { p_commandes: ordre });
  if (error) return { ok: false, erreur: messageErreur(error) };

  revalidatePath("/tournee");
  return {
    ok: true,
    ordre,
    distanceMetres: resultat.distanceMetres,
    dureeSecondes: resultat.dureeSecondes,
    methode: resultat.methode,
    optimal: resultat.optimal,
    avertissement: resultat.avertissement,
  };
}

export async function enregistrerOrdre(ordre: string[]): Promise<Resultat> {
  await exigerEquipe();
  const ids = z.array(z.uuid()).max(500).safeParse(ordre);
  if (!ids.success) return { ok: false, erreur: "Ordre invalide." };
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("enregistrer_ordre_tournee", { p_commandes: ids.data });
  if (error) return { ok: false, erreur: messageErreur(error) };
  revalidatePath("/tournee");
  return { ok: true };
}

export type ResultatDepart =
  | { ok: true; demarreeLe: string; clients: number; prevenus: number }
  | { ok: false; erreur: string };

/** Démarre la tournée : les clients qui ont activé les notifications reçoivent leur heure d'arrivée. */
export async function demarrerTournee(date: string, secteurId: string): Promise<ResultatDepart> {
  await exigerEquipe();
  if (!estDateIso(date) || !z.uuid().safeParse(secteurId).success) return { ok: false, erreur: "Tournée inconnue." };
  try {
    const r = await prevenirDepart(date, secteurId);
    revalidatePath("/tournee");
    return { ok: true, ...r };
  } catch (e) {
    console.error("Départ de tournée :", e);
    return { ok: false, erreur: "La tournée n'a pas pu être démarrée. Réessayez dans un instant." };
  }
}

/**
 * Livré (payé ou non) / pas livré. `horodatage` : heure de l'appui (envoyé plus tard si hors connexion).
 * Non payé : le montant s'ajoute au compte du client, à encaisser à la prochaine livraison.
 */
export async function marquerLivraison(
  commandeId: string,
  livree: boolean,
  horodatage?: string,
  payee = true,
  /** « Livré et payé » : montant reçu (centimes) et mode ; absents = tout ce qui est dû est réglé */
  paiement?: { montantCentimes: number; mode: "especes" | "cheque" | null },
): Promise<Resultat> {
  await exigerEquipe();
  if (!z.uuid().safeParse(commandeId).success) return { ok: false, erreur: "Commande inconnue." };
  const saisie = z
    .object({ montantCentimes: z.number().int().min(0).max(1_000_000), mode: z.enum(["especes", "cheque"]).nullable() })
    .optional()
    .safeParse(paiement);
  if (!saisie.success) return { ok: false, erreur: "Montant reçu invalide." };
  const heure = horodatage && !Number.isNaN(Date.parse(horodatage)) ? new Date(horodatage).toISOString() : undefined;
  const supabase = await clientSupabase();
  const { error } = await supabase.rpc("marquer_livraison", {
    p_commande_id: commandeId,
    p_livree: livree,
    p_livree_le: heure,
    p_payee: payee,
    p_montant_recu_centimes: livree && payee ? saisie.data?.montantCentimes : undefined,
    p_mode_paiement: livree && payee ? (saisie.data?.mode ?? undefined) : undefined,
  });
  if (error) return { ok: false, erreur: messageErreur(error) };

  // Merci au client livré ; le suivant est prévenu, sauf pour un appui ancien envoyé en différé
  if (livree) {
    const recent = !heure || Date.now() - Date.parse(heure) < FRAICHEUR_MAX_MS;
    await apresLivraison(commandeId, recent).catch((e: unknown) => console.error("Notifications après livraison :", e));
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
