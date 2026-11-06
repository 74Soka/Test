/** Minuscules sans accents, pour une recherche tolérante (« Hyeres » trouve « Hyères »). */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai si chaque mot recherché apparaît dans l'un des champs. */
export function correspond(recherche: string, champs: (string | null | undefined)[]): boolean {
  const mots = normaliser(recherche).split(" ").filter(Boolean);
  if (mots.length === 0) return true;
  const cible = normaliser(champs.filter(Boolean).join(" "));
  const cibleChiffres = cible.replace(/\D/g, "");
  return mots.every((mot) => {
    if (cible.includes(mot)) return true;
    // Numéro de téléphone saisi avec ou sans espaces / indicatif
    const chiffres = mot.replace(/\D/g, "");
    if (chiffres.length >= 4 && chiffres.length === mot.length) {
      return cibleChiffres.includes(chiffres) || cibleChiffres.includes(chiffres.replace(/^0/, "33"));
    }
    return false;
  });
}

export function nomComplet(personne: { prenom?: string | null; nom: string }): string {
  return [personne.prenom, personne.nom].filter((p) => p && p.trim()).join(" ");
}

/** Texte vide ou blanc → null. */
export function videVersNull(texte: string | null | undefined): string | null {
  const t = texte?.trim();
  return t ? t : null;
}
