/**
 * Panier et recette de la semaine dernière (ancienne page « Panier Frais et
 * Français »), pour les essais de la page publique /paniers.
 */
export const PANIER_30 = [
  "500 g clémentines BIO",
  "2 pommes BIO",
  "2 oranges BIO",
  "2 kiwis BIO",
  "500 g raisins sans pépins BIO",
  "3 tomates anciennes BIO",
  "1 botte de carottes fanes",
  "1 botte de radis BIO",
  "500 g épinards BIO",
  "3 courgettes",
  "3 poireaux",
  "1 kg pommes de terre BIO",
  "1 oignon BIO",
  "1 échalote BIO",
  "1 salade",
].join("\n");

export const PANIER_50 = [
  "Tout le panier à 30 €, plus :",
  "500 g fraises BIO",
  "500 g prunes BIO",
  "500 g mandarines BIO",
  "1 barquette de tomates cerises BIO",
  "1 kg patates douces BIO",
].join("\n");

export const RECETTE = {
  titre: "Poêlée paysanne poireaux, pommes de terre et épinards, œufs au plat",
  infos: "4 personnes · 35 min · Facile · 1 seule poêle",
  ingredients: [
    "1 kg de pommes de terre",
    "3 poireaux",
    "500 g d'épinards",
    "1 oignon",
    "1 échalote",
    "4 œufs",
    "3 c. à soupe d'huile d'olive, 1 noix de beurre",
    "Sel, poivre, 1 pincée de muscade (facultatif)",
  ].join("\n"),
  etapes: [
    "Épluchez les pommes de terre et coupez-les en cubes de 2 cm. Rincez-les et séchez-les dans un torchon.",
    "Coupez le vert foncé des poireaux, fendez-les en deux et rincez-les bien sous l'eau. Émincez-les en rondelles de 1 cm. Émincez l'oignon et l'échalote.",
    "Dans une grande poêle, faites chauffer l'huile à feu moyen. Ajoutez les pommes de terre, salez et faites dorer 15 min en remuant toutes les 3 min.",
    "Ajoutez les poireaux, l'oignon, l'échalote et le beurre. Couvrez et laissez cuire 8 min à feu doux, jusqu'à ce que les poireaux soient fondants.",
    "Ajoutez les épinards lavés par poignées : ils réduisent en 2 min. Poivrez et ajoutez la muscade.",
    "Creusez 4 petits nids dans la poêlée et cassez-y les œufs. Couvrez 4 à 5 min, jusqu'à ce que le blanc soit pris et le jaune encore coulant. Servez aussitôt.",
  ].join("\n"),
  astuce: "servez avec la salade du panier en accompagnement, et des clémentines en dessert.",
};
