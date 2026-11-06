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
  valeurs: { categorie: "panier" | "supplement"; prix: number; actif?: boolean },
) {
  const n = suivant();
  const { rows } = await client.query<{ id: string }>(
    `insert into public.articles (nom, categorie, prix_centimes, actif)
     values ($1, $2, $3, $4) returning id`,
    [`Article ${n}`, valeurs.categorie, valeurs.prix, valeurs.actif ?? true],
  );
  return rows[0].id;
}

export type Ligne = { article_id: string; quantite: number };

/** Appelle la fonction enregistrer_commande. */
export async function enregistrerCommande(
  client: ClientBase,
  p: { clientId: string; date: string; lignes: Ligne[]; notes?: string | null; commandeId?: string | null },
) {
  const { rows } = await client.query<{ id: string }>(
    "select public.enregistrer_commande($1, $2, $3::jsonb, $4, $5) as id",
    [p.clientId, p.date, JSON.stringify(p.lignes), p.notes ?? null, p.commandeId ?? null],
  );
  return rows[0].id;
}
