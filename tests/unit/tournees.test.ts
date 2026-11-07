import { describe, expect, it, vi } from "vitest";
import { distance, longueurTrajet } from "@/lib/tournees/geo";
import { optimiserLocalement } from "@/lib/tournees/locale";
import { creerOptimiseurORS } from "@/lib/tournees/openrouteservice";
import { ErreurOptimisation, type Arret, type Point } from "@/lib/tournees/types";
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

  it("trouve un trajet proche de l'optimum (comparé à toutes les possibilités, 7 arrêts)", () => {
    for (let graine = 1; graine <= 5; graine++) {
      const r = aleatoire(graine);
      const arrets: Arret[] = Array.from({ length: 7 }, (_, i) => ({
        id: `c${i}`,
        position: { lat: ferme.lat + (r() - 0.5) * 0.3, lng: ferme.lng + (r() - 0.5) * 0.4 },
      }));
      const parId = new Map(arrets.map((a) => [a.id, a.position]));
      const longueur = (ids: string[]) => longueurTrajet([ferme, ...ids.map((id) => parId.get(id)!), ferme]);
      const optimum = Math.min(...permutations(arrets.map((a) => a.id)).map(longueur));
      const resultat = optimiserLocalement(ferme, arrets, true);
      expect(resultat.ordre).toHaveLength(7);
      expect(new Set(resultat.ordre).size).toBe(7);
      expect(longueur(resultat.ordre)).toBeLessThanOrEqual(optimum * 1.05);
      expect(resultat.distanceMetres).toBeCloseTo(longueur(resultat.ordre), 0);
    }
  });

  it("gère 0 ou 1 arrêt", () => {
    expect(optimiserLocalement(ferme, [], true).ordre).toEqual([]);
    expect(optimiserLocalement(ferme, [{ id: "x", position: ferme }], true).ordre).toEqual(["x"]);
  });
});

describe("optimisation OpenRouteService", () => {
  const arrets: Arret[] = [
    { id: "cmd-a", position: { lat: 43.12, lng: 5.93 } },
    { id: "cmd-b", position: { lat: 43.1, lng: 5.88 } },
    { id: "cmd-c", position: { lat: 43.09, lng: 5.84 } },
  ];

  it("envoie départ et arrêts (longitude, latitude) et suit l'ordre renvoyé", async () => {
    const fetch = vi.fn(async (..._args: unknown[]) =>
      Response.json({
        routes: [
          {
            steps: [{ type: "start" }, { type: "job", id: 3 }, { type: "job", id: 1 }, { type: "end" }],
            distance: 42_000,
            duration: 3600,
          },
        ],
        unassigned: [{ id: 2 }],
      }),
    );
    const ors = creerOptimiseurORS({ cle: "cle-test", fetch: fetch as unknown as typeof globalThis.fetch });

    const r = await ors.optimiser(ferme, arrets, { retour: true });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openrouteservice.org/optimization");
    expect((init.headers as Record<string, string>).Authorization).toBe("cle-test");
    const corps = JSON.parse(String(init.body));
    expect(corps.vehicles[0]).toEqual({ id: 1, profile: "driving-car", start: [6.0745, 43.1497], end: [6.0745, 43.1497] });
    expect(corps.jobs[0]).toEqual({ id: 1, location: [5.93, 43.12] });
    expect(r).toEqual({
      ordre: ["cmd-c", "cmd-a", "cmd-b"],
      distanceMetres: 42_000,
      dureeSecondes: 3600,
      methode: "openrouteservice",
    });
  });

  it("explique une clé refusée ou un quota dépassé", async () => {
    for (const [statut, message] of [
      [401, "Clé OpenRouteService refusée."],
      [429, "Quota OpenRouteService dépassé pour aujourd'hui."],
    ] as const) {
      const ors = creerOptimiseurORS({
        cle: "x",
        fetch: (async () => new Response("{}", { status: statut })) as unknown as typeof globalThis.fetch,
      });
      await expect(ors.optimiser(ferme, arrets)).rejects.toThrow(message);
    }
  });

  it("signale un service injoignable", async () => {
    const ors = creerOptimiseurORS({
      cle: "x",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof globalThis.fetch,
    });
    await expect(ors.optimiser(ferme, arrets)).rejects.toBeInstanceOf(ErreurOptimisation);
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
