import { describe, expect, it } from "vitest";
import {
  niveauSuffisant,
  niveauSuivant,
  prochaineRecompense,
  recompensesDisponibles,
  soldeDisponible,
  type RecompenseProposee,
} from "@/lib/domaine/fidelite";

const R = (id: string, cout: number, niveau: RecompenseProposee["niveau"] = "standard", actif = true) => ({
  id,
  nom: id,
  description: null,
  cout_tampons: cout,
  niveau,
  article_id: null,
  actif,
});

const recompenses = [R("supplement", 5), R("confiture", 10), R("panier30", 20, "vip"), R("panier50", 30, "ultra"), R("ancienne", 3, "standard", false)];

describe("fidélité", () => {
  it("niveaux : un Ultra accède aux récompenses VIP, pas l'inverse", () => {
    expect(niveauSuffisant("ultra", "vip")).toBe(true);
    expect(niveauSuffisant("vip", "ultra")).toBe(false);
    expect(niveauSuffisant("standard", "standard")).toBe(true);
  });

  it("récompenses disponibles selon le solde et le niveau", () => {
    expect(recompensesDisponibles(7, "standard", recompenses).map((r) => r.id)).toEqual(["supplement"]);
    expect(recompensesDisponibles(25, "standard", recompenses).map((r) => r.id)).toEqual(["supplement", "confiture"]);
    expect(recompensesDisponibles(25, "vip", recompenses).map((r) => r.id)).toEqual(["supplement", "confiture", "panier30"]);
    expect(recompensesDisponibles(2, "ultra", recompenses)).toEqual([]);
  });

  it("prochaine récompense à atteindre", () => {
    expect(prochaineRecompense(7, "standard", recompenses)).toMatchObject({ recompense: { id: "confiture" }, manque: 3 });
    expect(prochaineRecompense(12, "standard", recompenses)).toBeNull();
    expect(prochaineRecompense(12, "vip", recompenses)).toMatchObject({ recompense: { id: "panier30" }, manque: 8 });
  });

  it("niveau suivant et filleuls manquants", () => {
    const p = { filleuls_vip: 5, filleuls_ultra: 10 };
    expect(niveauSuivant("standard", 2, p)).toEqual({ niveau: "vip", manque: 3 });
    expect(niveauSuivant("vip", 7, p)).toEqual({ niveau: "ultra", manque: 3 });
    expect(niveauSuivant("ultra", 12, p)).toBeNull();
  });

  it("solde disponible pendant la saisie : on rend les récompenses retirées, on retire les nouvelles", () => {
    const enregistrees = [{ id: "a", cout_tampons: 5 }];
    expect(soldeDisponible(2, enregistrees, [{ id: "a", cout_tampons: 5 }])).toBe(2);
    expect(soldeDisponible(2, enregistrees, [])).toBe(7);
    expect(soldeDisponible(2, enregistrees, [{ id: "a", cout_tampons: 5 }, { cout_tampons: 5 }])).toBe(-3);
  });
});
