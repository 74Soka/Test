import { describe, expect, it, vi } from "vitest";
import { distance, longueurTrajet } from "@/lib/tournees/geo";
import { ARRETS_MAX_EXACT, optimiserLocalement, ordonnerSelonCouts } from "@/lib/tournees/locale";
import { creerClientORS, creerOptimiseurORS, decouper, LIEUX_MAX_MATRICE } from "@/lib/tournees/openrouteservice";
import {
  CLE_STOCKAGE_TRAJET,
  cleDuTrajet,
  lireTrajetMemorise,
  memoriserTrajet,
  pointsDeLaCle,
  simplifierTrajet,
  tempsEntreArrets,
} from "@/lib/tournees/trajet";
import { ErreurOptimisation, type Arret, type Point, type Trajet } from "@/lib/tournees/types";
import {
  ETAPES_MAX_GOOGLE,
  formaterDistance,
  formaterDuree,
  lienGoogleMaps,
  lienTourneeGoogleMaps,
  lienWaze,
} from "@/lib/tournees/navigation";
import { ajouterALaFile, lireFile, viderFile, type ActionLivraison } from "@/lib/tournees/file-attente";

const ferme: Point = { lat: 43.1497, lng: 6.0745 };

/** Générateur pseudo-aléatoire reproductible */
function aleatoire(graine: number) {
  let x = graine;
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return x / 2 ** 31;
  };
}

function permutations<T>(t: T[]): T[][] {
  if (t.length <= 1) return [t];
  return t.flatMap((x, i) => permutations([...t.slice(0, i), ...t.slice(i + 1)]).map((p) => [x, ...p]));
}

describe("géographie", () => {
  it("distance à vol d'oiseau Toulon – Hyères ≈ 16 km", () => {
    const d = distance({ lat: 43.1242, lng: 5.928 }, { lat: 43.1204, lng: 6.1286 });
    expect(d).toBeGreaterThan(15_500);
    expect(d).toBeLessThan(16_800);
  });
});

describe("optimisation locale", () => {
  it("passe par les arrêts alignés dans l'ordre, quel que soit l'ordre donné", () => {
    const arrets: Arret[] = [3, 1, 4, 2].map((k) => ({ id: `a${k}`, position: { lat: ferme.lat, lng: ferme.lng + k * 0.01 } }));
    expect(optimiserLocalement(ferme, arrets, false).ordre).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("trouve le meilleur trajet possible (comparé à toutes les possibilités, 8 arrêts)", () => {
    for (let graine = 1; graine <= 5; graine++) {
      const r = aleatoire(graine);
      const arrets: Arret[] = Array.from({ length: 8 }, (_, i) => ({
        id: `c${i}`,
        position: { lat: ferme.lat + (r() - 0.5) * 0.3, lng: ferme.lng + (r() - 0.5) * 0.4 },
      }));
      const parId = new Map(arrets.map((a) => [a.id, a.position]));
      const longueur = (ids: string[]) => longueurTrajet([ferme, ...ids.map((id) => parId.get(id)!), ferme]);
      const optimum = Math.min(...permutations(arrets.map((a) => a.id)).map(longueur));
      const resultat = optimiserLocalement(ferme, arrets, true);
      expect(new Set(resultat.ordre).size).toBe(8);
      expect(longueur(resultat.ordre)).toBeCloseTo(optimum, 3);
      expect(resultat.distanceMetres).toBeCloseTo(optimum, 3);
      expect(resultat.optimal).toBe(true);
    }
  });

  it("meilleur ordre aussi avec des temps asymétriques, avec ou sans retour", () => {
    for (let graine = 1; graine <= 5; graine++) {
      const r = aleatoire(graine * 7);
      const n = 8;
      const temps = Array.from({ length: n + 1 }, () => Array.from({ length: n + 1 }, () => 60 + Math.floor(r() * 1800)));
      const cout = (i: number, j: number) => temps[i][j];
      for (const retour of [true, false]) {
        const total = (ordre: number[]) =>
          [0, ...ordre, ...(retour ? [0] : [])].reduce((t, k, i, l) => (i === 0 ? 0 : t + cout(l[i - 1], k)), 0);
        const optimum = Math.min(...permutations(Array.from({ length: n }, (_, i) => i + 1)).map(total));
        expect(total(ordonnerSelonCouts(n, cout, retour))).toBe(optimum);
      }
    }
  });

  it(`calcul exact instantané jusqu'à ${ARRETS_MAX_EXACT} arrêts, très bon ordre au-delà`, () => {
    const r = aleatoire(42);
    const lieux = Array.from({ length: 31 }, () => ({ lat: ferme.lat + (r() - 0.5) * 0.4, lng: ferme.lng + (r() - 0.5) * 0.5 }));
    const arrets = (n: number): Arret[] => lieux.slice(1, n + 1).map((position, i) => ({ id: `c${i}`, position }));

    const debut = performance.now();
    const exact = optimiserLocalement(ferme, arrets(ARRETS_MAX_EXACT));
    expect(performance.now() - debut).toBeLessThan(2000);
    expect(exact.optimal).toBe(true);
    expect(new Set(exact.ordre).size).toBe(ARRETS_MAX_EXACT);

    const long = optimiserLocalement(ferme, arrets(30));
    expect(long.optimal).toBe(false);
    expect(new Set(long.ordre).size).toBe(30);
    // Pas plus long que l'ordre du plus proche voisin seul
    const restants = arrets(30);
    const voisin: Point[] = [];
    let courant = ferme;
    while (restants.length) {
      restants.sort((a, b) => distance(courant, a.position) - distance(courant, b.position));
      courant = restants.shift()!.position;
      voisin.push(courant);
    }
    expect(long.distanceMetres!).toBeLessThanOrEqual(longueurTrajet([ferme, ...voisin, ferme]));
  });

  it("gère 0 ou 1 arrêt", () => {
    expect(optimiserLocalement(ferme, [], true).ordre).toEqual([]);
    expect(optimiserLocalement(ferme, [{ id: "x", position: ferme }], true).ordre).toEqual(["x"]);
  });

  it("tient compte des sens uniques (coûts asymétriques)", () => {
    // Boucle : 0 → 1 → 2 → 3 → 0 coûte 4 ; l'autre sens coûte 40
    const cout = (i: number, j: number) => ((j - i + 4) % 4 === 1 ? 1 : 10);
    expect(ordonnerSelonCouts(3, cout, true)).toEqual([1, 2, 3]);
    const inverse = (i: number, j: number) => cout(j, i);
    expect(ordonnerSelonCouts(3, inverse, true)).toEqual([3, 2, 1]);
  });
});

/** Faux service : répond selon le chemin demandé et garde les appels */
function fauxORS(reponses: (url: string, corps: Record<string, unknown>) => Response) {
  const appels: { url: string; init: RequestInit; corps: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const corps = JSON.parse(String(init.body));
    appels.push({ url, init, corps });
    return reponses(url, corps);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, appels };
}

describe("optimisation par les routes (OpenRouteService)", () => {
  const arrets: Arret[] = [
    { id: "cmd-a", position: { lat: 43.12, lng: 5.93 } },
    { id: "cmd-b", position: { lat: 43.1, lng: 5.88 } },
    { id: "cmd-c", position: { lat: 43.09, lng: 5.84 } },
  ];

  it("demande la matrice des temps de route et choisit l'ordre le plus court en temps", async () => {
    // Lieux : 0 = ferme, 1 = a, 2 = b, 3 = c. Le plus rapide : ferme → c → a → b → ferme
    const durees = [
      [0, 900, 600, 100],
      [900, 0, 100, 600],
      [600, 600, 0, 900],
      [100, 100, 900, 0],
    ];
    const distances = durees.map((l) => l.map((d) => d * 10));
    distances[2][0] = null as unknown as number; // case vide : estimée à vol d'oiseau
    const { fetch, appels } = fauxORS(() => Response.json({ durations: durees, distances }));

    const r = await creerOptimiseurORS({ cle: "cle-test", fetch }).optimiser(ferme, arrets, { retour: true });

    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe("https://api.heigit.org/openrouteservice/v2/matrix/driving-car");
    expect((appels[0].init.headers as Record<string, string>).Authorization).toBe("cle-test");
    expect(appels[0].corps).toEqual({
      locations: [
        [6.0745, 43.1497],
        [5.93, 43.12],
        [5.88, 43.1],
        [5.84, 43.09],
      ],
      metrics: ["duration", "distance"],
    });
    expect(r.ordre).toEqual(["cmd-c", "cmd-a", "cmd-b"]);
    expect(r.methode).toBe("openrouteservice");
    expect(r.optimal).toBe(true);
    expect(r.dureeSecondes).toBe(100 + 100 + 100 + 600);
    // Retour b → ferme inconnu : estimé (1,5 × vol d'oiseau)
    const retourEstime = 1.5 * distance(arrets[1].position, ferme);
    expect(r.distanceMetres).toBeCloseTo(1000 + 1000 + 1000 + retourEstime, 0);
  });

  it("refuse une tournée trop longue pour une seule matrice", async () => {
    const { fetch, appels } = fauxORS(() => Response.json({}));
    const beaucoup = Array.from({ length: LIEUX_MAX_MATRICE }, (_, i) => ({ id: `x${i}`, position: { lat: 43, lng: 6 + i / 100 } }));
    await expect(creerOptimiseurORS({ cle: "x", fetch }).optimiser(ferme, beaucoup)).rejects.toThrow("Trop d'arrêts");
    expect(appels).toHaveLength(0);
  });

  it("explique une clé refusée, un quota dépassé ou une adresse loin des routes", async () => {
    for (const [statut, corps, message] of [
      [401, {}, "Clé OpenRouteService refusée."],
      [403, {}, "Clé OpenRouteService refusée."],
      [429, {}, "Quota OpenRouteService dépassé pour aujourd'hui."],
      [404, { error: { code: 2010, message: "Could not find routable point" } }, "trop loin d'une route"],
      [500, {}, "erreur (500)"],
    ] as const) {
      const { fetch } = fauxORS(() => Response.json(corps, { status: statut }));
      await expect(creerOptimiseurORS({ cle: "x", fetch }).optimiser(ferme, arrets)).rejects.toThrow(message);
    }
  });

  it("signale un service injoignable ou une réponse incomplète", async () => {
    const injoignable = creerOptimiseurORS({
      cle: "x",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof globalThis.fetch,
    });
    await expect(injoignable.optimiser(ferme, arrets)).rejects.toBeInstanceOf(ErreurOptimisation);

    const { fetch } = fauxORS(() => Response.json({ durations: [[0]], distances: [[0]] }));
    await expect(creerOptimiseurORS({ cle: "x", fetch }).optimiser(ferme, arrets)).rejects.toThrow("Réponse inattendue");
  });
});

describe("itinéraire par les routes (OpenRouteService)", () => {
  /** Réponse GeoJSON : ligne droite avec un point au milieu de chaque tronçon */
  function reponseItineraire(_url: string, corps: Record<string, unknown>) {
    const coords = corps.coordinates as [number, number][];
    const ligne = coords.flatMap((c, i) =>
      i === 0 ? [c] : [[(coords[i - 1][0] + c[0]) / 2, (coords[i - 1][1] + c[1]) / 2 + 0.001], c],
    );
    const segments = coords.slice(1).map((_, i) => ({ distance: 1000 * (i + 1), duration: 60 * (i + 1) }));
    return Response.json({
      type: "FeatureCollection",
      features: [
        {
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

  it("demande l'itinéraire en voiture et renvoie le tracé et la durée de chaque tronçon", async () => {
    const { fetch, appels } = fauxORS(reponseItineraire);
    const points = [ferme, { lat: 43.12, lng: 5.93 }, { lat: 43.1, lng: 5.88 }, ferme];

    const t = await creerClientORS({ cle: "cle-test", fetch }).trajet(points);

    expect(appels[0].url).toBe("https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson");
    expect((appels[0].init.headers as Record<string, string>).Authorization).toBe("cle-test");
    expect(appels[0].corps).toEqual({
      coordinates: [
        [6.0745, 43.1497],
        [5.93, 43.12],
        [5.88, 43.1],
        [6.0745, 43.1497],
      ],
      preference: "fastest",
    });
    expect(t.geometrie).toHaveLength(7);
    expect(t.geometrie[0]).toEqual(ferme);
    expect(t.troncons).toEqual([
      { distanceMetres: 1000, dureeSecondes: 60 },
      { distanceMetres: 2000, dureeSecondes: 120 },
      { distanceMetres: 3000, dureeSecondes: 180 },
    ]);
    expect(t.distanceMetres).toBe(6000);
    expect(t.dureeSecondes).toBe(360);
  });

  it("découpe une longue tournée en plusieurs demandes qui se suivent", async () => {
    const { fetch, appels } = fauxORS(reponseItineraire);
    const points = Array.from({ length: 30 }, (_, i) => ({ lat: 43 + i / 100, lng: 6 }));

    const t = await creerClientORS({ cle: "x", fetch, baseUrl: "http://exemple.test/ors/" }).trajet(points);

    expect(appels.map((a) => a.url)).toEqual([
      "http://exemple.test/ors/v2/directions/driving-car/geojson",
      "http://exemple.test/ors/v2/directions/driving-car/geojson",
    ]);
    const premiers = appels[0].corps.coordinates as number[][];
    const suivants = appels[1].corps.coordinates as number[][];
    expect(premiers).toHaveLength(25);
    expect(suivants[0]).toEqual(premiers[24]);
    expect(t.troncons).toHaveLength(29);
    // Le point de jonction n'est pas répété
    expect(t.geometrie).toHaveLength(30 + 29);
  });

  it("refuse une réponse dont les tronçons ne correspondent pas aux étapes", async () => {
    const { fetch } = fauxORS(() =>
      Response.json({ features: [{ geometry: { coordinates: [[6, 43], [6.1, 43.1]] }, properties: { segments: [] } }] }),
    );
    await expect(creerClientORS({ cle: "x", fetch }).trajet([ferme, { lat: 43, lng: 6 }])).rejects.toThrow(
      "Réponse inattendue",
    );
  });

  it("découpe en morceaux qui se chevauchent", () => {
    expect(decouper([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
    expect(decouper([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([
      [1, 2, 3],
      [3, 4, 5],
      [5, 6, 7],
    ]);
    expect(decouper([1, 2, 3, 4], 3)).toEqual([
      [1, 2, 3],
      [3, 4],
    ]);
  });
});

describe("itinéraire dans le téléphone", () => {
  const trajet: Trajet = {
    geometrie: [
      { lat: 43.1, lng: 6 },
      { lat: 43.2, lng: 6.1 },
    ],
    distanceMetres: 5000,
    dureeSecondes: 600,
    troncons: [
      { distanceMetres: 2000, dureeSecondes: 200 },
      { distanceMetres: 1000, dureeSecondes: 100 },
      { distanceMetres: 2000, dureeSecondes: 300 },
    ],
  };

  it("la clé d'un trajet redonne ses points (arrondis au mètre)", () => {
    const cle = cleDuTrajet([{ lat: 43.1234567, lng: 6.7654321 }, ferme]);
    expect(pointsDeLaCle(cle)).toEqual([{ lat: 43.12346, lng: 6.76543 }, ferme]);
    expect(cleDuTrajet([ferme, { lat: 43.1234567, lng: 6 }])).not.toBe(cleDuTrajet([{ lat: 43.1234567, lng: 6 }, ferme]));
  });

  it("allège le tracé : coordonnées arrondies, points répétés retirés", () => {
    const t = simplifierTrajet({
      ...trajet,
      geometrie: [
        { lat: 43.1000001, lng: 6.0000001 },
        { lat: 43.1000002, lng: 6.0000002 },
        { lat: 43.2, lng: 6.1 },
      ],
    });
    expect(t.geometrie).toEqual(trajet.geometrie);
  });

  it("garde le dernier tracé et ne le ressort que pour le même trajet", () => {
    const memoire = new Map<string, string>();
    const stockage = { getItem: (k: string) => memoire.get(k) ?? null, setItem: (k: string, v: string) => void memoire.set(k, v) };
    memoriserTrajet(stockage, "cle-1", trajet);
    expect(lireTrajetMemorise(stockage, "cle-1")).toEqual(trajet);
    expect(lireTrajetMemorise(stockage, "cle-2")).toBeNull();
    memoire.set(CLE_STOCKAGE_TRAJET, "{cassé");
    expect(lireTrajetMemorise(stockage, "cle-1")).toBeNull();
    expect(lireTrajetMemorise(undefined, "cle-1")).toBeNull();
  });

  it("temps pour rejoindre chaque arrêt et pour revenir", () => {
    expect(tempsEntreArrets(trajet, 2)).toEqual({ arrivees: trajet.troncons.slice(0, 2), retour: trajet.troncons[2] });
    expect(tempsEntreArrets(trajet, 3)).toBeNull();
  });
});

describe("liens de navigation", () => {
  const p = { lat: 43.1234567, lng: 6.1234567 };

  it("Google Maps et Waze vers un arrêt", () => {
    expect(lienGoogleMaps(p)).toBe("https://www.google.com/maps/dir/?api=1&destination=43.123457,6.123457&travelmode=driving");
    expect(lienWaze(p)).toBe("https://waze.com/ul?ll=43.123457,6.123457&navigate=yes");
  });

  it("tournée complète : départ, étapes, destination ; limitée aux prochains arrêts", () => {
    const arrets = Array.from({ length: 14 }, (_, i) => ({ lat: 43 + i / 100, lng: 6 }));
    const lien = lienTourneeGoogleMaps(ferme, arrets)!;
    const url = new URL(lien.url);
    expect(lien.arrets).toBe(ETAPES_MAX_GOOGLE + 1);
    expect(url.searchParams.get("origin")).toBe("43.149700,6.074500");
    expect(url.searchParams.get("destination")).toBe("43.090000,6.000000");
    expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(ETAPES_MAX_GOOGLE);
    expect(lienTourneeGoogleMaps(ferme, [])).toBeNull();
  });

  it("formate distances et durées", () => {
    expect(formaterDistance(38_400)).toBe("38 km");
    expect(formaterDistance(850)).toBe("850 m");
    expect(formaterDuree(5100)).toBe("1 h 25");
    expect(formaterDuree(2400)).toBe("40 min");
    expect(formaterDuree(3900)).toBe("1 h 05");
    expect(formaterDuree(20)).toBe("< 1 min");
  });
});

describe("file d'attente hors connexion", () => {
  const a = (commandeId: string, livree = true): ActionLivraison => ({
    commandeId,
    livree,
    horodatage: "2026-11-07T10:00:00.000Z",
  });

  it("pour une même commande, seul le dernier appui compte", () => {
    const file = ajouterALaFile(ajouterALaFile([a("1")], a("2")), a("1", false));
    expect(file).toEqual([a("2"), a("1", false)]);
  });

  it("s'arrête à la première coupure réseau et garde le reste", async () => {
    let appels = 0;
    const r = await viderFile([a("1"), a("2"), a("3")], async () => {
      if (++appels === 2) throw new TypeError("Failed to fetch");
      return { ok: true };
    });
    expect(r.restantes.map((x) => x.commandeId)).toEqual(["2", "3"]);
  });

  it("un refus (commande annulée) sort de la file et est signalé", async () => {
    const r = await viderFile([a("1"), a("2")], async (x) =>
      x.commandeId === "1" ? { ok: false, erreur: "Cette commande a été annulée." } : { ok: true },
    );
    expect(r.restantes).toEqual([]);
    expect(r.refus).toEqual([{ action: a("1"), erreur: "Cette commande a été annulée." }]);
  });

  it("relit une file stockée, en ignorant ce qui est abîmé", () => {
    const stockage = { getItem: () => JSON.stringify([a("1"), { pas: "bon" }]) };
    expect(lireFile(stockage)).toEqual([a("1")]);
    expect(lireFile({ getItem: () => "{cassé" })).toEqual([]);
    expect(lireFile(undefined)).toEqual([]);
  });
});
