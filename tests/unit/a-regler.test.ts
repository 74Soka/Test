import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetailARegler } from "@/components/a-regler";

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("montant à régler avec le solde", () => {
  it("sans solde : une seule ligne", () => {
    expect(texte(renderToStaticMarkup(createElement(DetailARegler, { total: 3800, solde: 0 })))).toMatch(/^À régler à la livraison 38\s€$/);
  });
  it("le client doit : ajouté et précisé", () => {
    const t = texte(renderToStaticMarkup(createElement(DetailARegler, { total: 3800, solde: 1000, libelleTotal: "Ma commande" })));
    expect(t).toMatch(/Ma commande 38\s€ Reste dû \(livraisons précédentes\) \+ 10\s€ À régler à la livraison 48\s€/);
  });
  it("avoir : déduit, le reste gardé pour la fois suivante", () => {
    const t = texte(renderToStaticMarkup(createElement(DetailARegler, { total: 3000, solde: -5000, pour: "equipe" })));
    expect(t).toMatch(/Avoir du client, déduit − 30\s€ À régler à la livraison 0\s€/);
    expect(t).toMatch(/Il restera au client 20\s€ d&#x27;avoir|Il restera au client 20\s€ d'avoir/);
  });
});

describe("récapitulatif des encaissements : compléments", async () => {
  const { RecapEncaissements } = await import("@/components/recap-encaissements");
  const commande = {
    secteurId: "s1",
    totalCentimes: 3000,
    statut: "livree" as const,
    payee: true,
    montantRecuCentimes: 3000,
    modePaiement: "especes" as const,
    soldeAvantCentimes: 0,
  };
  const rendu = (c: typeof commande & { complementsQuantite?: number; complementsCentimes?: number }) =>
    texte(renderToStaticMarkup(createElement(RecapEncaissements, { commandes: [c], secteurs: [{ id: "s1", nom: "S1", couleur: "#000" }] })));

  it("affiche « Aucun complément » quand le livreur n'a rien ajouté", () => {
    expect(rendu(commande)).toContain("➕ Aucun complément");
  });
  it("sinon, le nombre et le montant", () => {
    const t = rendu({ ...commande, totalCentimes: 3800, montantRecuCentimes: 3800, complementsQuantite: 1, complementsCentimes: 800 });
    expect(t).toMatch(/➕ Compléments du livreur : 1 article · 8\s€/);
    expect(t).not.toContain("Aucun complément");
  });
});
