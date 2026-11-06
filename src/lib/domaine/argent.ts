/** Montants stockés en centimes. */

const format = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const formatSansDecimales = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 3000 → « 30 € » ; 3050 → « 30,50 € » */
export function formaterPrix(centimes: number): string {
  return centimes % 100 === 0 ? formatSansDecimales.format(centimes / 100) : format.format(centimes / 100);
}

/** « 30 », « 30,5 », « 30.50 », « 30 € » → 3000 / 3050 ; null si invalide. */
export function saisieVersCentimes(saisie: string): number | null {
  const texte = saisie.replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(texte)) return null;
  return Math.round(Number(texte) * 100);
}

/** 3050 → « 30,50 » (pour pré-remplir un champ) */
export function centimesVersSaisie(centimes: number): string {
  const euros = Math.floor(centimes / 100);
  const reste = centimes % 100;
  return reste === 0 ? `${euros}` : `${euros},${String(reste).padStart(2, "0")}`;
}
