import { formaterPrix } from "./argent";

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

/** Sans panier, une commande doit atteindre ce montant de suppléments (règle aussi vérifiée en base). */
export const MINIMUM_SANS_PANIER_CENTIMES = 3000;

/**
 * Ce qui manque pour valider : rien (null) avec un panier ou 30 € de suppléments,
 * sinon le message à afficher.
 */
export function manquePourCommander(aUnPanier: boolean, totalCentimes: number): string | null {
  if (aUnPanier || totalCentimes >= MINIMUM_SANS_PANIER_CENTIMES) return null;
  if (totalCentimes === 0) return "Choisissez au moins un panier, ou 30 € de suppléments.";
  const reste = MINIMUM_SANS_PANIER_CENTIMES - totalCentimes;
  return `Sans panier, 30 € de suppléments minimum : encore ${formaterPrix(reste)}.`;
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
  /** Dont offerts (récompenses de fidélité) */
  offerts: number;
};

type ArticleCompte = Pick<LigneAvecPrix, "article_id" | "libelle" | "categorie" | "quantite">;

/** Articles offerts d'une commande (récompenses de fidélité). */
export function articlesOfferts(recompenses: { cadeaux: ArticleCompte[] }[] | null | undefined): ArticleCompte[] {
  return (recompenses ?? []).flatMap((r) => r.cadeaux);
}

/**
 * Récapitulatif à préparer : quantités totales par article (achetés + offerts),
 * paniers d'abord. Les commandes annulées sont ignorées.
 */
export function recapitulatif(
  commandes: { statut: Statut; lignes: ArticleCompte[]; recompenses?: { cadeaux: ArticleCompte[] }[] | null }[],
): LigneRecap[] {
  const parArticle = new Map<string, LigneRecap>();
  const ajouter = (l: ArticleCompte, offert: boolean) => {
    const existant = parArticle.get(l.article_id);
    if (existant) {
      existant.quantite += l.quantite;
      if (offert) existant.offerts += l.quantite;
    } else {
      parArticle.set(l.article_id, {
        article_id: l.article_id,
        libelle: l.libelle,
        categorie: l.categorie,
        quantite: l.quantite,
        offerts: offert ? l.quantite : 0,
      });
    }
  };
  for (const commande of commandes) {
    if (commande.statut === "annulee") continue;
    commande.lignes.forEach((l) => ajouter(l, false));
    articlesOfferts(commande.recompenses).forEach((l) => ajouter(l, true));
  }
  return [...parArticle.values()].sort(
    (a, b) =>
      (a.categorie === b.categorie ? 0 : a.categorie === "panier" ? -1 : 1) || a.libelle.localeCompare(b.libelle, "fr"),
  );
}
