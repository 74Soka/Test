/**
 * Fidélité : règles d'affichage (le calcul des soldes est fait par la base).
 */

export type Niveau = "standard" | "vip" | "ultra";
export type Motif = "bienvenue" | "parrainage" | "commande" | "commande_filleul" | "ajustement";

export const LIBELLES_NIVEAU: Record<Niveau, string> = {
  standard: "Client",
  vip: "VIP",
  ultra: "Ultra",
};

export const LIBELLES_MOTIF: Record<Motif, string> = {
  bienvenue: "Bienvenue",
  parrainage: "Parrainage",
  commande: "Commande livrée",
  commande_filleul: "Commande d'un filleul",
  ajustement: "Ajustement",
};

const RANG: Record<Niveau, number> = { standard: 0, vip: 1, ultra: 2 };

/** Un client de ce niveau peut-il utiliser une récompense de ce niveau ? */
export function niveauSuffisant(client: Niveau, requis: Niveau): boolean {
  return RANG[client] >= RANG[requis];
}

export type TypeRecompense = "tampons" | "bienvenue_filleul" | "cadeau_parrain";

/** Fidélité d'un client, telle qu'utilisée dans la saisie des commandes. */
export type FideliteSaisie = {
  solde: number;
  niveau: Niveau;
  /** Le client a un parrain */
  filleul: boolean;
  /** Commandes non annulées */
  commandes: number;
  /** Confitures de parrainage à lui offrir */
  confitures: number;
};

export type RecompenseProposee = {
  id: string;
  nom: string;
  description: string | null;
  cout_tampons: number;
  niveau: Niveau;
  article_id: string | null;
  actif: boolean;
  type?: TypeRecompense;
};

/** Récompenses payées en tampons (hors cadeaux de parrainage). */
export function recompensesEnTampons<T extends RecompenseProposee>(recompenses: T[]): T[] {
  return recompenses.filter((r) => (r.type ?? "tampons") === "tampons");
}

/** Récompenses que le client peut utiliser tout de suite. */
export function recompensesDisponibles<T extends RecompenseProposee>(solde: number, niveau: Niveau, recompenses: T[]): T[] {
  return recompensesEnTampons(recompenses).filter(
    (r) => r.actif && niveauSuffisant(niveau, r.niveau) && r.cout_tampons <= solde,
  );
}

/**
 * Les œufs de bienvenue s'ajoutent d'office à la première commande d'un
 * filleul (livrée à partir du début de l'offre).
 */
export function oeufsDeBienvenue(
  client: { filleul: boolean; commandes: number } | undefined,
  dateLivraison: string | null,
  debutOffre: string,
): boolean {
  return Boolean(client?.filleul && client.commandes === 0 && dateLivraison && dateLivraison >= debutOffre);
}

/** Prochaine récompense à atteindre (accessible au niveau du client) et tampons manquants. */
export function prochaineRecompense<T extends RecompenseProposee>(
  solde: number,
  niveau: Niveau,
  recompenses: T[],
): { recompense: T; manque: number } | null {
  const suivante = recompensesEnTampons(recompenses)
    .filter((r) => r.actif && niveauSuffisant(niveau, r.niveau) && r.cout_tampons > solde)
    .sort((a, b) => a.cout_tampons - b.cout_tampons)[0];
  return suivante ? { recompense: suivante, manque: suivante.cout_tampons - solde } : null;
}

/** Prochain niveau et nombre de filleuls manquants. */
export function niveauSuivant(
  niveau: Niveau,
  filleulsComptes: number,
  parametres: { filleuls_vip: number; filleuls_ultra: number },
): { niveau: Niveau; manque: number } | null {
  if (niveau === "standard") return { niveau: "vip", manque: Math.max(0, parametres.filleuls_vip - filleulsComptes) };
  if (niveau === "vip") return { niveau: "ultra", manque: Math.max(0, parametres.filleuls_ultra - filleulsComptes) };
  return null;
}

/**
 * Solde disponible pendant la saisie d'une commande : solde actuel (qui compte
 * déjà les récompenses enregistrées sur cette commande), + celles qu'on retire,
 * - celles qu'on ajoute.
 */
export function soldeDisponible(
  soldeActuel: number,
  enregistrees: { id: string; cout_tampons: number }[],
  enCours: { id?: string | null; cout_tampons: number }[],
): number {
  const rendues = enregistrees
    .filter((e) => !enCours.some((c) => c.id === e.id))
    .reduce((t, e) => t + e.cout_tampons, 0);
  const ajoutees = enCours.filter((c) => !c.id).reduce((t, c) => t + c.cout_tampons, 0);
  return soldeActuel + rendues - ajoutees;
}

export function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${Math.abs(n) > 1 ? "s" : ""}`;
}
