import { formaterPrix } from "@/lib/domaine/argent";
import { formaterDate, majuscule } from "@/lib/domaine/dates";
import type { DetailCommande, EvenementCommande } from "./alertes";

/**
 * E-mails aux clients après une commande en ligne : confirmation (ou
 * modification) avec le détail, et annulation. Texte simple, en français.
 */

export type DetailCommandeClient = Omit<DetailCommande, "client" | "lien"> & {
  prenom: string;
  /** « vendredi 13 novembre à 12 h » : jusqu'à quand le client peut changer d'avis */
  cloture: string | null;
  /** Lien vers son espace */
  lien: string;
  telephone: string;
};

const SUJETS: Record<EvenementCommande, (date: string) => string> = {
  nouvelle: (date) => `Votre commande est confirmée · livraison ${date}`,
  modifiee: (date) => `Votre commande est modifiée · livraison ${date}`,
  annulee: (date) => `Votre commande est annulée · ${date}`,
};

export function emailCommandeClient(evenement: EvenementCommande, d: DetailCommandeClient): { sujet: string; texte: string } {
  const date = formaterDate(d.dateLivraison);
  const bonjour = d.prenom ? `Bonjour ${d.prenom},` : "Bonjour,";
  const lignes: string[] = [bonjour, ""];

  if (evenement === "annulee") {
    lignes.push(
      `Votre commande pour la livraison du ${date} est bien annulée.`,
      "",
      `Vous pouvez recommander quand vous voulez depuis votre espace : ${d.lien}`,
    );
  } else {
    const total = d.lignes.reduce((t, l) => t + l.quantite * l.prix_unitaire_centimes, 0);
    lignes.push(
      evenement === "nouvelle"
        ? `Merci pour votre commande ! Elle est bien enregistrée pour la livraison du ${date}.`
        : `Votre commande pour la livraison du ${date} est bien modifiée.`,
      "",
      "Votre commande :",
      ...d.lignes.map((l) => `- ${l.quantite} × ${l.libelle} (${formaterPrix(l.quantite * l.prix_unitaire_centimes)})`),
    );
    if (d.offerts.length) {
      lignes.push("", "Offert grâce à votre fidélité :", ...d.offerts.map((o) => `- ${o.quantite} × ${o.libelle}`));
    }
    lignes.push("", `Total à régler à la livraison : ${formaterPrix(total)}`);
    if (d.notes) lignes.push(`Votre message : « ${d.notes} »`);
    lignes.push(
      "",
      d.cloture
        ? `Vous pouvez la modifier ou l'annuler depuis votre espace jusqu'au ${d.cloture} : ${d.lien}`
        : `Retrouvez-la dans votre espace : ${d.lien}`,
      "",
      "Astuce : activez les notifications dans votre espace pour savoir quand le livreur arrive.",
    );
  }

  lignes.push("", `Une question ? Appelez-nous au ${d.telephone}.`, "", "À très vite,", "L'équipe Frais et Français");
  return { sujet: SUJETS[evenement](majuscule(date)), texte: lignes.join("\n") };
}

/** E-mail au client quand l'administrateur a validé son inscription. */
export function emailCompteValide(d: { prenom: string; lien: string; telephone: string }): {
  sujet: string;
  texte: string;
} {
  return {
    sujet: "Votre compte Frais et Français est validé",
    texte: [
      d.prenom ? `Bonjour ${d.prenom},` : "Bonjour,",
      "",
      "Bonne nouvelle : votre compte est validé, bienvenue chez Frais et Français !",
      "",
      "Depuis votre espace, vous pouvez maintenant :",
      "- voir les paniers de la semaine et commander en ligne ;",
      "- modifier ou annuler votre commande jusqu'à la clôture ;",
      "- suivre vos livraisons et vos graines de fidélité 🌱.",
      "",
      `Votre espace : ${d.lien}`,
      "",
      `Une question ? Appelez-nous au ${d.telephone}.`,
      "",
      "À très vite,",
      "L'équipe Frais et Français",
    ].join("\n"),
  };
}
