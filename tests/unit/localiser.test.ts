import { describe, expect, it } from "vitest";
import { meilleurePosition, texteAdresse } from "@/lib/geocodage/localiser";
import type { AdresseTrouvee } from "@/lib/geocodage/types";

const resultat = (r: Partial<AdresseTrouvee>): AdresseTrouvee => ({
  libelle: "4 Rue Neuve 83000 Toulon",
  ligne: "4 Rue Neuve",
  codePostal: "83000",
  commune: "Toulon",
  codeInsee: "83137",
  lat: 43.12,
  lng: 5.93,
  score: 0.9,
  precision: "numero",
  ...r,
});

describe("repère automatique d'après l'adresse", () => {
  it("prend le premier résultat précis du même code postal", () => {
    const r = meilleurePosition({ codePostal: "83000" }, [
      resultat({ codePostal: "83400", lat: 1 }),
      resultat({ precision: "commune", lat: 2 }),
      resultat({ score: 0.3, lat: 3 }),
      resultat({ lat: 4 }),
    ]);
    expect(r?.lat).toBe(4);
  });

  it("refuse une autre rue du même code postal", () => {
    const autre = resultat({ ligne: "3 Chemin des Oliviers", codePostal: "83230" });
    expect(meilleurePosition({ codePostal: "83230", ligne: "Lieu-dit Les Pins" }, [autre])).toBeNull();
    expect(meilleurePosition({ codePostal: "83230", ligne: "3 chemin des oliviers" }, [autre])).toBe(autre);
    expect(meilleurePosition({ codePostal: "83000", ligne: "4 rue Neuve" }, [resultat({})])?.lat).toBe(43.12);
  });

  it("rien de sûr : pas de repère", () => {
    expect(meilleurePosition({ codePostal: "83000" }, [resultat({ codePostal: "13000" })])).toBeNull();
    expect(meilleurePosition({ codePostal: "83000" }, [])).toBeNull();
  });

  it("compose le texte de recherche", () => {
    expect(texteAdresse({ ligne: " 4 rue  Neuve ", codePostal: "83000", commune: "Toulon" })).toBe("4 rue Neuve 83000 Toulon");
  });
});
