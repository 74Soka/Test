import { describe, expect, it } from "vitest";
import {
  recapEncaissements,
  totalReconcilie,
  type CommandeEncaissement,
} from "@/lib/domaine/encaissements";

const c = (p: Partial<CommandeEncaissement>): CommandeEncaissement => ({
  secteurId: "s1",
  totalCentimes: 3000,
  statut: "livree",
  payee: true,
  montantRecuCentimes: 3000,
  modePaiement: "especes",
  soldeAvantCentimes: 0,
  ...p,
});

describe("récapitulatif des encaissements", () => {
  it("espèces, chèques, reste dû, avoir, ancienne dette, pas encore livré : tout retombe sur les commandes", () => {
    const { parSecteur, total } = recapEncaissements([
      c({}), // 30 € en espèces
      c({ modePaiement: "cheque", montantRecuCentimes: 5000, totalCentimes: 5000 }), // 50 € par chèque
      c({ montantRecuCentimes: 2000 }), // 20 € reçus sur 30 : 10 € restent dus
      c({ payee: false, montantRecuCentimes: null, modePaiement: null }), // livré non payé : 30 € dus
      c({ soldeAvantCentimes: -500, montantRecuCentimes: 2500 }), // avoir de 5 € déduit, 25 € reçus
      c({ soldeAvantCentimes: 1000, montantRecuCentimes: 4000 }), // ancienne dette de 10 € réglée en plus
      c({ totalCentimes: 4300, montantRecuCentimes: 4300, complementsQuantite: 2, complementsCentimes: 1300, secteurId: "s2" }),
      c({ statut: "a_livrer", payee: null, montantRecuCentimes: null, modePaiement: null, secteurId: "s2" }),
      c({ statut: "annulee" }), // ignorée
    ]);
    expect(total).toEqual({
      commandes: 8,
      montantCommandes: 23000 + 4300,
      especes: 3000 + 2000 + 2500 + 4000 + 4300,
      cheques: 5000,
      nonPrecise: 0,
      avoirsDeduits: 500,
      resteDu: 1000 + 3000,
      encaisseEnPlus: 1000,
      pasEncoreLivre: 3000,
      complementsQuantite: 2,
      complementsCentimes: 1300,
    });
    expect(totalReconcilie(total)).toBe(total.montantCommandes);
    expect(parSecteur.get("s2")?.pasEncoreLivre).toBe(3000);
    expect(parSecteur.get("s2")?.complementsCentimes).toBe(1300);
    expect(parSecteur.get("s1")?.complementsQuantite).toBe(0);
    for (const e of parSecteur.values()) expect(totalReconcilie(e)).toBe(e.montantCommandes);
  });

  it("payé sans montant saisi : tout est réglé, mode non précisé ; un gros avoir couvre toute la commande", () => {
    const { total } = recapEncaissements([
      c({ montantRecuCentimes: null, modePaiement: null, soldeAvantCentimes: 1000 }),
      c({ soldeAvantCentimes: -5000, montantRecuCentimes: 0, modePaiement: null }),
    ]);
    expect(total.nonPrecise).toBe(4000);
    expect(total.encaisseEnPlus).toBe(1000);
    expect(total.avoirsDeduits).toBe(3000);
    expect(totalReconcilie(total)).toBe(total.montantCommandes);
  });
});
