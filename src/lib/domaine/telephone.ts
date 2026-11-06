/**
 * Téléphones : stockés au format international E.164 (+33612345678),
 * affichés au format français (06 12 34 56 78).
 */

/** Renvoie le numéro au format E.164, ou null si la saisie n'est pas un numéro valide. */
export function normaliserTelephone(saisie: string): string | null {
  const brut = saisie.trim();
  if (!brut) return null;
  const chiffres = brut.replace(/[\s.\-()/]/g, "");

  // Numéro français : 0X XX XX XX XX
  if (/^0[1-9]\d{8}$/.test(chiffres)) {
    return `+33${chiffres.slice(1)}`;
  }
  // 0033… ou +33… ; +33 (0)6… toléré
  const international = chiffres.replace(/^00/, "+").replace(/^\+33\(?0\)?/, "+33");
  if (/^\+33[1-9]\d{8}$/.test(international)) {
    return international;
  }
  // Autre pays (9 à 15 chiffres au total)
  if (/^\+[1-9]\d{8,14}$/.test(international)) {
    return international;
  }
  return null;
}

/** Affichage lisible : 06 12 34 56 78 pour la France, sinon tel quel. */
export function formaterTelephone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+33([1-9]\d{8})$/.exec(e164);
  if (!m) return e164;
  return `0${m[1]}`.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** Numéro de mobile français (06 / 07) : utile pour proposer l'envoi d'un SMS. */
export function estMobile(e164: string | null | undefined): boolean {
  return !!e164 && /^\+33[67]\d{8}$/.test(e164);
}
