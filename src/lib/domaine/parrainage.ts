/**
 * Codes de parrainage (calculés par la base) : « EVCA9616 », affichés
 * « EVCA 9616 ». Le filleul peut taper espaces, tirets et minuscules.
 */

/** « evca 9616 » → « EVCA9616 » */
export function normaliserCode(saisie: string): string {
  return saisie.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** « EVCA9616 » → « EVCA 9616 » (4 lettres, puis les chiffres) */
export function formaterCode(code: string): string {
  const c = normaliserCode(code);
  return c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}

/** Assez de caractères pour vérifier : 4 lettres et 4 chiffres. */
export function codeComplet(saisie: string): boolean {
  return /^[A-Z]{4}[0-9]{4,6}$/.test(normaliserCode(saisie));
}
