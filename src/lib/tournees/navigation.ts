import type { Point } from "./types";

/**
 * Liens d'itinéraire vers les applications de navigation du téléphone.
 */

const coord = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export function lienGoogleMaps(destination: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(destination)}&travelmode=driving`;
}

export function lienWaze(destination: Point): string {
  return `https://waze.com/ul?ll=${coord(destination)}&navigate=yes`;
}

/** Nombre maximal d'étapes intermédiaires dans un lien Google Maps. */
export const ETAPES_MAX_GOOGLE = 9;

/**
 * Tournée complète dans Google Maps, depuis `depart`. Google limite le nombre
 * d'étapes : le lien couvre les `ETAPES_MAX_GOOGLE + 1` prochains arrêts.
 */
export function lienTourneeGoogleMaps(depart: Point, arrets: Point[]): { url: string; arrets: number } | null {
  if (arrets.length === 0) return null;
  const retenus = arrets.slice(0, ETAPES_MAX_GOOGLE + 1);
  const destination = retenus[retenus.length - 1];
  const etapes = retenus.slice(0, -1);
  const params = new URLSearchParams({
    api: "1",
    origin: coord(depart),
    destination: coord(destination),
    travelmode: "driving",
  });
  if (etapes.length) params.set("waypoints", etapes.map(coord).join("|"));
  return { url: `https://www.google.com/maps/dir/?${params}`, arrets: retenus.length };
}

/** « 38 km » / « 850 m » */
export function formaterDistance(metres: number | undefined): string {
  if (metres === undefined) return "";
  return metres >= 1000 ? `${Math.round(metres / 1000)} km` : `${Math.round(metres)} m`;
}

/** « 1 h 25 » / « 40 min » */
export function formaterDuree(secondes: number | undefined): string {
  if (secondes === undefined) return "";
  const minutes = Math.round(secondes / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
}
