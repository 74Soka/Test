import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

let base: BaseDeTest;
let admin: string;
let livreur: string;
let samedi: string;
let dimanche: string;
let panier: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  livreur = await creerCompte(base.client, "livreur");
  samedi = await creerSecteur(base.client, { jour: 6 });
  dimanche = await creerSecteur(base.client, { jour: 7 });
  panier = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
});

afterAll(async () => {
  await base?.detruire();
});

const commeAdmin = <T>(fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId: admin }, fn);

async function nouvelleCommande(date = "2026-11-14") {
  const client = await creerClient(base.client, samedi);
  const id = await commeAdmin((c) =>
    enregistrerCommande(c, { clientId: client, date, lignes: [{ article_id: panier, quantite: 1 }] }),
  );
  return { client, id };
}

async function lire(id: string) {
  const { rows } = await base.client.query<{ secteur_id: string | null; date: string }>(
    "select secteur_id, to_char(date_livraison, 'YYYY-MM-DD') as date from public.commandes where id = $1",
    [id],
  );
  return rows[0];
}

const changerSecteur = (id: string, secteurId: string | null) =>
  commeAdmin((c) => c.query("update public.commandes set secteur_id = $2 where id = $1", [id, secteurId]));

describe("secteur pour une seule livraison", () => {
  it("par défaut, la commande suit le secteur du client", async () => {
    const { id } = await nouvelleCommande();
    expect(await lire(id)).toEqual({ secteur_id: null, date: "2026-11-14" });
  });

  it("un autre secteur cale la date sur son jour, dans la même semaine", async () => {
    const { id } = await nouvelleCommande();
    await changerSecteur(id, dimanche);
    expect(await lire(id)).toEqual({ secteur_id: dimanche, date: "2026-11-15" });

    // Retour au secteur habituel : la date choisie ensuite est libre
    await changerSecteur(id, null);
    await commeAdmin((c) => c.query("update public.commandes set date_livraison = '2026-11-14' where id = $1", [id]));
    expect(await lire(id)).toEqual({ secteur_id: null, date: "2026-11-14" });
  });

  it("choisir le secteur habituel du client ne compte pas comme un changement", async () => {
    const { id } = await nouvelleCommande();
    await changerSecteur(id, samedi);
    expect((await lire(id)).secteur_id).toBeNull();
  });

  it("une modification de la commande (date du samedi) garde le dimanche choisi", async () => {
    const { client, id } = await nouvelleCommande();
    await changerSecteur(id, dimanche);
    await commeAdmin((c) =>
      enregistrerCommande(c, {
        clientId: client,
        date: "2026-11-14",
        commandeId: id,
        lignes: [{ article_id: panier, quantite: 2 }],
      }),
    );
    expect(await lire(id)).toEqual({ secteur_id: dimanche, date: "2026-11-15" });
  });

  it("un livreur ne peut pas changer le secteur d'une commande", async () => {
    const { id } = await nouvelleCommande();
    await en(base.client, { role: "authenticated", userId: livreur }, (c) =>
      c.query("update public.commandes set secteur_id = $2 where id = $1", [id, dimanche]),
    );
    expect((await lire(id)).secteur_id).toBeNull();
  });

  it("si le secteur choisi est supprimé, la commande revient au secteur du client", async () => {
    const autre = await creerSecteur(base.client, { jour: 7 });
    const { id } = await nouvelleCommande();
    await changerSecteur(id, autre);
    await base.client.query("delete from public.secteurs where id = $1", [autre]);
    expect((await lire(id)).secteur_id).toBeNull();
  });
});

describe("retour au secteur habituel depuis l'équipe", () => {
  it("la date reprend le jour envoyé avec le secteur", async () => {
    const { client, id } = await nouvelleCommande();
    await changerSecteur(id, dimanche);
    // Comme l'application : la commande, puis secteur et date ensemble
    await commeAdmin(async (c) => {
      await enregistrerCommande(c, {
        clientId: client,
        date: "2026-11-14",
        commandeId: id,
        lignes: [{ article_id: panier, quantite: 1 }],
      });
      await c.query("update public.commandes set secteur_id = null, date_livraison = '2026-11-14' where id = $1", [id]);
    });
    expect(await lire(id)).toEqual({ secteur_id: null, date: "2026-11-14" });
  });
});
