import { NOMS_JOURS, majuscule, prochaineDate, type DateIso } from "./dates";

export type Creneau = "matin" | "apres_midi" | "journee";

export const LIBELLES_CRENEAU: Record<Creneau, string> = {
  matin: "matin",
  apres_midi: "après-midi",
  journee: "journée",
};

const ORDRE_CRENEAU: Record<Creneau, number> = { matin: 0, journee: 1, apres_midi: 2 };

type SecteurTournee = { jour: number; creneau: Creneau };

/** « Samedi matin » */
export function libelleTournee(secteur: SecteurTournee): string {
  return majuscule(`${NOMS_JOURS[secteur.jour - 1]} ${LIBELLES_CRENEAU[secteur.creneau]}`);
}

/** Tri chronologique des secteurs : par jour puis par créneau, puis par nom. */
export function comparerSecteurs<T extends SecteurTournee & { nom: string }>(a: T, b: T): number {
  return a.jour - b.jour || ORDRE_CRENEAU[a.creneau] - ORDRE_CRENEAU[b.creneau] || a.nom.localeCompare(b.nom, "fr");
}

/** Secteurs qui couvrent la commune (code INSEE). */
export function secteursPourCommune<T extends { id: string; communes: { code_insee: string }[] }>(
  codeInsee: string | null | undefined,
  secteurs: T[],
): T[] {
  if (!codeInsee) return [];
  return secteurs.filter((s) => s.communes.some((c) => c.code_insee === codeInsee));
}

/**
 * Proposition automatique : le secteur qui couvre la commune s'il est unique,
 * sinon rien (l'utilisateur choisit).
 */
export function secteurPropose<T extends { id: string; communes: { code_insee: string }[] }>(
  codeInsee: string | null | undefined,
  secteurs: T[],
): T | null {
  const candidats = secteursPourCommune(codeInsee, secteurs);
  return candidats.length === 1 ? candidats[0] : null;
}

/** Prochaine date de livraison du secteur, à partir d'aujourd'hui inclus. */
export function prochaineLivraison(secteur: { jour: number }, aujourdhui: DateIso): DateIso {
  return prochaineDate(secteur.jour, aujourdhui);
}
