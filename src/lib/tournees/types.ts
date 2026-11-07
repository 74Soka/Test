/**
 * Contrat de l'optimiseur de tournée. L'application ne dépend que de ces
 * types : changer de fournisseur revient à écrire une autre implémentation.
 */

export type Point = { lat: number; lng: number };

export type Arret = { id: string; position: Point };

export type ResultatOptimisation = {
  /** Identifiants des arrêts dans l'ordre de passage */
  ordre: string[];
  /** Distance totale estimée (mètres), retour compris si demandé */
  distanceMetres?: number;
  /** Durée de conduite estimée (secondes) */
  dureeSecondes?: number;
  methode: "openrouteservice" | "locale";
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
