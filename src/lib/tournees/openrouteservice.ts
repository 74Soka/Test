import { z } from "zod";
import { distance } from "./geo";
import { ARRETS_MAX_EXACT, ordonnerSelonCouts } from "./locale";
import { ErreurOptimisation, type Optimiseur, type Point, type Trajet } from "./types";

/**
 * OpenRouteService, en voiture, sur le réseau routier réel (OpenStreetMap).
 * Clé gratuite : openrouteservice.org (compte HeiGIT). Depuis l'automne 2026,
 * le service est servi par api.heigit.org (l'ancienne adresse
 * api.openrouteservice.org ferme).
 *
 * - matrice : temps et distances de route entre tous les lieux de la tournée,
 *   pour choisir l'ordre de passage ;
 * - trajet : l'itinéraire à dessiner, avec la durée de chaque tronçon.
 */

export const URL_OPENROUTESERVICE = "https://api.heigit.org/openrouteservice";

/** Lieux par matrice (départ compris) : le service limite le nombre de cases (≈ 3 500). */
export const LIEUX_MAX_MATRICE = 50;
/** Points par demande d'itinéraire (le service limite le nombre d'étapes) */
export const POINTS_PAR_TRAJET = 25;

export type Matrice = { durees: number[][]; distances: number[][] };

type Options = {
  cle: string;
  /** Adresse du service (sans le /v2) */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Délai d'attente par demande, en millisecondes */
  delai?: number;
  profil?: string;
};

const reponseMatrice = z.object({
  durations: z.array(z.array(z.number().nullable())),
  distances: z.array(z.array(z.number().nullable())),
});

const reponseTrajet = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({ coordinates: z.array(z.array(z.number()).min(2)) }),
        properties: z.object({
          summary: z.object({ distance: z.number().optional(), duration: z.number().optional() }).optional(),
          segments: z.array(z.object({ distance: z.number().optional(), duration: z.number().optional() })).optional(),
        }),
      }),
    )
    .min(1),
});

const versCoord = (p: Point) => [p.lng, p.lat];

/** Découpe une liste en morceaux qui se chevauchent d'un élément. */
export function decouper<T>(liste: T[], taille: number): T[][] {
  if (liste.length <= taille) return [liste];
  const morceaux: T[][] = [];
  for (let debut = 0; debut < liste.length - 1; debut += taille - 1) morceaux.push(liste.slice(debut, debut + taille));
  return morceaux;
}

export function creerClientORS(options: Options) {
  const baseUrl = (options.baseUrl ?? URL_OPENROUTESERVICE).replace(/\/+$/, "");
  const fetcher = options.fetch ?? fetch;
  const profil = options.profil ?? "driving-car";

  async function appeler(chemin: string, corps: unknown, accept = "application/json"): Promise<unknown> {
    let res: Response;
    try {
      res = await fetcher(`${baseUrl}/v2/${chemin}`, {
        method: "POST",
        headers: { Authorization: options.cle, "Content-Type": "application/json", Accept: accept },
        body: JSON.stringify(corps),
        signal: AbortSignal.timeout(options.delai ?? 15000),
      });
    } catch (e) {
      throw new ErreurOptimisation("Le service d'itinéraires ne répond pas.", e);
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const code = (detail as { error?: { code?: number } } | null)?.error?.code;
      throw new ErreurOptimisation(
        res.status === 401 || res.status === 403
          ? "Clé OpenRouteService refusée."
          : res.status === 429
            ? "Quota OpenRouteService dépassé pour aujourd'hui."
            : code === 2010 || code === 6010
              ? "Une adresse est trop loin d'une route : vérifiez sa position."
              : `Le service d'itinéraires a répondu avec une erreur (${res.status}).`,
        detail,
      );
    }
    return res.json().catch(() => null);
  }

  return {
    /** Durées (secondes) et distances (mètres) de route entre tous les lieux. */
    async matrice(lieux: Point[]): Promise<Matrice> {
      if (lieux.length > LIEUX_MAX_MATRICE) {
        throw new ErreurOptimisation(`Trop d'arrêts pour le calcul par les routes (${LIEUX_MAX_MATRICE - 1} au plus).`);
      }
      const donnees = reponseMatrice.safeParse(
        await appeler(`matrix/${profil}`, { locations: lieux.map(versCoord), metrics: ["duration", "distance"] }),
      );
      const n = lieux.length;
      if (!donnees.success || donnees.data.durations.length !== n || donnees.data.distances.length !== n) {
        throw new ErreurOptimisation("Réponse inattendue du service d'itinéraires.", donnees.error);
      }
      // Case vide (lieu injoignable par la route) : estimation à vol d'oiseau, sans l'éviter à tout prix
      const remplir = (m: (number | null)[][], estimation: (i: number, j: number) => number) =>
        lieux.map((_, i) => lieux.map((_, j) => m[i]?.[j] ?? estimation(i, j)));
      return {
        distances: remplir(donnees.data.distances, (i, j) => 1.5 * distance(lieux[i], lieux[j])),
        durees: remplir(donnees.data.durations, (i, j) => (1.5 * distance(lieux[i], lieux[j])) / 11),
      };
    },

    /** Itinéraire passant par les points dans l'ordre. */
    async trajet(points: Point[]): Promise<Trajet> {
      if (points.length < 2) return { geometrie: points, distanceMetres: 0, dureeSecondes: 0, troncons: [] };
      const parties: Trajet[] = [];
      for (const morceau of decouper(points, POINTS_PAR_TRAJET)) {
        const donnees = reponseTrajet.safeParse(
          await appeler(
            `directions/${profil}/geojson`,
            // Le plus rapide, comme les temps qui ont servi à choisir l'ordre.
            // Instructions laissées (par défaut) : ce sont elles qui donnent un tronçon par étape.
            { coordinates: morceau.map(versCoord), preference: "fastest" },
            "application/geo+json",
          ),
        );
        if (!donnees.success) throw new ErreurOptimisation("Réponse inattendue du service d'itinéraires.", donnees.error);
        const f = donnees.data.features[0];
        const troncons = (f.properties.segments ?? []).map((s) => ({
          distanceMetres: s.distance ?? 0,
          dureeSecondes: s.duration ?? 0,
        }));
        if (troncons.length !== morceau.length - 1) {
          throw new ErreurOptimisation("Réponse inattendue du service d'itinéraires.");
        }
        parties.push({
          geometrie: f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
          distanceMetres: f.properties.summary?.distance ?? troncons.reduce((t, s) => t + s.distanceMetres, 0),
          dureeSecondes: f.properties.summary?.duration ?? troncons.reduce((t, s) => t + s.dureeSecondes, 0),
          troncons,
        });
      }
      return {
        geometrie: parties.flatMap((p, i) => (i === 0 ? p.geometrie : p.geometrie.slice(1))),
        distanceMetres: parties.reduce((t, p) => t + p.distanceMetres, 0),
        dureeSecondes: parties.reduce((t, p) => t + p.dureeSecondes, 0),
        troncons: parties.flatMap((p) => p.troncons),
      };
    },
  };
}

/**
 * Optimiseur par les routes : temps de conduite réels entre tous les lieux
 * (matrice OpenRouteService), puis recherche du meilleur ordre sur ces temps.
 */
export function creerOptimiseurORS(options: Options): Optimiseur {
  const client = creerClientORS(options);
  return {
    async optimiser(depart, arrets, opts) {
      if (arrets.length === 0) return { ordre: [], methode: "openrouteservice", optimal: true };
      const retour = opts?.retour ?? true;
      const { durees, distances } = await client.matrice([depart, ...arrets.map((a) => a.position)]);
      const ordre = ordonnerSelonCouts(arrets.length, (i, j) => durees[i][j], retour);

      const etapes = [0, ...ordre, ...(retour ? [0] : [])];
      let distanceMetres = 0;
      let dureeSecondes = 0;
      for (let k = 1; k < etapes.length; k++) {
        distanceMetres += distances[etapes[k - 1]][etapes[k]];
        dureeSecondes += durees[etapes[k - 1]][etapes[k]];
      }
      return {
        ordre: ordre.map((k) => arrets[k - 1].id),
        distanceMetres,
        dureeSecondes,
        methode: "openrouteservice",
        optimal: arrets.length <= ARRETS_MAX_EXACT,
      };
    },
  };
}
