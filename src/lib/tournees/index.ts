import "server-only";
import { optimiseurLocal } from "./locale";
import { creerOptimiseurORS } from "./openrouteservice";
import { ErreurOptimisation, type Arret, type Point, type ResultatOptimisation } from "./types";

export * from "./types";

/**
 * Optimise une tournée : OpenRouteService si une clé est configurée
 * (ORS_API_KEY), sinon calcul local à vol d'oiseau. En cas de panne du
 * service, on se rabat sur le calcul local et on le signale.
 */
export async function optimiserTournee(
  depart: Point,
  arrets: Arret[],
): Promise<ResultatOptimisation & { avertissement?: string }> {
  const cle = process.env.ORS_API_KEY;
  if (!cle) return optimiseurLocal.optimiser(depart, arrets, { retour: true });

  try {
    return await creerOptimiseurORS({ cle, baseUrl: process.env.ORS_URL || undefined }).optimiser(depart, arrets, {
      retour: true,
    });
  } catch (e) {
    console.error("Optimisation OpenRouteService :", e);
    const resultat = await optimiseurLocal.optimiser(depart, arrets, { retour: true });
    const raison = e instanceof ErreurOptimisation ? e.message : "Erreur du service d'itinéraires.";
    return { ...resultat, avertissement: `${raison} Ordre calculé à vol d'oiseau.` };
  }
}
