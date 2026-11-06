import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client, type ClientBase } from "pg";

/**
 * Banc de test de la base : crée une base Postgres neuve, y applique un
 * équivalent minimal de Supabase (rôles, auth.uid()), toutes les migrations
 * puis éventuellement les données de démo.
 *
 * Variable d'environnement : TEST_DATABASE_URL, connexion à un serveur Postgres
 * (≥ 15) avec un compte autorisé à créer des bases. Exemple avec Supabase local :
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
 */

const racine = path.resolve(__dirname, "../..");

export function urlServeur(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL manquant : indiquez un serveur Postgres pour les tests de la base (voir README).",
    );
  }
  return url;
}

function urlAvecBase(url: string, base: string): string {
  const u = new URL(url);
  u.pathname = `/${base}`;
  return u.toString();
}

export function fichiersMigrations(): string[] {
  const dossier = path.join(racine, "supabase/migrations");
  return readdirSync(dossier)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dossier, f));
}

export type BaseDeTest = {
  client: Client;
  nom: string;
  detruire: () => Promise<void>;
};

export async function creerBaseDeTest(options: { avecDemo?: boolean } = {}): Promise<BaseDeTest> {
  const serveur = urlServeur();
  const nom = `paniers_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  const admin = new Client({ connectionString: serveur });
  await admin.connect();
  await admin.query(`create database ${nom}`);
  await admin.end();

  const client = new Client({ connectionString: urlAvecBase(serveur, nom) });
  await client.connect();
  await client.query("set client_min_messages = warning");

  const fichiers = [
    path.join(racine, "tests/db/supabase-stub.sql"),
    ...fichiersMigrations(),
    ...(options.avecDemo ? [path.join(racine, "supabase/seed.sql")] : []),
  ];
  for (const fichier of fichiers) {
    try {
      await client.query(readFileSync(fichier, "utf8"));
    } catch (e) {
      throw new Error(`Échec de ${path.relative(racine, fichier)} : ${(e as Error).message}`);
    }
  }

  return {
    client,
    nom,
    detruire: async () => {
      await client.end();
      const a = new Client({ connectionString: serveur });
      await a.connect();
      await a.query(`drop database if exists ${nom} with (force)`);
      await a.end();
    },
  };
}

export type Identite =
  | { role: "anon" }
  | { role: "authenticated"; userId: string };

/**
 * Exécute `fn` dans une transaction avec l'identité donnée (comme le ferait
 * l'API Supabase), puis valide la transaction : les contrôles différés
 * (ex. « au moins un panier ») s'appliquent donc réellement.
 */
export async function en<T>(
  client: ClientBase,
  identite: Identite,
  fn: (c: ClientBase) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${identite.role === "anon" ? "anon" : "authenticated"}`);
    const claims =
      identite.role === "anon"
        ? { role: "anon" }
        : { role: "authenticated", sub: identite.userId };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const resultat = await fn(client);
    await client.query("commit");
    return resultat;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

/** Crée un compte (auth.users) et, si demandé, son profil. Renvoie son id. */
export async function creerCompte(
  client: ClientBase,
  role: "admin" | "livreur" | null,
): Promise<string> {
  const id = randomUUID();
  await client.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@test.local`]);
  if (role) {
    await client.query("insert into public.profils (id, role) values ($1, $2)", [id, role]);
  }
  return id;
}

/** Code SQLSTATE d'une erreur Postgres (ou undefined). */
export function codeErreur(e: unknown): string | undefined {
  return (e as { code?: string }).code;
}
