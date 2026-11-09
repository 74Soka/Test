/**
 * Recette de la semaine : repère, pour chaque ingrédient, s'il est dans le
 * panier ou parmi les suppléments, d'après les mots en commun.
 */

export type Provenance = "panier" | "supplement" | null;

/** Mots qui ne désignent pas un produit (unités, contenants, liaisons). */
const MOTS_VIDES = new Set([
  "avec",
  "dans",
  "pour",
  "sans",
  "botte",
  "barquette",
  "bouquet",
  "cuillere",
  "soupe",
  "cafe",
  "pincee",
  "grande",
  "grand",
  "petite",
  "petit",
  "gros",
  "grosse",
  "facultatif",
  "frais",
  "fraiche",
  "artisanale",
]);

/** « Épinards » → « epinard », « poireaux » → « poireau », « œufs » → « oeuf ». */
export function motsCles(texte: string): Set<string> {
  const normalise = texte
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const mots = normalise
    .split(/[^a-z]+/)
    .filter((m) => m.length >= 4 && m !== "bio")
    .map((m) => m.replace(/(s|x)$/, ""))
    .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));
  return new Set(mots);
}

export function provenanceIngredient(ingredient: string, panier: string[], supplements: string[]): Provenance {
  const mots = motsCles(ingredient);
  if (mots.size === 0) return null;
  const partage = (lignes: string[]) => lignes.some((l) => [...motsCles(l)].some((m) => mots.has(m)));
  if (partage(panier)) return "panier";
  if (partage(supplements)) return "supplement";
  return null;
}

/** Infos courtes : « 4 personnes · 35 min · Facile » → trois pastilles. */
export function pastillesInfos(infos: string | null): string[] {
  return (infos ?? "")
    .split(/[·•|,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
