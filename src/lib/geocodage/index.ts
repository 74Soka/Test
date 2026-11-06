import "server-only";
import { creerGeocodeurGeoplateforme } from "./geoplateforme";
import type { Geocodeur } from "./types";

export * from "./types";

/**
 * Géocodeur utilisé par l'application (côté serveur, via /api/geocodage).
 * Pour changer de fournisseur, remplacez cette ligne par une autre
 * implémentation de `Geocodeur`.
 */
export const geocodeur: Geocodeur = creerGeocodeurGeoplateforme({
  baseUrl: process.env.GEOCODAGE_URL || undefined,
});
