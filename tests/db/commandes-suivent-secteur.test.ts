import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

/** Changer le secteur d'un client fait passer ses livraisons à venir au jour du nouveau secteur. */

let base: BaseDeTest;
let admin: string;
let samediAprem: string;
let dimancheMatin: string;
let vendredi: string;
let panier: string;
/** Lundi de la semaine prochaine (AAAA-MM-JJ) */
let lundi: string;

const jourDe = (decalage: number) => {
  const d = new Date(`${lundi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  samediAprem = await creerSecteur(base.client, { jour: 6 });
  dimancheMatin = await creerSecteur(base.client, { jour: 7 });
  vendredi = await creerSecteur(base.client, { jour: 5 });
  panier = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
  const { rows } = await base.client.query<{ lundi: string }>(
    "select to_char(date_trunc('week', (now() at time zone 'Europe/Paris')::date + 7), 'YYYY-MM-DD') as lundi",
  );
  lundi = rows[0].lundi;
});

afterAll(async () => {
  await base?.detruire();
});

const commeAdmin = <T>(fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId: admin }, fn);

async function commande(client: string, date: string) {
  return commeAdmin((c) =>
    enregistrerCommande(c, { clientId: client, date, lignes: [{ article_id: panier, quantite: 1 }] }),
  );
}

async function date(id: string) {
  const { rows } = await base.client.query<{ date: string; secteur_id: string | null }>(
    "select to_char(date_livraison, 'YYYY-MM-DD') as date, secteur_id from public.commandes where id = $1",
    [id],
  );
  return rows[0];
}

const changerSecteur = (client: string, secteur: string) =>
  commeAdmin((c) => c.query("update public.clients set secteur_id = $1 where id = $2", [secteur, client]));

describe("le jour de livraison suit le secteur du client", () => {
  it("passé au dimanche matin : la commande du samedi passe au dimanche de la même semaine", async () => {
    const client = await creerClient(base.client, samediAprem);
    const id = await commande(client, jourDe(5));
    await changerSecteur(client, dimancheMatin);
    expect((await date(id)).date).toBe(jourDe(6));
    // Puis au vendredi : même semaine, la veille
    await changerSecteur(client, vendredi);
    expect((await date(id)).date).toBe(jourDe(4));
  });

  it("changer seulement la date reste libre ; un autre champ de la fiche ne touche pas aux dates", async () => {
    const client = await creerClient(base.client, dimancheMatin);
    const id = await commande(client, jourDe(5)); // samedi, choisi à la main
    expect((await date(id)).date).toBe(jourDe(5));
    await commeAdmin((c) => c.query("update public.clients set notes_livraison = 'Portail bleu' where id = $1", [client]));
    expect((await date(id)).date).toBe(jourDe(5));
  });

  it("une livraison « autre secteur cette fois » garde son jour ; dans le nouveau secteur, elle redevient habituelle", async () => {
    const client = await creerClient(base.client, samediAprem);
    const id = await commande(client, jourDe(5));
    await commeAdmin((c) => c.query("update public.commandes set secteur_id = $1 where id = $2", [vendredi, id]));
    expect(await date(id)).toEqual({ date: jourDe(4), secteur_id: vendredi });
    await changerSecteur(client, dimancheMatin);
    expect(await date(id)).toEqual({ date: jourDe(4), secteur_id: vendredi });
    await changerSecteur(client, vendredi);
    expect(await date(id)).toEqual({ date: jourDe(4), secteur_id: null });
  });

  it("les commandes livrées ou passées ne bougent pas", async () => {
    const client = await creerClient(base.client, samediAprem);
    const passee = await commande(client, "2026-01-03");
    await changerSecteur(client, dimancheMatin);
    expect((await date(passee)).date).toBe("2026-01-03");
  });
});
