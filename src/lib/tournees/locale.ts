import { distance, longueurTrajet } from "./geo";
import type { Arret, Optimiseur, Point, ResultatOptimisation } from "./types";

/**
 * Optimiseur sans service extérieur : plus proche voisin puis amélioration
 * « 2-opt », sur les distances à vol d'oiseau. Bon pour quelques dizaines
 * d'arrêts ; ne connaît pas les routes (relief, littoral, sens uniques).
 */
export function optimiserLocalement(depart: Point, arrets: Arret[], retour = true): ResultatOptimisation {
  if (arrets.length <= 1) {
    const points = [depart, ...arrets.map((a) => a.position), ...(retour ? [depart] : [])];
    return { ordre: arrets.map((a) => a.id), distanceMetres: longueurTrajet(points), methode: "locale" };
  }

  // 1. Plus proche voisin depuis le départ
  const restants = [...arrets];
  const tour: Arret[] = [];
  let courant = depart;
  while (restants.length) {
    let meilleur = 0;
    for (let i = 1; i < restants.length; i++) {
      if (distance(courant, restants[i].position) < distance(courant, restants[meilleur].position)) meilleur = i;
    }
    const [suivant] = restants.splice(meilleur, 1);
    tour.push(suivant);
    courant = suivant.position;
  }

  // 2. 2-opt : on inverse des portions tant que le trajet raccourcit
  const longueur = (t: Arret[]) =>
    longueurTrajet([depart, ...t.map((a) => a.position), ...(retour ? [depart] : [])]);
  let ameliore = true;
  let meilleureLongueur = longueur(tour);
  let tours = 0;
  while (ameliore && tours++ < 200) {
    ameliore = false;
    for (let i = 0; i < tour.length - 1; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        const essai = [...tour.slice(0, i), ...tour.slice(i, j + 1).reverse(), ...tour.slice(j + 1)];
        const l = longueur(essai);
        if (l < meilleureLongueur - 1e-6) {
          tour.splice(0, tour.length, ...essai);
          meilleureLongueur = l;
          ameliore = true;
        }
      }
    }
  }

  return { ordre: tour.map((a) => a.id), distanceMetres: meilleureLongueur, methode: "locale" };
}

export const optimiseurLocal: Optimiseur = {
  async optimiser(depart, arrets, options) {
    return optimiserLocalement(depart, arrets, options?.retour ?? true);
  },
};
