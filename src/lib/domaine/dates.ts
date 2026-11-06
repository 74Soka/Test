/**
 * Dates de livraison, manipulées sous forme de chaînes ISO « AAAA-MM-JJ »
 * (pas d'heure, donc pas de piège de fuseau horaire).
 */

export type DateIso = string;

export const NOMS_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const FORMAT_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function estDateIso(valeur: string): boolean {
  const m = FORMAT_ISO.exec(valeur);
  if (!m) return false;
  const d = versDateUtc(valeur);
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]);
}

function versDateUtc(iso: DateIso): Date {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j));
}

function depuisDateUtc(d: Date): DateIso {
  return d.toISOString().slice(0, 10);
}

/** Date du jour à Paris (le serveur peut tourner dans un autre fuseau). */
export function aujourdhui(maintenant: Date = new Date()): DateIso {
  // en-CA donne directement le format AAAA-MM-JJ
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(maintenant);
}

export function ajouterJours(iso: DateIso, jours: number): DateIso {
  const d = versDateUtc(iso);
  d.setUTCDate(d.getUTCDate() + jours);
  return depuisDateUtc(d);
}

/** Jour ISO de la semaine : 1 = lundi … 7 = dimanche. */
export function jourSemaine(iso: DateIso): number {
  const j = versDateUtc(iso).getUTCDay();
  return j === 0 ? 7 : j;
}

/** Première date ≥ `aPartirDe` qui tombe le jour ISO `jour`. */
export function prochaineDate(jour: number, aPartirDe: DateIso): DateIso {
  const ecart = (jour - jourSemaine(aPartirDe) + 7) % 7;
  return ajouterJours(aPartirDe, ecart);
}

/** Lundi de la semaine contenant `iso`. */
export function lundiDeLaSemaine(iso: DateIso): DateIso {
  return ajouterJours(iso, 1 - jourSemaine(iso));
}

/** Les 7 jours (lundi → dimanche) de la semaine contenant `iso`. */
export function joursDeLaSemaine(iso: DateIso): DateIso[] {
  const lundi = lundiDeLaSemaine(iso);
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
}

/** « samedi 7 novembre » (+ l'année si demandée). */
export function formaterDate(iso: DateIso, options: { annee?: boolean } = {}): string {
  const d = versDateUtc(iso);
  const texte = `${NOMS_JOURS[jourSemaine(iso) - 1]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
  return options.annee ? `${texte} ${d.getUTCFullYear()}` : texte;
}

const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/** « sam. 7 nov. » : format court pour les listes. */
export function formaterDateCourte(iso: DateIso): string {
  const d = versDateUtc(iso);
  const jour = NOMS_JOURS[jourSemaine(iso) - 1].slice(0, 3);
  return `${jour}. ${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`;
}

/** « Semaine du 2 au 8 novembre » */
export function formaterSemaine(iso: DateIso): string {
  const lundi = lundiDeLaSemaine(iso);
  const dimanche = ajouterJours(lundi, 6);
  const dl = versDateUtc(lundi);
  const dd = versDateUtc(dimanche);
  const debut =
    dl.getUTCMonth() === dd.getUTCMonth() ? `${dl.getUTCDate()}` : `${dl.getUTCDate()} ${MOIS[dl.getUTCMonth()]}`;
  return `Semaine du ${debut} au ${dd.getUTCDate()} ${MOIS[dd.getUTCMonth()]}`;
}

export function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
