import { z } from "zod";
import { ErreurOptimisation, type Optimiseur } from "./types";

/**
 * Optimiseur OpenRouteService (moteur VROOM) : ordre de passage calculé sur le
 * réseau routier réel. Nécessite une clé gratuite (openrouteservice.org).
 */

export const URL_ORS = "https://api.openrouteservice.org";

const reponse = z.object({
  routes: z
    .array(
      z.object({
        steps: z.array(z.object({ type: z.string(), id: z.number().optional() })),
        distance: z.number().optional(),
        duration: z.number().optional(),
      }),
    )
    .default([]),
  unassigned: z.array(z.object({ id: z.number() })).default([]),
});

export function creerOptimiseurORS(options: {
  cle: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  delai?: number;
  profil?: string;
}): Optimiseur {
  const baseUrl = (options.baseUrl ?? URL_ORS).replace(/\/$/, "");
  const fetcher = options.fetch ?? fetch;

  return {
    async optimiser(depart, arrets, opts) {
      if (arrets.length === 0) return { ordre: [], methode: "openrouteservice" };
      const versCoord = (p: { lat: number; lng: number }) => [p.lng, p.lat];
      const corps = {
        jobs: arrets.map((a, i) => ({ id: i + 1, location: versCoord(a.position) })),
        vehicles: [
          {
            id: 1,
            profile: options.profil ?? "driving-car",
            start: versCoord(depart),
            ...((opts?.retour ?? true) ? { end: versCoord(depart) } : {}),
          },
        ],
      };

      let res: Response;
      try {
        res = await fetcher(`${baseUrl}/optimization`, {
          method: "POST",
          headers: { Authorization: options.cle, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(corps),
          signal: AbortSignal.timeout(options.delai ?? 15000),
        });
      } catch (e) {
        throw new ErreurOptimisation("Le service d'itinéraires ne répond pas.", e);
      }
      if (!res.ok) {
        const message =
          res.status === 401 || res.status === 403
            ? "Clé OpenRouteService refusée."
            : res.status === 429
              ? "Quota OpenRouteService dépassé pour aujourd'hui."
              : `Le service d'itinéraires a répondu avec une erreur (${res.status}).`;
        throw new ErreurOptimisation(message);
      }
      const donnees = reponse.safeParse(await res.json().catch(() => null));
      if (!donnees.success) throw new ErreurOptimisation("Réponse inattendue du service d'itinéraires.", donnees.error);

      const route = donnees.data.routes[0];
      const ordre = (route?.steps ?? [])
        .filter((s) => s.type === "job" && s.id !== undefined)
        .map((s) => arrets[s.id! - 1]?.id)
        .filter((id): id is string => Boolean(id));
      // Arrêts non placés (rare) : à la fin, dans l'ordre d'origine
      for (const a of arrets) if (!ordre.includes(a.id)) ordre.push(a.id);

      return {
        ordre,
        distanceMetres: route?.distance,
        dureeSecondes: route?.duration,
        methode: "openrouteservice",
      };
    },
  };
}
