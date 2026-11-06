/**
 * Contrat du géocodeur. L'application ne dépend que de ces types : changer de
 * fournisseur revient à écrire une autre implémentation de `Geocodeur`.
 */

export type Precision = "numero" | "rue" | "lieu-dit" | "commune";

export type AdresseTrouvee = {
  /** Libellé complet : « 12 Rue des Lilas 83000 Toulon » */
  libelle: string;
  /** Ligne d'adresse : « 12 Rue des Lilas » */
  ligne: string;
  codePostal: string;
  commune: string;
  codeInsee: string;
  lat: number;
  lng: number;
  /** Indice de confiance du fournisseur, entre 0 et 1 */
  score: number;
  precision: Precision;
};

export type CommuneTrouvee = {
  nom: string;
  codeInsee: string;
  codePostal: string;
  lat: number;
  lng: number;
};

export type Proximite = { lat: number; lng: number };

export interface Geocodeur {
  rechercherAdresses(texte: string, options?: { proche?: Proximite; limite?: number }): Promise<AdresseTrouvee[]>;
  rechercherCommunes(texte: string, options?: { proche?: Proximite; limite?: number }): Promise<CommuneTrouvee[]>;
}

export class ErreurGeocodage extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ErreurGeocodage";
  }
}
