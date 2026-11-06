import { z } from "zod";
import {
  ErreurGeocodage,
  type AdresseTrouvee,
  type CommuneTrouvee,
  type Geocodeur,
  type Precision,
  type Proximite,
} from "./types";

/**
 * Géocodeur « Base Adresse Nationale » servi par la Géoplateforme de l'IGN
 * (successeur de api-adresse.data.gouv.fr, même format de réponse).
 * Documentation : https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage
 */

export const URL_GEOPLATEFORME = "https://data.geopf.fr/geocodage";

const proprietes = z.object({
  label: z.string(),
  name: z.string().optional(),
  postcode: z.string().optional(),
  city: z.string().optional(),
  citycode: z.string().optional(),
  score: z.number().optional(),
  type: z.string().optional(),
});

const reponse = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]).rest(z.number()) }),
      properties: proprietes,
    }),
  ),
});

type Entite = z.infer<typeof reponse>["features"][number];

const PRECISIONS: Record<string, Precision> = {
  housenumber: "numero",
  street: "rue",
  locality: "lieu-dit",
  municipality: "commune",
};

/** Requêtes trop courtes : le service les refuse ou renvoie du bruit. */
export const LONGUEUR_MINIMALE = 3;

type Options = {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Délai maximal d'une requête, en millisecondes */
  delai?: number;
};

export function creerGeocodeurGeoplateforme(options: Options = {}): Geocodeur {
  const baseUrl = (options.baseUrl ?? URL_GEOPLATEFORME).replace(/\/$/, "");
  const fetcher = options.fetch ?? fetch;
  const delai = options.delai ?? 5000;

  async function rechercher(params: Record<string, string>): Promise<Entite[]> {
    const url = `${baseUrl}/search?${new URLSearchParams(params)}`;
    let res: Response;
    try {
      res = await fetcher(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(delai),
      });
    } catch (e) {
      throw new ErreurGeocodage("Le service d'adresses ne répond pas.", e);
    }
    if (!res.ok) {
      throw new ErreurGeocodage(`Le service d'adresses a répondu avec une erreur (${res.status}).`);
    }
    const donnees = reponse.safeParse(await res.json().catch(() => null));
    if (!donnees.success) {
      throw new ErreurGeocodage("Réponse inattendue du service d'adresses.", donnees.error);
    }
    return donnees.data.features;
  }

  function parametres(texte: string, limite: number, proche?: Proximite): Record<string, string> {
    const p: Record<string, string> = {
      q: texte.trim(),
      index: "address",
      autocomplete: "1",
      limit: String(limite),
    };
    if (proche) {
      p.lat = proche.lat.toFixed(5);
      p.lon = proche.lng.toFixed(5);
    }
    return p;
  }

  return {
    async rechercherAdresses(texte, { proche, limite = 5 } = {}) {
      if (texte.trim().length < LONGUEUR_MINIMALE) return [];
      const entites = await rechercher(parametres(texte, limite, proche));
      return entites.map(versAdresse).filter((a): a is AdresseTrouvee => a !== null);
    },

    async rechercherCommunes(texte, { proche, limite = 5 } = {}) {
      if (texte.trim().length < 2) return [];
      const entites = await rechercher({ ...parametres(texte, limite, proche), type: "municipality" });
      return entites.map(versCommune).filter((c): c is CommuneTrouvee => c !== null);
    },
  };
}

function versAdresse(e: Entite): AdresseTrouvee | null {
  const p = e.properties;
  const [lng, lat] = e.geometry.coordinates;
  if (!p.postcode || !p.city || !p.citycode) return null;
  return {
    libelle: p.label,
    ligne: p.name ?? p.label,
    codePostal: p.postcode,
    commune: p.city,
    codeInsee: p.citycode,
    lat,
    lng,
    score: p.score ?? 0,
    precision: PRECISIONS[p.type ?? ""] ?? "rue",
  };
}

function versCommune(e: Entite): CommuneTrouvee | null {
  const p = e.properties;
  const [lng, lat] = e.geometry.coordinates;
  if (!p.citycode) return null;
  return {
    nom: p.city ?? p.name ?? p.label,
    codeInsee: p.citycode,
    codePostal: p.postcode ?? "",
    lat,
    lng,
  };
}
