import { distance, longueurTrajet } from "./geo";
import type { Arret, Optimiseur, Point, ResultatOptimisation } from "./types";

/**
 * Ordre de passage minimisant un coût (distance ou durée) entre lieux.
 * Lieu 0 = départ, lieux 1…n = arrêts ; `cout(i, j)` peut être asymétrique
 * (sens uniques). Plus proche voisin, puis améliorations « 2-opt » (inverser
 * une portion) et « or-opt » (déplacer 1 à 3 arrêts consécutifs) tant que le
 * trajet raccourcit. Renvoie les numéros des arrêts (1…n) dans l'ordre.
 */
export function ordonnerSelonCouts(n: number, cout: (i: number, j: number) => number, retour = true): number[] {
  const tour: number[] = [];
  const restants = new Set(Array.from({ length: n }, (_, i) => i + 1));
  let courant = 0;
  while (restants.size) {
    let meilleur = -1;
    for (const r of restants) if (meilleur === -1 || cout(courant, r) < cout(courant, meilleur)) meilleur = r;
    tour.push(meilleur);
    restants.delete(meilleur);
    courant = meilleur;
  }
  if (n <= 1) return tour;

  function longueur(t: number[]) {
    let total = cout(0, t[0]);
    for (let i = 1; i < t.length; i++) total += cout(t[i - 1], t[i]);
    return retour ? total + cout(t[t.length - 1], 0) : total;
  }

  let meilleure = longueur(tour);
  const essayer = (essai: number[]) => {
    const l = longueur(essai);
    if (l < meilleure - 1e-6) {
      tour.splice(0, tour.length, ...essai);
      meilleure = l;
      return true;
    }
    return false;
  };

  let ameliore = true;
  for (let passes = 0; ameliore && passes < 100; passes++) {
    ameliore = false;
    // 2-opt
    for (let i = 0; i < tour.length - 1; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        if (essayer([...tour.slice(0, i), ...tour.slice(i, j + 1).reverse(), ...tour.slice(j + 1)])) ameliore = true;
      }
    }
    // or-opt
    for (let taille = 1; taille <= 3; taille++) {
      for (let i = 0; i + taille <= tour.length; i++) {
        const bloc = tour.slice(i, i + taille);
        const reste = [...tour.slice(0, i), ...tour.slice(i + taille)];
        for (let k = 0; k <= reste.length; k++) {
          if (k === i) continue;
          if (essayer([...reste.slice(0, k), ...bloc, ...reste.slice(k)])) {
            ameliore = true;
            break;
          }
        }
      }
    }
  }
  return tour;
}

/**
 * Optimiseur sans service extérieur, sur les distances à vol d'oiseau. Bon
 * pour quelques dizaines d'arrêts ; ne connaît pas les routes (relief,
 * littoral, sens uniques).
 */
export function optimiserLocalement(depart: Point, arrets: Arret[], retour = true): ResultatOptimisation {
  const lieux = [depart, ...arrets.map((a) => a.position)];
  const ordre = ordonnerSelonCouts(arrets.length, (i, j) => distance(lieux[i], lieux[j]), retour);
  const points = [depart, ...ordre.map((k) => lieux[k]), ...(retour ? [depart] : [])];
  return { ordre: ordre.map((k) => arrets[k - 1].id), distanceMetres: longueurTrajet(points), methode: "locale" };
}

export const optimiseurLocal: Optimiseur = {
  async optimiser(depart, arrets, options) {
    return optimiserLocalement(depart, arrets, options?.retour ?? true);
  },
};
