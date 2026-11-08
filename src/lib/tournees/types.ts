/**
 * Contrat de l'optimiseur de tournée. L'application ne dépend que de ces
 * types : changer de fournisseur revient à écrire une autre implémentation.
 */

export type Point = { lat: number; lng: number };

export type Arret = { id: string; position: Point };

export type Troncon = { distanceMetres: number; dureeSecondes: number };

/** Itinéraire routier passant par des points dans l'ordre */
export type Trajet = {
  /** Tracé à dessiner, dans l'ordre */
  geometrie: Point[];
  distanceMetres: number;
  dureeSecondes: number;
  /** Un tronçon par étape : du point i au point i + 1 */
  troncons: Troncon[];
};

export type ResultatOptimisation = {
  /** Identifiants des arrêts dans l'ordre de passage */
  ordre: string[];
  /** Distance totale estimée (mètres), retour compris si demandé */
  distanceMetres?: number;
  /** Durée de conduite estimée (secondes) */
  dureeSecondes?: number;
  methode: "openrouteservice" | "locale";
  /** Meilleur ordre possible pour ces distances ou ces temps (calcul exact) */
  optimal?: boolean;
};

export interface Optimiseur {
  optimiser(depart: Point, arrets: Arret[], options?: { retour?: boolean }): Promise<ResultatOptimisation>;
}

export class ErreurOptimisation extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ErreurOptimisation";
  }
}
