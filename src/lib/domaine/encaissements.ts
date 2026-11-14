/**
 * Récapitulatif de l'argent d'une journée (ou d'une semaine) de livraisons,
 * par secteur et au total. Il retombe toujours sur le montant des commandes :
 *
 *   commandes = espèces + chèques + non précisé + avoirs déduits + reste dû
 *               + pas encore livré − encaissé en plus
 *
 * Pour une commande livrée, montant T, solde du client avant elle S
 * (+ dû, − avoir), argent reçu R :
 * - un avoir (S < 0) couvre d'abord la commande : « avoirs déduits » ;
 * - ce qui reste de la commande et n'est pas payé : « reste dû » ;
 * - ce qui est reçu au-delà de la commande (anciennes dettes réglées, ou
 *   trop-perçu qui devient un avoir) : « encaissé en plus ».
 * « Livré et payé » sans montant saisi = le client a tout réglé (mode non précisé).
 */

export type ModePaiement = "especes" | "cheque";

export type CommandeEncaissement = {
  secteurId: string;
  totalCentimes: number;
  statut: "a_livrer" | "livree" | "annulee";
  payee: boolean | null;
  montantRecuCentimes: number | null;
  modePaiement: ModePaiement | null;
  /** Solde du client sans cette commande : + dû, − avoir */
  soldeAvantCentimes: number;
  /** Compléments ajoutés par le livreur à la livraison (compris dans le total) */
  complementsQuantite?: number;
  complementsCentimes?: number;
};

export type Encaissements = {
  commandes: number;
  montantCommandes: number;
  especes: number;
  cheques: number;
  /** « Livré et payé » sans montant saisi (anciens appuis, « Marquer comme livrée ») */
  nonPrecise: number;
  avoirsDeduits: number;
  resteDu: number;
  encaisseEnPlus: number;
  pasEncoreLivre: number;
  /** Compléments ajoutés par le livreur : nombre d'articles et montant (compris dans les commandes) */
  complementsQuantite: number;
  complementsCentimes: number;
};

export const vide = (): Encaissements => ({
  commandes: 0,
  montantCommandes: 0,
  especes: 0,
  cheques: 0,
  nonPrecise: 0,
  avoirsDeduits: 0,
  resteDu: 0,
  encaisseEnPlus: 0,
  pasEncoreLivre: 0,
  complementsQuantite: 0,
  complementsCentimes: 0,
});

/** Argent encaissé (toutes formes). */
export const totalEncaisse = (e: Encaissements) => e.especes + e.cheques + e.nonPrecise;

/** Vérification : doit valoir le montant des commandes. */
export const totalReconcilie = (e: Encaissements) =>
  totalEncaisse(e) + e.avoirsDeduits + e.resteDu + e.pasEncoreLivre - e.encaisseEnPlus;

function ajouter(e: Encaissements, c: CommandeEncaissement) {
  const t = c.totalCentimes;
  e.commandes++;
  e.montantCommandes += t;
  e.complementsQuantite += c.complementsQuantite ?? 0;
  e.complementsCentimes += c.complementsCentimes ?? 0;
  if (c.statut !== "livree") {
    e.pasEncoreLivre += t;
    return;
  }
  const s = c.soldeAvantCentimes;
  const avoir = s < 0 ? Math.min(-s, t) : 0;
  const attendu = t - avoir;
  let recu = 0;
  if (c.payee !== false) {
    if (c.montantRecuCentimes === null) {
      recu = Math.max(0, t + s);
      e.nonPrecise += recu;
    } else {
      recu = c.montantRecuCentimes;
      if (c.modePaiement === "cheque") e.cheques += recu;
      else if (c.modePaiement === "especes") e.especes += recu;
      else e.nonPrecise += recu;
    }
  }
  const pourLaCommande = Math.min(recu, attendu);
  e.avoirsDeduits += avoir;
  e.resteDu += attendu - pourLaCommande;
  e.encaisseEnPlus += recu - pourLaCommande;
}

/** Par secteur (dans l'ordre de première apparition) et total ; commandes annulées ignorées. */
export function recapEncaissements(commandes: CommandeEncaissement[]): {
  parSecteur: Map<string, Encaissements>;
  total: Encaissements;
} {
  const parSecteur = new Map<string, Encaissements>();
  const total = vide();
  for (const c of commandes) {
    if (c.statut === "annulee") continue;
    if (!parSecteur.has(c.secteurId)) parSecteur.set(c.secteurId, vide());
    ajouter(parSecteur.get(c.secteurId)!, c);
    ajouter(total, c);
  }
  return { parSecteur, total };
}
