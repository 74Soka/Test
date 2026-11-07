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

export type RecompenseProposee = {
  id: string;
  nom: string;
  description: string | null;
  cout_tampons: number;
  niveau: Niveau;
  article_id: string | null;
  actif: boolean;
};

/** Récompenses que le client peut utiliser tout de suite. */
export function recompensesDisponibles<T extends RecompenseProposee>(solde: number, niveau: Niveau, recompenses: T[]): T[] {
  return recompenses.filter((r) => r.actif && niveauSuffisant(niveau, r.niveau) && r.cout_tampons <= solde);
}

/** Prochaine récompense à atteindre (accessible au niveau du client) et tampons manquants. */
export function prochaineRecompense<T extends RecompenseProposee>(
  solde: number,
  niveau: Niveau,
  recompenses: T[],
): { recompense: T; manque: number } | null {
  const suivante = recompenses
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
