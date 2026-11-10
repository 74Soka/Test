/**
 * Écriture des produits sur tout le site, comme la page des paniers : le mot
 * « BIO » devient une pastille verte, le reste du nom s'affiche tel quel.
 */

/** « 4 pommes BIO » → texte « 4 pommes » et pastille BIO. */
export function ligneProduit(ligne: string): { texte: string; bio: boolean } {
  const bio = /(^|\s)bio(\s|$)/i.test(ligne);
  const texte = bio ? ligne.replace(/(^|\s)bio(?=\s|$)/gi, " ").replace(/\s+/g, " ").trim() : ligne.trim();
  return { texte: texte || ligne.trim(), bio };
}

/** Lignes non vides d'une composition saisie « un produit par ligne ». */
export function lignesComposition(contenu: string | null): string[] {
  return (contenu ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
