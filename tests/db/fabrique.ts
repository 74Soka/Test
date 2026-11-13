import type { ClientBase } from "pg";

/** Petites fonctions de création de données (exécutées en super-utilisateur). */

let compteur = 0;
const suivant = () => ++compteur;

export async function creerSecteur(client: ClientBase, valeurs: { jour?: number; communes?: string[] } = {}) {
  const n = suivant();
  const { rows } = await client.query<{ id: string }>(
    `insert into public.secteurs (nom, jour, creneau, depart_adresse, depart_lat, depart_lng)
     values ($1, $2, 'matin', 'Ferme test', 43.15, 6.07) returning id`,
    [`Secteur test ${n}`, valeurs.jour ?? 6],
  );
  const id = rows[0].id;
  for (const code of valeurs.communes ?? []) {
    await client.query(
      "insert into public.secteur_communes (secteur_id, code_insee, nom) values ($1, $2, $3)",
      [id, code, `Commune ${code}`],
    );
  }
  return id;
}

export async function creerClient(
  client: ClientBase,
  secteurId: string,
  valeurs: { parrainId?: string | null; actif?: boolean } = {},
) {
  const n = suivant();
  const { rows } = await client.query<{ id: string }>(
    `insert into public.clients (nom, prenom, adresse, code_postal, commune, code_insee, lat, lng, source_position, secteur_id, parrain_id, actif)
     values ($1, 'Test', '1 Rue Test', '83000', 'Toulon', '83137', 43.12, 5.93, 'adresse', $2, $3, $4)
     returning id`,
    [`Client ${n}`, secteurId, valeurs.parrainId ?? null, valeurs.actif ?? true],
  );
  return rows[0].id;
}

export async function creerArticle(
  client: ClientBase,
  valeurs: { categorie: "panier" | "supplement"; prix: number; actif?: boolean; tampons?: number },
) {
  const n = suivant();
  const { rows } = await client.query<{ id: string }>(
    `insert into public.articles (nom, categorie, prix_centimes, actif, tampons)
     values ($1, $2, $3, $4, $5) returning id`,
    [`Article ${n}`, valeurs.categorie, valeurs.prix, valeurs.actif ?? true, valeurs.tampons ?? 0],
  );
  return rows[0].id;
}

export type Ligne = { article_id: string; quantite: number };
export type RecompenseDemandee = { id?: string | null; recompense_id: string; articles: Ligne[] };

/** Appelle la fonction enregistrer_commande. */
export async function enregistrerCommande(
  client: ClientBase,
  p: {
    clientId: string;
    date: string;
    lignes: Ligne[];
    notes?: string | null;
    commandeId?: string | null;
    recompenses?: RecompenseDemandee[];
    /** Suppléments libres ; absent = ceux déjà sur la commande sont gardés */
    libres?: { libelle: string; quantite: number; prix_unitaire_centimes: number }[];
  },
) {
  const { rows } = await client.query<{ id: string }>(
    "select public.enregistrer_commande($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7::jsonb) as id",
    [
      p.clientId,
      p.date,
      JSON.stringify(p.lignes),
      p.notes ?? null,
      p.commandeId ?? null,
      JSON.stringify(p.recompenses ?? []),
      p.libres ? JSON.stringify(p.libres) : null,
    ],
  );
  return rows[0].id;
}

/** Solde, filleuls et niveau d'un client (vue fidelite_clients). */
export async function fidelite(client: ClientBase, clientId: string) {
  const { rows } = await client.query<{
    solde: number;
    tampons_gagnes: number;
    filleuls: number;
    filleuls_comptes: number;
    niveau: "standard" | "vip" | "ultra";
  }>(
    "select solde, tampons_gagnes, filleuls, filleuls_comptes, niveau from public.fidelite_clients where client_id = $1",
    [clientId],
  );
  return rows[0];
}

/** Id d'une récompense par son nom. */
export async function recompense(client: ClientBase, nom: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>("select id from public.recompenses where nom = $1", [nom]);
  return rows[0].id;
}

/** Livre une commande (comme le bouton « Livrée »). */
export async function livrer(client: ClientBase, commandeId: string) {
  await client.query("select public.changer_statut_commande($1, 'livree')", [commandeId]);
}
