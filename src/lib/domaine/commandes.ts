export type Categorie = "panier" | "supplement";
export type Statut = "a_livrer" | "livree" | "annulee";

export const LIBELLES_STATUT: Record<Statut, string> = {
  a_livrer: "À livrer",
  livree: "Livrée",
  annulee: "Annulée",
};

export type LigneAvecPrix = {
  article_id: string;
  libelle: string;
  categorie: Categorie;
  quantite: number;
  prix_unitaire_centimes: number;
};

export function totalCommande(lignes: Pick<LigneAvecPrix, "quantite" | "prix_unitaire_centimes">[]): number {
  return lignes.reduce((total, l) => total + l.quantite * l.prix_unitaire_centimes, 0);
}

export function nombreDePaniers(lignes: Pick<LigneAvecPrix, "quantite" | "categorie">[]): number {
  return lignes.filter((l) => l.categorie === "panier").reduce((n, l) => n + l.quantite, 0);
}

/** Les quantités saisies contiennent-elles au moins un panier ? */
export function contientUnPanier(
  quantites: Record<string, number>,
  articles: { id: string; categorie: Categorie }[],
): boolean {
  return articles.some((a) => a.categorie === "panier" && (quantites[a.id] ?? 0) > 0);
}

/** Résumé lisible : « 2 × Panier 30 €, 1 × Œufs » */
export function resumeLignes(lignes: Pick<LigneAvecPrix, "libelle" | "quantite" | "categorie">[]): string {
  return [...lignes]
    .sort((a, b) => (a.categorie === b.categorie ? 0 : a.categorie === "panier" ? -1 : 1))
    .map((l) => `${l.quantite} × ${l.libelle}`)
    .join(", ");
}

export type LigneRecap = {
  article_id: string;
  libelle: string;
  categorie: Categorie;
  quantite: number;
};

/**
 * Récapitulatif à préparer : quantités totales par article, paniers d'abord.
 * Les commandes annulées sont ignorées.
 */
export function recapitulatif(
  commandes: { statut: Statut; lignes: Pick<LigneAvecPrix, "article_id" | "libelle" | "categorie" | "quantite">[] }[],
): LigneRecap[] {
  const parArticle = new Map<string, LigneRecap>();
  for (const commande of commandes) {
    if (commande.statut === "annulee") continue;
    for (const l of commande.lignes) {
      const existant = parArticle.get(l.article_id);
      if (existant) {
        existant.quantite += l.quantite;
      } else {
        parArticle.set(l.article_id, {
          article_id: l.article_id,
          libelle: l.libelle,
          categorie: l.categorie,
          quantite: l.quantite,
        });
      }
    }
  }
  return [...parArticle.values()].sort(
    (a, b) =>
      (a.categorie === b.categorie ? 0 : a.categorie === "panier" ? -1 : 1) || a.libelle.localeCompare(b.libelle, "fr"),
  );
}
