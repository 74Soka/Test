import { formaterPrix } from "@/lib/domaine/argent";
import { formaterDate, majuscule } from "@/lib/domaine/dates";

/**
 * Textes des e-mails d'alerte envoyés à l'équipe (en texte simple : lisibles
 * partout, jamais classés comme publicité à cause de la mise en forme).
 */

export type EvenementCommande = "nouvelle" | "modifiee" | "annulee";

export type DetailCommande = {
  client: string;
  dateLivraison: string;
  lignes: { libelle: string; quantite: number; prix_unitaire_centimes: number }[];
  offerts: { libelle: string; quantite: number; recompense: string }[];
  notes: string | null;
  lien: string;
};

const TITRES: Record<EvenementCommande, string> = {
  nouvelle: "Nouvelle commande",
  modifiee: "Commande modifiée",
  annulee: "Commande annulée",
};

export function alerteCommande(evenement: EvenementCommande, d: DetailCommande): { sujet: string; texte: string } {
  const date = majuscule(formaterDate(d.dateLivraison));
  const total = d.lignes.reduce((t, l) => t + l.quantite * l.prix_unitaire_centimes, 0);
  const lignes = [
    `${TITRES[evenement]} en ligne de ${d.client}`,
    `Livraison : ${date}`,
    "",
  ];
  if (evenement !== "annulee") {
    lignes.push(...d.lignes.map((l) => `- ${l.quantite} × ${l.libelle} (${formaterPrix(l.quantite * l.prix_unitaire_centimes)})`));
    if (d.offerts.length) {
      lignes.push("", "Offert (fidélité) :", ...d.offerts.map((o) => `- ${o.quantite} × ${o.libelle} (${o.recompense})`));
    }
    lignes.push("", `Total à encaisser : ${formaterPrix(total)}`);
    if (d.notes) lignes.push(`Message du client : « ${d.notes} »`);
    lignes.push("");
  }
  lignes.push(`Voir la commande : ${d.lien}`);
  return { sujet: `${TITRES[evenement]} : ${d.client} · ${date}`, texte: lignes.join("\n") };
}

export function alerteInscription(d: {
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  parrain: string | null;
  lien: string;
}): { sujet: string; texte: string } {
  return {
    sujet: `Nouvelle inscription à valider : ${d.nom}`,
    texte: [
      `${d.nom} vient de s'inscrire en ligne.`,
      "",
      `E-mail : ${d.email}`,
      `Téléphone : ${d.telephone}`,
      `Adresse : ${d.adresse}`,
      ...(d.parrain ? [`Parrainé par : ${d.parrain}`] : []),
      "",
      `Valider l'inscription : ${d.lien}`,
    ].join("\n"),
  };
}

export function alerteAvis(d: {
  client: string;
  dateLivraison: string;
  note: number | null;
  commentaire: string | null;
  lien: string;
}): { sujet: string; texte: string } {
  const etoiles = d.note ? `${"★".repeat(d.note)}${"☆".repeat(5 - d.note)} (${d.note}/5)` : "sans note";
  return {
    sujet: `${d.note !== null && d.note <= 2 ? "⚠️ " : ""}Avis de ${d.client} : ${etoiles}`,
    texte: [
      `${d.client} a donné son avis sur la livraison du ${formaterDate(d.dateLivraison)}.`,
      "",
      `Note : ${etoiles}`,
      ...(d.commentaire ? ["", `« ${d.commentaire} »`] : []),
      "",
      `Voir les retours : ${d.lien}`,
    ].join("\n"),
  };
}
