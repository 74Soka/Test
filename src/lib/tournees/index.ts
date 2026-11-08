import "server-only";
import { optimiseurLocal } from "./locale";
import { creerClientORS, creerOptimiseurORS } from "./openrouteservice";
import { simplifierTrajet, type ResultatTrajet } from "./trajet";
import { ErreurOptimisation, type Arret, type Point, type ResultatOptimisation } from "./types";

export * from "./types";

/**
 * Point d'entrée serveur des tournées. Avec une clé OpenRouteService
 * (ORS_API_KEY ; ORS_URL pour une autre adresse du service), tout est calculé
 * en voiture sur les routes ; sans clé, ou si le service est en panne, à vol
 * d'oiseau (et on le dit).
 */

const options = () => ({ cle: process.env.ORS_API_KEY ?? "", baseUrl: process.env.ORS_URL || undefined });

export async function optimiserTournee(
  depart: Point,
  arrets: Arret[],
): Promise<ResultatOptimisation & { avertissement?: string }> {
  if (!process.env.ORS_API_KEY) return optimiseurLocal.optimiser(depart, arrets, { retour: true });

  try {
    return await creerOptimiseurORS(options()).optimiser(depart, arrets, { retour: true });
  } catch (e) {
    console.error("Optimisation OpenRouteService :", e);
    const resultat = await optimiseurLocal.optimiser(depart, arrets, { retour: true });
    const raison = e instanceof ErreurOptimisation ? e.message : "Erreur du service d'itinéraires.";
    return { ...resultat, avertissement: `${raison} Ordre calculé à vol d'oiseau.` };
  }
}

/**
 * Itinéraire en voiture passant par les points dans l'ordre. Sans clé : pas
 * d'itinéraire (la carte garde des lignes droites) ; en cas de panne : la raison.
 */
export async function calculerTrajet(points: Point[]): Promise<ResultatTrajet> {
  if (!process.env.ORS_API_KEY || points.length < 2) return { trajet: null };
  try {
    return { trajet: simplifierTrajet(await creerClientORS(options()).trajet(points)) };
  } catch (e) {
    console.error("Itinéraire OpenRouteService :", e);
    return { trajet: null, raison: e instanceof ErreurOptimisation ? e.message : "Itinéraire indisponible." };
  }
}
