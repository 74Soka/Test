import { z } from "zod";
import type { Point, Trajet, Troncon } from "./types";

/**
 * Itinéraire routier côté téléphone : clé d'un trajet, mémorisation du
 * dernier tracé (pour le garder en zone blanche) et temps entre arrêts.
 */

export type ResultatTrajet = { trajet: Trajet } | { trajet: null; raison?: string };

export const CLE_STOCKAGE_TRAJET = "paniers:tournee:trajet";

/** Arrondi à 5 décimales (≈ 1 m) */
const arrondi = (x: number) => Math.round(x * 1e5) / 1e5;

/** Clé d'un trajet : les points dans l'ordre (départ, arrêts, retour). Se relit avec `pointsDeLaCle`. */
export function cleDuTrajet(points: Point[]): string {
  return JSON.stringify(points.map((p) => [arrondi(p.lat), arrondi(p.lng)]));
}

export function pointsDeLaCle(cle: string): Point[] {
  return (JSON.parse(cle) as [number, number][]).map(([lat, lng]) => ({ lat, lng }));
}

/** Allège le tracé à envoyer au téléphone : coordonnées arrondies, sans doublons. */
export function simplifierTrajet(trajet: Trajet): Trajet {
  const geometrie: Point[] = [];
  for (const p of trajet.geometrie) {
    const q = { lat: arrondi(p.lat), lng: arrondi(p.lng) };
    const dernier = geometrie[geometrie.length - 1];
    if (!dernier || dernier.lat !== q.lat || dernier.lng !== q.lng) geometrie.push(q);
  }
  return { ...trajet, geometrie };
}

const schemaTrajet = z.object({
  geometrie: z.array(z.object({ lat: z.number(), lng: z.number() })),
  distanceMetres: z.number(),
  dureeSecondes: z.number(),
  troncons: z.array(z.object({ distanceMetres: z.number(), dureeSecondes: z.number() })),
});

export function lireTrajetMemorise(stockage: Pick<Storage, "getItem"> | undefined, cle: string): Trajet | null {
  try {
    const brut = stockage?.getItem(CLE_STOCKAGE_TRAJET);
    const valeur = z.object({ cle: z.string(), trajet: schemaTrajet }).safeParse(brut ? JSON.parse(brut) : null);
    return valeur.success && valeur.data.cle === cle ? valeur.data.trajet : null;
  } catch {
    return null;
  }
}

/** Ne garde que le dernier tracé calculé. */
export function memoriserTrajet(stockage: Pick<Storage, "setItem"> | undefined, cle: string, trajet: Trajet): void {
  try {
    stockage?.setItem(CLE_STOCKAGE_TRAJET, JSON.stringify({ cle, trajet }));
  } catch {
    // Stockage plein ou interdit : tant pis, on recalculera
  }
}

/**
 * Pour un trajet départ → n arrêts → retour : le tronçon qui mène à chaque
 * arrêt (depuis le précédent, ou depuis le départ) et celui du retour.
 */
export function tempsEntreArrets(trajet: Trajet, n: number): { arrivees: Troncon[]; retour: Troncon } | null {
  if (n === 0 || trajet.troncons.length !== n + 1) return null;
  return { arrivees: trajet.troncons.slice(0, n), retour: trajet.troncons[n] };
}
