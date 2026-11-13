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
/**
 * Jour à partir duquel l'équipe propose une livraison : aujourd'hui, jusqu'au
 * dimanche 12 h (heure de Paris) ; ensuite la semaine est terminée et on part
 * du lundi suivant. (Les clients, eux, s'arrêtent à la clôture du vendredi.)
 */
export function debutCommandesEquipe(maintenant: Date = new Date()): DateIso {
  const jour = aujourdhui(maintenant);
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" })
      .formatToParts(maintenant)
      .find((p) => p.type === "hour")?.value,
  );
  return jourSemaine(jour) === 7 && heure >= 12 ? ajouterJours(jour, 1) : jour;
}

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

/** « vendredi 13 novembre à 12 h » : un instant donné, lu à l'heure de Paris. */
export function formaterEcheance(instant: string | Date): string {
  const d = new Date(instant);
  const jour = aujourdhui(d);
  const [h, m] = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(d)
    .split(":");
  return `${formaterDate(jour)} à ${Number(h)} h${m === "00" ? "" : ` ${m}`}`;
}

/**
 * Numéro de semaine ISO (lundi → dimanche ; la semaine 1 contient le premier
 * jeudi de l'année) et l'année à laquelle elle appartient.
 */
export function numeroSemaine(iso: DateIso): { semaine: number; annee: number } {
  const jeudi = ajouterJours(lundiDeLaSemaine(iso), 3);
  const annee = Number(jeudi.slice(0, 4));
  const premierJeudi = prochaineDate(4, `${annee}-01-01`);
  const ecart = (versDateUtc(jeudi).getTime() - versDateUtc(premierJeudi).getTime()) / 86_400_000;
  return { semaine: Math.round(ecart / 7) + 1, annee };
}
