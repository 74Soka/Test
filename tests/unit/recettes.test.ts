import { describe, expect, it } from "vitest";
import { pastillesInfos, provenanceIngredient } from "@/lib/domaine/recettes";
import { PANIER_30, PANIER_50, RECETTE } from "../fixtures/semaine-derniere";

const panier = [...PANIER_30.split("\n"), ...PANIER_50.split("\n")];
const supplements = ["Haricots verts BIO (500 g)", "Œufs BIO (6)", "Confiture artisanale – figue"];

describe("recette de la semaine", () => {
  it("repère les ingrédients du panier et des suppléments (semaine dernière)", () => {
    const resultat = RECETTE.ingredients.split("\n").map((l) => provenanceIngredient(l, panier, supplements));
    expect(resultat).toEqual(["panier", "panier", "panier", "panier", "panier", "supplement", null, null]);
  });

  it("ne repère rien sur les mots d'unité ou de liaison", () => {
    expect(provenanceIngredient("1 grande cuillère à soupe de miel", panier, supplements)).toBeNull();
    expect(provenanceIngredient("Sel", panier, supplements)).toBeNull();
  });

  it("découpe les infos en pastilles", () => {
    expect(pastillesInfos(RECETTE.infos)).toEqual(["4 personnes", "35 min", "Facile", "1 seule poêle"]);
    expect(pastillesInfos(null)).toEqual([]);
  });
});
