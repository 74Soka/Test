/**
 * Messages des notifications de livraison et estimation des heures d'arrivée.
 * Fonctions pures, testées.
 */

/** Temps passé à chaque arrêt (sortir le panier, sonner, encaisser) */
export const TEMPS_PAR_ARRET_S = 4 * 60;

export type MessagePush = { titre: string; corps: string; url: string; tag: string };

/**
 * Heure d'arrivée estimée à chaque arrêt : départ + temps de route cumulé +
 * temps passé aux arrêts précédents. `durees[k]` : trajet jusqu'à l'arrêt k.
 */
export function heuresArrivee(depart: Date, durees: number[], tempsArret = TEMPS_PAR_ARRET_S): Date[] {
  let cumul = 0;
  return durees.map((d, k) => {
    cumul += d;
    return new Date(depart.getTime() + (cumul + k * tempsArret) * 1000);
  });
}

/** Arrondi aux 5 minutes les plus proches (une estimation, pas un rendez-vous). */
export function arrondiCinqMinutes(d: Date): Date {
  const pas = 5 * 60 * 1000;
  return new Date(Math.round(d.getTime() / pas) * pas);
}

/** « 10 h 15 », « 9 h » : heure de Paris. */
export function heureParis(d: Date): string {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(d)
    .split(":");
  return `${Number(h)} h${m === "00" ? "" : ` ${m}`}`;
}

const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);

/** Départ de la tournée : rang du client et heure d'arrivée estimée. */
export function messageDepart(rang: number, arrivee: Date): MessagePush {
  const vers = heureParis(arrondiCinqMinutes(arrivee));
  return {
    titre: "🚚 Votre livraison est en route !",
    corps:
      rang === 1
        ? `Vous êtes le premier arrêt : arrivée estimée vers ${vers}.`
        : `Vous êtes le ${ordinal(rang)} arrêt de la tournée : arrivée estimée vers ${vers}. Nous vous préviendrons quand vous serez le prochain.`,
    url: "/espace",
    tag: "livraison",
  };
}

/** Le client précédent vient d'être livré. */
export function messageProchain(dureeSecondes: number, maintenant: Date): MessagePush {
  const minutes = Math.round(dureeSecondes / 60);
  const vers = heureParis(arrondiCinqMinutes(new Date(maintenant.getTime() + dureeSecondes * 1000)));
  return {
    titre: "📍 Vous êtes le prochain !",
    corps:
      minutes <= 3
        ? "Le livreur arrive dans quelques minutes."
        : `Le livreur arrive dans environ ${minutes} min (vers ${vers}).`,
    url: "/espace",
    tag: "livraison",
  };
}

/** Estimation sans service d'itinéraires : 1,3 × la distance à vol d'oiseau, à 40 km/h. */
export function dureeEstimee(distanceMetres: number): number {
  return (distanceMetres * 1.3) / (40_000 / 3600);
}

/** Après la livraison : merci, et un lien pour donner son avis. */
export function messageMerci(commandeId: string): MessagePush {
  return {
    titre: "🧡 Merci pour votre commande !",
    corps: "Bonne dégustation ! Un souci ou un avis sur votre panier ? Dites-le-nous en un geste.",
    url: `/espace/avis/${commandeId}`,
    tag: "merci",
  };
}

/** Composition de la semaine publiée : quelques produits et l'heure de clôture. */
export function messageAnnonce(contenu: string | null, cloture: string | null): MessagePush {
  const produits = (contenu ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((l) => l.replace(/^[\d,.]+\s*(kg|g|botte|bottes|barquette|pièces?)?\s*(de |d')?/i, ""))
    .join(", ");
  return {
    titre: "🥕 Les paniers de la semaine sont prêts !",
    corps: `${produits ? `Au menu : ${produits}… ` : ""}${cloture ? `Commandez avant ${cloture}.` : "Commandez dès maintenant."}`,
    url: "/espace",
    tag: "annonce",
  };
}

/** Rappel du jeudi : midi, puis dernier rappel le soir. */
export function messageRappel(moment: "midi" | "soir", prenom: string, cloture: string): MessagePush {
  return moment === "midi"
    ? {
        titre: "🧺 Votre panier de la semaine ?",
        corps: `${prenom ? `Bonjour ${prenom}, n` : "N"}'oubliez pas de commander avant ${cloture}.`,
        url: "/espace/commander",
        tag: "rappel",
      }
    : {
        titre: "⏰ Dernier rappel",
        corps: `Les commandes ferment ${cloture} : il est encore temps de commander votre panier.`,
        url: "/espace/commander",
        tag: "rappel",
      };
}
