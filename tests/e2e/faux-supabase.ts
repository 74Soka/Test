/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Imitation minimale de l'API Supabase (auth + REST + géocodage) pour les tests
 * de bout en bout, sans Docker ni projet en ligne.
 *
 * - Crée une base Postgres jetable (migrations + données de démo) sur le
 *   serveur TEST_DATABASE_URL, détruite à l'arrêt.
 * - Traduit les requêtes REST de supabase-js en SQL (sous-ensemble utilisé par
 *   l'application). Pas de RLS ici : elle est testée à part (npm run test:db).
 * - Connexion : n'importe quel e-mail avec le mot de passe « demo-demo-demo ».
 * - Géocodage : /geocodage/search renvoie des adresses fictives ; une recherche
 *   contenant « panne » simule un service indisponible.
 * - OpenRouteService (/openrouteservice/v2/…, clé « cle-de-test ») : matrice et
 *   itinéraires calculés à vol d'oiseau × 1,3, à 50 km/h.
 */
import http from "node:http";
import crypto from "node:crypto";
import { Pool } from "pg";
import { creerBaseDeTest, supprimerBasesOrphelines, urlAvecBase, urlServeur } from "../db/outils";

const PORT = Number(process.env.PORT_FAUX_SUPABASE || 54399);
export const MOT_DE_PASSE_DEMO = "demo-demo-demo";
let db: any;
const UTILISATEUR = { id: "11111111-1111-4111-8111-111111111111", email: "admin@demo.fr" };

// Relations connues : table parente > table embarquée
const RELATIONS: Record<string, { type: "many" | "one"; fk: string }> = {
  "secteurs>secteur_communes": { type: "many", fk: "secteur_id" },
  "commandes>lignes_commande": { type: "many", fk: "commande_id" },
  "commandes>clients": { type: "one", fk: "client_id" },
  "commandes>recompenses_utilisees": { type: "many", fk: "commande_id" },
  "recompenses_utilisees>cadeaux": { type: "many", fk: "utilisation_id" },
  "tampons>commandes": { type: "one", fk: "commande_id" },
  "tampons>clients": { type: "one", fk: "filleul_id" },
};

function b64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}
function jeton() {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = b64url({ alg: "HS256", typ: "JWT" });
  const charge = b64url({
    sub: UTILISATEUR.id,
    email: UTILISATEUR.email,
    role: "authenticated",
    aud: "authenticated",
    exp: maintenant + 3600,
    iat: maintenant,
    session_id: "s",
  });
  const sig = crypto.createHmac("sha256", "secret").update(`${entete}.${charge}`).digest("base64url");
  return `${entete}.${charge}.${sig}`;
}
function utilisateurJson() {
  return {
    id: UTILISATEUR.id,
    aud: "authenticated",
    role: "authenticated",
    email: UTILISATEUR.email,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

const ADRESSES_FICTIVES = [
  { label: "12 Rue Démo 83400 Hyères", name: "12 Rue Démo", postcode: "83400", city: "Hyères", citycode: "83069", type: "housenumber", lon: 6.1301, lat: 43.1199 },
  { label: "3 Chemin des Oliviers 83230 Bormes-les-Mimosas", name: "3 Chemin des Oliviers", postcode: "83230", city: "Bormes-les-Mimosas", citycode: "83019", type: "housenumber", lon: 6.3431, lat: 43.1507 },
];

function geocodage(url: URL, res: http.ServerResponse) {
  const q = (url.searchParams.get("q") || "").toLowerCase();
  if (q.includes("panne")) return repondre(res, 503, { message: "indisponible" });
  const mots = q.split(/\s+/).filter(Boolean);
  const trouvees = ADRESSES_FICTIVES.filter((a) => mots.some((m) => a.label.toLowerCase().includes(m)));
  repondre(res, 200, {
    type: "FeatureCollection",
    features: trouvees.map((a) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [a.lon, a.lat] },
      properties: { ...a, score: 0.9 },
    })),
  });
}

const CLE_ORS = "cle-de-test";

function metres([lng1, lat1]: number[], [lng2, lat2]: number[]) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 1.3 * 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

async function openrouteservice(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (req.headers.authorization !== CLE_ORS) return repondre(res, 403, { error: "Access to this API has been disallowed" });
  const corps = await lireCorps(req);
  if (url.pathname === "/openrouteservice/v2/matrix/driving-car") {
    const lieux: number[][] = corps.locations;
    const distances = lieux.map((a) => lieux.map((b) => metres(a, b)));
    return repondre(res, 200, { distances, durations: distances.map((l) => l.map((d) => d / 13.9)) });
  }
  if (url.pathname === "/openrouteservice/v2/directions/driving-car/geojson") {
    const points: number[][] = corps.coordinates;
    const ligne = points.flatMap((p, i) =>
      i === 0 ? [p] : [[(points[i - 1][0] + p[0]) / 2 + 0.002, (points[i - 1][1] + p[1]) / 2], p],
    );
    const segments = points.slice(1).map((p, i) => ({ distance: metres(points[i], p), duration: metres(points[i], p) / 13.9 }));
    return repondre(res, 200, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: ligne },
          properties: {
            segments,
            summary: {
              distance: segments.reduce((t, s) => t + s.distance, 0),
              duration: segments.reduce((t, s) => t + s.duration, 0),
            },
          },
        },
      ],
    });
  }
  repondre(res, 404, { error: { code: 2099, message: "inconnu" } });
}

const ident = (n: string) => `"${n.replace(/"/g, "")}"`;

// select=a,b,alias:table(c,d) → { cols, embeds }
function analyserSelect(sel: string) {
  const parties: string[] = [];
  let prof = 0,
    courant = "";
  for (const ch of sel) {
    if (ch === "(") prof++;
    if (ch === ")") prof--;
    if (ch === "," && prof === 0) {
      parties.push(courant.trim());
      courant = "";
    } else courant += ch;
  }
  if (courant.trim()) parties.push(courant.trim());
  const cols: string[] = [],
    embeds: { alias: string; table: string; select: string }[] = [];
  for (const p of parties) {
    const m = /^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/s.exec(p);
    if (m) embeds.push({ alias: m[1] || m[2], table: m[2], select: m[3] });
    else cols.push(p.replace(/\s/g, ""));
  }
  return { cols, embeds };
}

function sqlSelect(table: string, sel: string, alias = "t"): string {
  const { cols, embeds } = analyserSelect(sel);
  const champs = cols.map((c) => (c === "*" ? `${alias}.*` : `${alias}.${ident(c)}`));
  embeds.forEach((e, i) => {
    const rel = RELATIONS[`${table}>${e.table}`];
    if (!rel) throw new Error(`relation inconnue ${table}>${e.table}`);
    const a2 = `e${i}${alias}`;
    const interne = sqlSelect(e.table, e.select, a2);
    if (rel.type === "many") {
      champs.push(
        `(select coalesce(json_agg(row_to_json(x)), '[]') from (select ${interne} from public.${ident(e.table)} ${a2} where ${a2}.${ident(rel.fk)} = ${alias}.id) x) as ${ident(e.alias)}`,
      );
    } else {
      champs.push(
        `(select row_to_json(x) from (select ${interne} from public.${ident(e.table)} ${a2} where ${a2}.id = ${alias}.${ident(rel.fk)}) x) as ${ident(e.alias)}`,
      );
    }
  });
  return champs.join(", ");
}

function filtres(params: URLSearchParams, valeurs: unknown[]) {
  const conds: string[] = [];
  const reserves = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
  for (const [cle, val] of params) {
    if (reserves.has(cle)) continue;
    const m = /^(not\.)?(eq|neq|gte|lte|gt|lt|in|is)\.(.*)$/s.exec(val);
    if (!m) throw new Error(`filtre inconnu ${cle}=${val}`);
    const [, non, op, brut] = m;
    const col = `t.${ident(cle)}`;
    let c: string;
    if (op === "in") {
      const liste = brut.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      valeurs.push(liste);
      c = `${col}::text = any($${valeurs.length}::text[])`;
    } else if (op === "is") {
      c = `${col} is ${brut === "null" ? "null" : brut}`;
    } else {
      valeurs.push(brut);
      const sqlop = ({ eq: "=", neq: "<>", gte: ">=", lte: "<=", gt: ">", lt: "<" } as Record<string, string>)[op];
      c = `${col}::text ${sqlop} $${valeurs.length}`;
      if (op !== "eq" && op !== "neq") c = `${col} ${sqlop} $${valeurs.length}`;
    }
    conds.push(non ? `not (${c})` : c);
  }
  return conds.length ? `where ${conds.join(" and ")}` : "";
}

function ordre(params: URLSearchParams) {
  const o = params.get("order");
  if (!o) return "";
  return (
    "order by " +
    o
      .split(",")
      .map((p: string) => {
        const [col, sens] = p.split(".");
        return `t.${ident(col)} ${sens === "desc" ? "desc" : "asc"}`;
      })
      .join(", ")
  );
}

async function lireCorps(req: http.IncomingMessage): Promise<any> {
  const morceaux: Buffer[] = [];
  for await (const m of req) morceaux.push(m);
  const texte = Buffer.concat(morceaux).toString();
  return texte ? JSON.parse(texte) : null;
}

function repondre(res: http.ServerResponse, statut: number, corps?: unknown, entetes: Record<string, string> = {}) {
  res.writeHead(statut, { "content-type": "application/json", ...entetes });
  res.end(corps === undefined ? "" : JSON.stringify(corps));
}

function erreurPg(res: http.ServerResponse, e: any) {
  repondre(res, e.code && e.code.startsWith("PN") ? 400 : e.code === "23505" ? 409 : 400, {
    code: e.code,
    message: e.message,
    details: e.detail ?? null,
    hint: e.hint ?? null,
  });
}

async function rest(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const [, , , table] = url.pathname.split("/"); // /rest/v1/<table>
  const params = url.searchParams;
  const objet = (req.headers.accept || "").includes("vnd.pgrst.object");
  const prefer = req.headers.prefer || "";
  const valeurs: unknown[] = [];

  if (table === "rpc") {
    const fn = url.pathname.split("/")[4];
    const args = (await lireCorps(req)) || {};
    const noms = Object.keys(args);
    // Types des paramètres : un tableau Postgres (uuid[]) ne se passe pas comme du JSON
    const { rows: types } = await db.query(
      `select a.nom, a.type from pg_proc p,
         unnest(p.proargnames, (p.proargtypes::oid[])::regtype[]::text[]) as a(nom, type)
       where p.proname = $1`,
      [fn],
    );
    const typeDe = (nom: string) => types.find((t: { nom: string }) => t.nom === nom)?.type ?? "";
    const valeur = (nom: string) => {
      const v = args[nom];
      if (Array.isArray(v) && typeDe(nom).endsWith("[]")) return v;
      return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
    };
    const sql = `select public.${ident(fn)}(${noms.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`;
    const r = await db.query(sql, noms.map(valeur));
    return repondre(res, 200, r.rows[0].r);
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (table === "profils") {
      const ligne = { role: "admin" };
      return repondre(res, 200, objet ? ligne : [ligne]);
    }
    const where = filtres(params, valeurs);
    const limite = params.get("limit") ? `limit ${Number(params.get("limit"))}` : "";
    const sql = `select coalesce(json_agg(row_to_json(t)), '[]') as d from (select ${sqlSelect(table, params.get("select") || "*")} from public.${ident(table)} t ${where} ${ordre(params)} ${limite}) t`;
    const lignes = (await db.query(sql, valeurs)).rows[0].d;
    if (req.method === "HEAD" || prefer.includes("count=")) {
      const n = lignes.length;
      return repondre(res, 200, req.method === "HEAD" ? undefined : lignes, { "content-range": `0-${Math.max(n - 1, 0)}/${n}` });
    }
    if (objet) {
      if (lignes.length > 1) return repondre(res, 406, { code: "PGRST116", message: "plusieurs lignes" });
      return repondre(res, 200, lignes[0] ?? null);
    }
    return repondre(res, 200, lignes);
  }

  const corps = await lireCorps(req);
  const retour = prefer.includes("return=representation");
  const selectRetour = params.get("select") || "*";

  if (req.method === "POST") {
    const lignes = Array.isArray(corps) ? corps : [corps];
    const cols = [...new Set(lignes.flatMap(Object.keys))];
    const conflit = params.get("on_conflict");
    const surConflit = conflit
      ? `on conflict (${conflit.split(",").map(ident).join(",")}) do update set ${cols.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`
      : "";
    const sql = `with ins as (insert into public.${ident(table)} (${cols.map(ident).join(",")}) select ${cols.map(ident).join(",")} from json_populate_recordset(null::public.${ident(table)}, $1) ${surConflit} returning *) select coalesce(json_agg(row_to_json(t)), '[]') as d from (select ${sqlSelect(table, selectRetour)} from ins t) t`;
    const d = (await db.query(sql, [JSON.stringify(lignes)])).rows[0].d;
    return repondre(res, 201, retour ? (objet ? d[0] : d) : undefined);
  }
  if (req.method === "PATCH") {
    const cols = Object.keys(corps);
    valeurs.push(JSON.stringify(corps));
    const where = filtres(params, valeurs);
    const sql = `with maj as (update public.${ident(table)} t set ${cols.map((c) => `${ident(c)} = r.${ident(c)}`).join(", ")} from json_populate_record(null::public.${ident(table)}, $1) r ${where} returning t.*) select coalesce(json_agg(row_to_json(t)), '[]') as d from (select ${sqlSelect(table, selectRetour)} from maj t) t`;
    const d = (await db.query(sql, valeurs)).rows[0].d;
    return repondre(res, 200, retour ? (objet ? d[0] : d) : undefined);
  }
  if (req.method === "DELETE") {
    const where = filtres(params, valeurs);
    const r = await db.query(`delete from public.${ident(table)} t ${where}`, valeurs);
    return repondre(res, 204, undefined, { "content-range": `*/${r.rowCount}` });
  }
  repondre(res, 405, { message: "méthode" });
}

async function demarrer() {
  await supprimerBasesOrphelines("paniers_e2e");
  const base = await creerBaseDeTest({ avecDemo: true, prefixe: "paniers_e2e" });
  // Le compte de démo existe et est administrateur (les fonctions de tournée le vérifient)
  await base.client.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [
    UTILISATEUR.id,
    UTILISATEUR.email,
  ]);
  await base.client.query("insert into public.profils (id, role) values ($1, 'admin') on conflict do nothing", [
    UTILISATEUR.id,
  ]);
  // Pool : l'application envoie plusieurs requêtes en parallèle. Chaque
  // connexion porte l'identité du compte de démo (auth.uid()).
  db = new Pool({ connectionString: urlAvecBase(urlServeur(), base.nom), max: 5 });
  db.on("connect", (connexion: { query: (sql: string, valeurs: unknown[]) => Promise<unknown> }) =>
    connexion.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: UTILISATEUR.id, role: "authenticated" }),
    ]),
  );
  const serveur = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    try {
      if (url.pathname === "/sante") return repondre(res, 200, { ok: true });
      if (url.pathname.startsWith("/geocodage/search")) return geocodage(url, res);
      if (url.pathname.startsWith("/openrouteservice/")) return await openrouteservice(req, res, url);
      if (url.pathname.startsWith("/auth/v1/token")) {
        const corps = await lireCorps(req);
        if (corps?.password !== MOT_DE_PASSE_DEMO) {
          return repondre(res, 400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
        }
        return repondre(res, 200, {
          access_token: jeton(),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "rt",
          user: utilisateurJson(),
        });
      }
      if (url.pathname === "/auth/v1/user") return repondre(res, 200, utilisateurJson());
      if (url.pathname === "/auth/v1/logout") return repondre(res, 204);
      if (url.pathname.startsWith("/rest/v1/")) return await rest(req, res, url);
      repondre(res, 404, { message: `inconnu ${url.pathname}` });
    } catch (e) {
      erreurPg(res, e);
    }
  });
  serveur.listen(PORT, () => console.log(`Faux Supabase prêt sur le port ${PORT} (base ${base.nom})`));
  const arreter = async () => {
    serveur.close();
    await db.end();
    await base.detruire();
    process.exit(0);
  };
  process.on("SIGTERM", arreter);
  process.on("SIGINT", arreter);
}

demarrer().catch((e) => {
  console.error(e);
  process.exit(1);
});
