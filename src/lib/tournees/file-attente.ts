/**
 * File d'attente des appuis « Livré » faits sans réseau : ils sont gardés
 * dans le téléphone et envoyés dès que la connexion revient.
 */

export type ModePaiement = "especes" | "cheque";

export type ActionLivraison = {
  commandeId: string;
  livree: boolean;
  /** Payé à la livraison (absent dans les appuis enregistrés avant : payé) */
  payee?: boolean;
  /** « Livré et payé » : montant reçu et mode (absents : le client règle tout ce qu'il doit) */
  montantCentimes?: number;
  mode?: ModePaiement;
  /** Heure de l'appui (ISO), conservée comme heure de livraison */
  horodatage: string;
};

/** Résultat d'un envoi : refus métier (ex. commande annulée) ou succès. */
export type ReponseEnvoi = { ok: true } | { ok: false; erreur: string };

export const CLE_STOCKAGE = "paniers:tournee:file";

/** Ajoute un appui ; pour une même commande, seul le dernier compte. */
export function ajouterALaFile(file: ActionLivraison[], action: ActionLivraison): ActionLivraison[] {
  return [...file.filter((a) => a.commandeId !== action.commandeId), action];
}

/**
 * Envoie les appuis dans l'ordre. Une coupure réseau (exception) arrête
 * l'envoi : le reste attend. Un refus métier retire l'appui de la file et
 * est signalé.
 */
export async function viderFile(
  file: ActionLivraison[],
  envoyer: (action: ActionLivraison) => Promise<ReponseEnvoi>,
): Promise<{ restantes: ActionLivraison[]; refus: { action: ActionLivraison; erreur: string }[] }> {
  const refus: { action: ActionLivraison; erreur: string }[] = [];
  for (let i = 0; i < file.length; i++) {
    try {
      const r = await envoyer(file[i]);
      if (!r.ok) refus.push({ action: file[i], erreur: r.erreur });
    } catch {
      return { restantes: file.slice(i), refus };
    }
  }
  return { restantes: [], refus };
}

export function lireFile(stockage: Pick<Storage, "getItem"> | undefined): ActionLivraison[] {
  try {
    const brut = stockage?.getItem(CLE_STOCKAGE);
    const valeur: unknown = brut ? JSON.parse(brut) : [];
    return Array.isArray(valeur)
      ? valeur.filter(
          (a): a is ActionLivraison =>
            typeof a?.commandeId === "string" &&
            typeof a?.livree === "boolean" &&
            typeof a?.horodatage === "string" &&
            (a.payee === undefined || typeof a.payee === "boolean") &&
            (a.montantCentimes === undefined || (Number.isInteger(a.montantCentimes) && a.montantCentimes >= 0)) &&
            (a.mode === undefined || a.mode === "especes" || a.mode === "cheque"),
        )
      : [];
  } catch {
    return [];
  }
}

export function ecrireFile(stockage: Pick<Storage, "setItem"> | undefined, file: ActionLivraison[]): void {
  try {
    stockage?.setItem(CLE_STOCKAGE, JSON.stringify(file));
  } catch {
    // Stockage indisponible (navigation privée) : la file reste en mémoire
  }
}
