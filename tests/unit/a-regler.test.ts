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
