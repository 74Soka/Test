import { describe, expect, it, vi } from "vitest";
import { creerGeocodeurGeoplateforme } from "@/lib/geocodage/geoplateforme";
import { ErreurGeocodage } from "@/lib/geocodage/types";
import reponseAdresse from "./fixtures/geoplateforme-adresse.json";

function fauxFetch(corps: unknown, statut = 200) {
  return vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(corps), { status: statut }));
}

describe("géocodeur Géoplateforme", () => {
  it("transforme la réponse en adresses et ignore les entrées incomplètes", async () => {
    const fetch = fauxFetch(reponseAdresse);
    const geo = creerGeocodeurGeoplateforme({ fetch: fetch as unknown as typeof globalThis.fetch });

    const adresses = await geo.rechercherAdresses("12 rue demo toulon");

    expect(adresses).toEqual([
      {
        libelle: "12 Rue Démo 83000 Toulon",
        ligne: "12 Rue Démo",
        codePostal: "83000",
        commune: "Toulon",
        codeInsee: "83137",
        lat: 43.125087,
        lng: 5.930103,
        score: 0.92,
        precision: "numero",
      },
      {
        libelle: "Chemin Démo 83260 La Crau",
        ligne: "Chemin Démo",
        codePostal: "83260",
        commune: "La Crau",
        codeInsee: "83047",
        lat: 43.1497,
        lng: 6.0745,
        score: 0.61,
        precision: "rue",
      },
    ]);
  });

  it("appelle /search avec l'autocomplétion et la proximité", async () => {
    const fetch = fauxFetch({ features: [] });
    const geo = creerGeocodeurGeoplateforme({
      baseUrl: "https://exemple.test/geocodage/",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await geo.rechercherAdresses("  12 rue démo ", { proche: { lat: 43.1234567, lng: 6.1 }, limite: 3 });

    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://exemple.test/geocodage/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "12 rue démo",
      index: "address",
      autocomplete: "1",
      limit: "3",
      lat: "43.12346",
      lon: "6.10000",
    });
  });

  it("ne sollicite pas le service pour moins de 3 caractères", async () => {
    const fetch = fauxFetch({ features: [] });
    const geo = creerGeocodeurGeoplateforme({ fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await geo.rechercherAdresses("12")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recherche des communes avec type=municipality", async () => {
    const fetch = fauxFetch({
      features: [
        {
          geometry: { coordinates: [6.1286, 43.1204] },
          properties: { label: "Hyères", name: "Hyères", city: "Hyères", citycode: "83069", postcode: "83400", type: "municipality" },
        },
      ],
    });
    const geo = creerGeocodeurGeoplateforme({ fetch: fetch as unknown as typeof globalThis.fetch });

    const communes = await geo.rechercherCommunes("hyeres");

    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("type")).toBe("municipality");
    expect(communes).toEqual([{ nom: "Hyères", codeInsee: "83069", codePostal: "83400", lat: 43.1204, lng: 6.1286 }]);
  });

  it("signale une erreur HTTP du service", async () => {
    const geo = creerGeocodeurGeoplateforme({
      fetch: fauxFetch({ message: "trop de requêtes" }, 429) as unknown as typeof globalThis.fetch,
    });
    await expect(geo.rechercherAdresses("12 rue demo")).rejects.toBeInstanceOf(ErreurGeocodage);
  });

  it("signale un service injoignable", async () => {
    const geo = creerGeocodeurGeoplateforme({
      fetch: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof globalThis.fetch,
    });
    await expect(geo.rechercherAdresses("12 rue demo")).rejects.toThrow("ne répond pas");
  });

  it("signale une réponse au format inattendu", async () => {
    const geo = creerGeocodeurGeoplateforme({
      fetch: fauxFetch({ resultats: [] }) as unknown as typeof globalThis.fetch,
    });
    await expect(geo.rechercherAdresses("12 rue demo")).rejects.toThrow("inattendue");
  });
});
