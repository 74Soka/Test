/** Traduction des erreurs de la base en messages compréhensibles. */

export type ErreurBase = { code?: string; message?: string } | null | undefined;

export function messageErreur(
  erreur: ErreurBase,
  messages: Partial<Record<string, string>> = {},
): string {
  const code = erreur?.code ?? "";
  if (messages[code]) return messages[code]!;
  // Erreurs métier : le message rédigé en français dans la base est affichable tel quel.
  if (code.startsWith("PN") && erreur?.message) return erreur.message;
  switch (code) {
    case "23505":
      return "Cette valeur existe déjà.";
    case "23503":
      return "Cet élément est encore utilisé ailleurs.";
    case "23514":
      return "Une des valeurs saisies n'est pas valide.";
    case "42501":
      return "Vous n'avez pas le droit de faire cette action.";
    default:
      return "Une erreur est survenue. Réessayez dans un instant.";
  }
}

/** Résultat d'une action de formulaire. */
export type Resultat =
  | { ok: true }
  | { ok: false; erreur: string; champs?: Record<string, string>; lien?: { href: string; libelle: string } };

/** Convertit les erreurs de validation zod en messages par champ. */
export function erreursParChamp(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const issue of issues) {
    const cle = issue.path.map(String).join(".");
    if (cle && !champs[cle]) champs[cle] = issue.message;
  }
  return champs;
}
