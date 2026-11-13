import { describe, expect, it } from "vitest";
import {
  ajouterJours,
  aujourdhui,
  estDateIso,
  formaterDate,
  formaterDateCourte,
  formaterSemaine,
  joursDeLaSemaine,
  jourSemaine,
  lundiDeLaSemaine,
  prochaineDate,
  debutCommandesEquipe,
} from "@/lib/domaine/dates";
import { estMobile, formaterTelephone, normaliserTelephone } from "@/lib/domaine/telephone";
import { centimesVersSaisie, formaterPrix, saisieVersCentimes } from "@/lib/domaine/argent";
import { correspond, nomComplet, normaliser } from "@/lib/domaine/texte";
import {
  comparerSecteurs,
  dateDuSecteurDansLaSemaine,
  libelleSecteur,
  libelleTournee,
  secteurDeLivraison,
  secteurPropose,
} from "@/lib/domaine/secteurs";
import { contientUnPanier, manquePourCommander, nombreDePaniers, recapitulatif, resumeLignes, totalCommande } from "@/lib/domaine/commandes";

// Les espaces insécables de Intl sont remplacés par des espaces simples pour comparer.
const espaces = (t: string) => t.replace(/[  ]/g, " ");

describe("dates", () => {
  it("l'équipe commande pour la semaine en cours jusqu'au dimanche 12 h", () => {
    // Vendredi 13 novembre 2026, 14 h à Paris : encore la semaine en cours (samedi 14, dimanche 15)
    expect(debutCommandesEquipe(new Date("2026-11-13T13:00:00Z"))).toBe("2026-11-13");
    expect(prochaineDate(6, debutCommandesEquipe(new Date("2026-11-13T13:00:00Z")))).toBe("2026-11-14");
    // Dimanche 15, 11 h 59 : la tournée du dimanche reste proposée
    expect(prochaineDate(7, debutCommandesEquipe(new Date("2026-11-15T10:59:00Z")))).toBe("2026-11-15");
    // Dimanche 15, 12 h : semaine suivante
    expect(debutCommandesEquipe(new Date("2026-11-15T11:00:00Z"))).toBe("2026-11-16");
    expect(prochaineDate(7, debutCommandesEquipe(new Date("2026-11-15T11:00:00Z")))).toBe("2026-11-22");
  });

  it("donne le jour ISO (lundi = 1, dimanche = 7)", () => {
    expect(jourSemaine("2026-11-02")).toBe(1);
    expect(jourSemaine("2026-11-07")).toBe(6);
    expect(jourSemaine("2026-11-08")).toBe(7);
  });

  it("trouve la prochaine date d'un jour donné, aujourd'hui inclus", () => {
    // vendredi 6 novembre 2026
    expect(prochaineDate(6, "2026-11-06")).toBe("2026-11-07");
    expect(prochaineDate(7, "2026-11-06")).toBe("2026-11-08");
    expect(prochaineDate(6, "2026-11-07")).toBe("2026-11-07");
    // dimanche → samedi suivant
    expect(prochaineDate(6, "2026-11-08")).toBe("2026-11-14");
  });

  it("passe correctement les fins de mois et d'année", () => {
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(prochaineDate(6, "2026-12-28")).toBe("2027-01-02");
    expect(ajouterJours("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("calcule la semaine (lundi → dimanche)", () => {
    expect(lundiDeLaSemaine("2026-11-08")).toBe("2026-11-02");
    expect(lundiDeLaSemaine("2026-11-02")).toBe("2026-11-02");
    expect(joursDeLaSemaine("2026-11-05")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("formate en français", () => {
    expect(formaterDate("2026-11-07")).toBe("samedi 7 novembre");
    expect(formaterDate("2026-11-07", { annee: true })).toBe("samedi 7 novembre 2026");
    expect(formaterDateCourte("2026-11-08")).toBe("dim. 8 nov.");
    expect(formaterSemaine("2026-11-05")).toBe("Semaine du 2 au 8 novembre");
    expect(formaterSemaine("2026-12-02")).toBe("Semaine du 30 novembre au 6 décembre");
  });

  it("valide le format ISO", () => {
    expect(estDateIso("2026-11-07")).toBe(true);
    expect(estDateIso("2026-02-30")).toBe(false);
    expect(estDateIso("07/11/2026")).toBe(false);
  });

  it("donne la date du jour à Paris, même tard le soir en UTC", () => {
    // 31 décembre 2026, 23 h 30 UTC = 1er janvier 00 h 30 à Paris
    expect(aujourdhui(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("téléphone", () => {
  it.each([
    ["06 12 34 56 78", "+33612345678"],
    ["06.12.34.56.78", "+33612345678"],
    ["0612345678", "+33612345678"],
    ["+33 6 12 34 56 78", "+33612345678"],
    ["+33 (0)6 12 34 56 78", "+33612345678"],
    ["0033612345678", "+33612345678"],
    ["04 94 00 00 00", "+33494000000"],
    ["+32 470 12 34 56", "+32470123456"],
  ])("normalise « %s »", (saisie, attendu) => {
    expect(normaliserTelephone(saisie)).toBe(attendu);
  });

  it.each(["", "  ", "1234", "06 12 34", "abc", "00 12 34 56 78"])("refuse « %s »", (saisie) => {
    expect(normaliserTelephone(saisie)).toBeNull();
  });

  it("formate pour l'affichage", () => {
    expect(formaterTelephone("+33612345678")).toBe("06 12 34 56 78");
    expect(formaterTelephone("+32470123456")).toBe("+32470123456");
    expect(formaterTelephone(null)).toBe("");
  });

  it("reconnaît les mobiles français", () => {
    expect(estMobile("+33612345678")).toBe(true);
    expect(estMobile("+33712345678")).toBe(true);
    expect(estMobile("+33494000000")).toBe(false);
  });
});

describe("prix", () => {
  it("formate les centimes en euros", () => {
    expect(espaces(formaterPrix(3000))).toBe("30 €");
    expect(espaces(formaterPrix(3050))).toBe("30,50 €");
    expect(espaces(formaterPrix(123400))).toBe("1 234 €");
  });

  it.each([
    ["30", 3000],
    ["30,5", 3050],
    ["30.50", 3050],
    ["30 €", 3000],
    ["0", 0],
  ])("convertit la saisie « %s »", (saisie, attendu) => {
    expect(saisieVersCentimes(saisie)).toBe(attendu);
  });

  it.each(["", "-5", "abc", "30,555", "1e3"])("refuse la saisie « %s »", (saisie) => {
    expect(saisieVersCentimes(saisie)).toBeNull();
  });

  it("prépare un prix pour un champ de saisie", () => {
    expect(centimesVersSaisie(3000)).toBe("30");
    expect(centimesVersSaisie(3050)).toBe("30,50");
    expect(centimesVersSaisie(505)).toBe("5,05");
  });
});

describe("recherche", () => {
  it("ignore accents, majuscules et espaces superflus", () => {
    expect(normaliser("  Hyères   Œuf ")).toBe("hyeres oeuf");
  });

  it("trouve un client par nom, prénom, commune ou téléphone", () => {
    const champs = ["Claire", "Martin", "Hyères", "+33612345678"];
    expect(correspond("claire", champs)).toBe(true);
    expect(correspond("martin hyeres", champs)).toBe(true);
    expect(correspond("06 12 34", champs)).toBe(false); // mots séparés trop courts
    expect(correspond("0612345678", champs)).toBe(true);
    expect(correspond("345678", champs)).toBe(true);
    expect(correspond("dupont", champs)).toBe(false);
    expect(correspond("", champs)).toBe(true);
  });

  it("compose le nom complet", () => {
    expect(nomComplet({ prenom: "Claire", nom: "Martin" })).toBe("Claire Martin");
    expect(nomComplet({ prenom: "", nom: "Martin" })).toBe("Martin");
  });
});

describe("secteurs", () => {
  const secteurs = [
    { id: "a", nom: "Ouest", jour: 6, creneau: "matin" as const, communes: [{ code_insee: "83137" }] },
    { id: "b", nom: "Est", jour: 6, creneau: "apres_midi" as const, communes: [{ code_insee: "83069" }, { code_insee: "83047" }] },
    { id: "c", nom: "Centre", jour: 7, creneau: "matin" as const, communes: [{ code_insee: "83047" }] },
  ];

  it("propose le secteur qui couvre la commune", () => {
    expect(secteurPropose("83137", secteurs)?.id).toBe("a");
    expect(secteurPropose("83069", secteurs)?.id).toBe("b");
  });

  it("ne propose rien si la commune est dans plusieurs secteurs ou dans aucun", () => {
    expect(secteurPropose("83047", secteurs)).toBeNull();
    expect(secteurPropose("13001", secteurs)).toBeNull();
    expect(secteurPropose(null, secteurs)).toBeNull();
  });

  it("libelle et trie les tournées", () => {
    expect(libelleTournee(secteurs[1])).toBe("Samedi après-midi");
    expect([secteurs[2], secteurs[1], secteurs[0]].sort(comparerSecteurs).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("nomme le secteur sans doublon pour le client", () => {
    expect(libelleSecteur("Secteur 1")).toBe("Secteur 1");
    expect(libelleSecteur("secteur 3 ")).toBe("secteur 3");
    expect(libelleSecteur("Toulon Est")).toBe("Secteur Toulon Est");
  });

  it("livre dans le secteur choisi pour la commande, sinon dans celui du client", () => {
    expect(secteurDeLivraison({ secteur_id: null, client: { secteur_id: "a" } })).toBe("a");
    expect(secteurDeLivraison({ secteur_id: "c", client: { secteur_id: "a" } })).toBe("c");
  });

  it("cale la date sur le jour du secteur, dans la même semaine", () => {
    expect(dateDuSecteurDansLaSemaine({ jour: 7 }, "2026-11-14")).toBe("2026-11-15");
    expect(dateDuSecteurDansLaSemaine({ jour: 6 }, "2026-11-15")).toBe("2026-11-14");
    expect(dateDuSecteurDansLaSemaine({ jour: 1 }, "2026-11-15")).toBe("2026-11-09");
  });
});

describe("commandes", () => {
  const lignes = [
    { article_id: "s1", libelle: "Œufs", categorie: "supplement" as const, quantite: 2, prix_unitaire_centimes: 500 },
    { article_id: "p30", libelle: "Panier 30 €", categorie: "panier" as const, quantite: 2, prix_unitaire_centimes: 3000 },
    { article_id: "p50", libelle: "Panier 50 €", categorie: "panier" as const, quantite: 1, prix_unitaire_centimes: 5000 },
  ];

  it("calcule le total et le nombre de paniers", () => {
    expect(totalCommande(lignes)).toBe(12000);
    expect(nombreDePaniers(lignes)).toBe(3);
  });

  it("résume le contenu, paniers d'abord", () => {
    expect(resumeLignes(lignes)).toBe("2 × Panier 30 €, 1 × Panier 50 €, 2 × Œufs");
  });

  it("vérifie la présence d'au moins un panier", () => {
    const articles = [
      { id: "p30", categorie: "panier" as const },
      { id: "s1", categorie: "supplement" as const },
    ];
    expect(contientUnPanier({ p30: 1 }, articles)).toBe(true);
    expect(contientUnPanier({ s1: 3 }, articles)).toBe(false);
    expect(contientUnPanier({ p30: 0, s1: 1 }, articles)).toBe(false);
  });

  it("sans panier, demande 30 € de suppléments", () => {
    expect(manquePourCommander(true, 0)).toBeNull();
    expect(manquePourCommander(false, 3000)).toBeNull();
    expect(manquePourCommander(false, 0)).toBe("Choisissez au moins un panier, ou 30 € de suppléments.");
    expect(manquePourCommander(false, 2250)).toBe(`Sans panier, 30 € de suppléments minimum : encore ${formaterPrix(750)}.`);
  });

  it("totalise le récapitulatif à préparer en ignorant les commandes annulées", () => {
    const recap = recapitulatif([
      { statut: "a_livrer", lignes },
      { statut: "livree", lignes: [lignes[1]] },
      { statut: "annulee", lignes: [lignes[2]] },
    ]);
    expect(recap.map((l) => [l.libelle, l.quantite])).toEqual([
      ["Panier 30 €", 4],
      ["Panier 50 €", 1],
      ["Œufs", 2],
    ]);
  });

  it("compte aussi les articles offerts, en le signalant", () => {
    const recap = recapitulatif([
      {
        statut: "a_livrer",
        lignes: [lignes[1]],
        recompenses: [{ cadeaux: [{ article_id: "s1", libelle: "Œufs", categorie: "supplement", quantite: 1 }] }],
      },
      {
        statut: "annulee",
        lignes: [],
        recompenses: [{ cadeaux: [{ article_id: "p30", libelle: "Panier 30 €", categorie: "panier", quantite: 1 }] }],
      },
    ]);
    expect(recap).toEqual([
      { cle: "p30", article_id: "p30", libelle: "Panier 30 €", categorie: "panier", quantite: 2, offerts: 0 },
      { cle: "s1", article_id: "s1", libelle: "Œufs", categorie: "supplement", quantite: 1, offerts: 1 },
    ]);
  });

  it("regroupe les suppléments libres de même nom", () => {
    const libre = (libelle: string, quantite: number) => ({
      article_id: null,
      libelle,
      categorie: "supplement" as const,
      quantite,
    });
    const recap = recapitulatif([
      { statut: "a_livrer", lignes: [libre("Fraises", 2)] },
      { statut: "a_livrer", lignes: [libre("fraises ", 1), libre("Miel", 1)] },
    ]);
    expect(recap.map((l) => [l.libelle, l.quantite])).toEqual([
      ["Fraises", 3],
      ["Miel", 1],
    ]);
  });
});

describe("codes de parrainage (saisie)", () => {
  it("normalise, affiche et reconnaît un code complet", async () => {
    const { codeComplet, formaterCode, normaliserCode } = await import("@/lib/domaine/parrainage");
    expect(normaliserCode(" evca-9616 ")).toBe("EVCA9616");
    expect(formaterCode("EVCA9616")).toBe("EVCA 9616");
    expect(formaterCode("madu43212")).toBe("MADU 43212");
    expect(codeComplet("EVCA 9616")).toBe(true);
    expect(codeComplet("EVCA 961")).toBe(false);
    expect(codeComplet("Emma Dubois")).toBe(false);
  });
});

describe("numéro de semaine", () => {
  it("suit la norme ISO (semaine 1 = celle du premier jeudi)", async () => {
    const { numeroSemaine } = await import("@/lib/domaine/dates");
    expect(numeroSemaine("2026-11-09")).toEqual({ semaine: 46, annee: 2026 });
    expect(numeroSemaine("2026-11-15")).toEqual({ semaine: 46, annee: 2026 });
    expect(numeroSemaine("2026-01-01")).toEqual({ semaine: 1, annee: 2026 });
    expect(numeroSemaine("2025-12-29")).toEqual({ semaine: 1, annee: 2026 });
    expect(numeroSemaine("2026-12-31")).toEqual({ semaine: 53, annee: 2026 });
    expect(numeroSemaine("2027-01-04")).toEqual({ semaine: 1, annee: 2027 });
  });
});
