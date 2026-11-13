import type { AdresseTrouvee } from "./types";

/** Mots trop courants pour reconnaître une rue */
const MOTS_COURANTS = new Set([
  "rue", "chemin", "che", "avenue", "av", "ave", "boulevard", "bd", "impasse", "imp", "allee", "place", "route", "rte",
  "lieu", "dit", "quartier", "residence", "res", "traverse", "montee", "lotissement", "lot", "hameau", "les", "des",
  "del", "dels", "aux", "sur", "sous", "bis", "ter",
]);

/** « 4 Chemin des Oliviers » → { oliviers } (sans accents ni mots courants) */
function motsDeLaRue(ligne: string): Set<string> {
  return new Set(
    ligne
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((m) => m.length >= 3 && !MOTS_COURANTS.has(m)),
  );
}

/**
 * Meilleur résultat pour une adresse déjà connue (fiche importée sans repère) :
 * accepté seulement s'il est dans le même code postal, assez précis (numéro,
 * rue ou lieu-dit, indice de confiance ≥ 0,5) et sur la même rue (un mot en
 * commun). Sinon null : l'équipe place le repère à la main.
 */
export function meilleurePosition(
  adresse: { codePostal: string; ligne?: string },
  resultats: AdresseTrouvee[],
): AdresseTrouvee | null {
  const voulus = adresse.ligne ? motsDeLaRue(adresse.ligne) : new Set<string>();
  const memeRue = (x: AdresseTrouvee) => voulus.size === 0 || [...motsDeLaRue(x.ligne)].some((m) => voulus.has(m));
  const r = resultats.find(
    (x) => x.codePostal === adresse.codePostal && x.precision !== "commune" && x.score >= 0.5 && memeRue(x),
  );
  return r ?? null;
}

/** Texte de recherche : « 4 rue Neuve 83000 Toulon » */
export const texteAdresse = (a: { ligne: string; codePostal: string; commune: string }) =>
  `${a.ligne} ${a.codePostal} ${a.commune}`.replace(/\s+/g, " ").trim();
