import type { Point } from "./types";

const RAYON_TERRE = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance à vol d'oiseau entre deux points, en mètres. */
export function distance(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE * Math.asin(Math.sqrt(h));
}

/** Longueur d'un trajet passant par les points dans l'ordre. */
export function longueurTrajet(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}
