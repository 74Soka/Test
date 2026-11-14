import { distance } from "./geo";
import type { Point } from "./types";

/**
 * Ordre d'une tournée d'après les habitudes du livreur :
 * - les arrêts déjà ordonnés ce jour-là gardent leur ordre ; sinon on part de
 *   l'ordre préféré du secteur (dernière tournée organisée) ;
 * - chaque autre client (nouveau) est inséré là où il allonge le moins la
 *   route (départ → arrêts → retour au départ) ;
 * - un client sans position sur la carte va à la fin.
 * Renvoie les identifiants des commandes dans l'ordre de passage.
 */
export type ArretAOrdonner = { id: string; clientId: string; position: Point | null; ordre: number | null };

export function ordonnerSelonPreference(arrets: ArretAOrdonner[], preference: string[], depart: Point): string[] {
  const dejaOrdonnes = arrets.filter((a) => a.ordre !== null).sort((a, b) => a.ordre! - b.ordre!);
  const rangPrefere = new Map(preference.map((c, i) => [c, i]));
  const base =
    dejaOrdonnes.length > 0
      ? dejaOrdonnes
      : arrets.filter((a) => rangPrefere.has(a.clientId)).sort((a, b) => rangPrefere.get(a.clientId)! - rangPrefere.get(b.clientId)!);
  const dansLaBase = new Set(base.map((a) => a.id));
  const nouveaux = arrets.filter((a) => !dansLaBase.has(a.id));

  const suite = [...base];
  const sansPosition: ArretAOrdonner[] = [];
  for (const n of nouveaux) {
    if (!n.position) {
      sansPosition.push(n);
      continue;
    }
    // Points de la suite (départ, arrêts placés, retour) ; arrêts sans position ignorés
    let meilleur = suite.length;
    let surcout = Infinity;
    for (let i = 0; i <= suite.length; i++) {
      const avant = [...suite.slice(0, i)].reverse().find((a) => a.position)?.position ?? depart;
      const apres = suite.slice(i).find((a) => a.position)?.position ?? depart;
      const cout = distance(avant, n.position) + distance(n.position, apres) - distance(avant, apres);
      if (cout < surcout - 1e-6) {
        surcout = cout;
        meilleur = i;
      }
    }
    suite.splice(meilleur, 0, n);
  }
  return [...suite, ...sansPosition].map((a) => a.id);
}
