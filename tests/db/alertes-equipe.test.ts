import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBaseDeTest, creerCompte, creerCompteEnLigne, en, type BaseDeTest } from "./outils";
import { creerArticle, creerClient, creerSecteur, enregistrerCommande } from "./fabrique";

let base: BaseDeTest;
let admin: string;
let livreur: string;
let jeton: string;
let panier: string;
let secteur: string;

beforeAll(async () => {
  base = await creerBaseDeTest();
  admin = await creerCompte(base.client, "admin");
  livreur = await creerCompte(base.client, "livreur");
  secteur = await creerSecteur(base.client);
  panier = await creerArticle(base.client, { categorie: "panier", prix: 3000 });
  jeton = (await base.client.query<{ jeton: string }>("select jeton from prive.parametres_robot")).rows[0].jeton;
  // Téléphones : un administrateur, un livreur
  for (const [id, n] of [
    [admin, "admin"],
    [livreur, "livreur"],
  ]) {
    await base.client.query(
      "insert into public.abonnements_push (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)",
      [id, `https://push.test/${n}`, "p".repeat(40), "a".repeat(16)],
    );
  }
});

afterAll(async () => {
  await base?.detruire();
});

const comme = <T>(userId: string, fn: Parameters<typeof en<T>>[2]) =>
  en(base.client, { role: "authenticated", userId }, fn);

async function clientEnLigneAvecCommande() {
  const client = await creerClient(base.client, secteur);
  const compte = await creerCompteEnLigne(base.client, `${client}@client.test`);
  await base.client.query("insert into public.comptes_clients (user_id, client_id) values ($1, $2)", [compte, client]);
  const commande = await comme(admin, (c) =>
    // Samedi lointain : pas d'alerte « ajout à la tournée » pour les livreurs
    enregistrerCommande(c, { clientId: client, date: "2030-11-16", lignes: [{ article_id: panier, quantite: 1 }] }),
  );
  return { client, compte, commande };
}

const aEnvoyer = () =>
  en(base.client, { role: "anon" }, async (c) => (await c.query("select * from public.alertes_a_envoyer($1)", [jeton])).rows);

describe("alertes aux administrateurs", () => {
  it("une commande en ligne prévient les téléphones des administrateurs, une seule fois", async () => {
    const { compte, commande } = await clientEnLigneAvecCommande();
    await comme(compte, (c) => c.query("select public.demander_alerte_equipe('commande', $1)", [commande]));
    // Double appui : pas de deuxième alerte
    await comme(compte, (c) => c.query("select public.demander_alerte_equipe('commande', $1)", [commande]));

    const lignes = await aEnvoyer();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      titre: "🧺 Nouvelle commande en ligne",
      url: `/commandes/${commande}`,
      endpoint: "https://push.test/admin",
    });
    expect(lignes[0].corps).toMatch(/samedi 16 novembre · 1 × Article/);
    expect(await aEnvoyer()).toHaveLength(0);
  });

  it("un client ne peut pas déclencher d'alerte pour la commande d'un autre", async () => {
    const autre = await clientEnLigneAvecCommande();
    const { compte } = await clientEnLigneAvecCommande();
    await comme(compte, (c) => c.query("select public.demander_alerte_equipe('annulation', $1)", [autre.commande]));
    expect(await aEnvoyer()).toHaveLength(0);
  });

  it("une inscription en attente prévient l'équipe ; seulement la sienne", async () => {
    const compte = await creerCompte(base.client, null);
    await base.client.query(
      `insert into public.inscriptions (user_id, email, prenom, nom, telephone, adresse, code_postal, commune)
       values ($1, 'zoe@test.local', 'Zoé', 'Essai', '+33612345678', '1 rue Test', '83000', 'Toulon')`,
      [compte],
    );
    const intrus = await creerCompte(base.client, null);
    await comme(intrus, (c) => c.query("select public.demander_alerte_equipe('inscription', $1)", [compte]));
    expect(await aEnvoyer()).toHaveLength(0);

    await comme(compte, (c) => c.query("select public.demander_alerte_equipe('inscription', $1)", [compte]));
    const lignes = await aEnvoyer();
    expect(lignes).toEqual([
      expect.objectContaining({
        titre: "🆕 Nouvelle inscription à valider",
        corps: "Zoé Essai (Toulon) attend votre validation.",
        url: "/clients/inscriptions",
      }),
    ]);
  });

  it("sans le jeton, ni lecture des alertes ni accès à la table", async () => {
    await expect(
      en(base.client, { role: "anon" }, (c) => c.query("select * from public.alertes_a_envoyer($1)", ["x".repeat(50)])),
    ).rejects.toThrow(/Accès refusé/);
    await expect(
      comme(admin, (c) => c.query("select * from prive.alertes_equipe")),
    ).rejects.toThrow(/permission/);
    await expect(
      en(base.client, { role: "anon" }, (c) => c.query("select public.demander_alerte_equipe('commande', gen_random_uuid())")),
    ).rejects.toThrow(/permission|Connexion/);
  });
});

describe("messages libres aux clients", () => {
  const ecrire = (userId: string) =>
    comme(userId, (c) =>
      c.query("insert into public.messages_clients (titre, corps) values ('Nouveau', 'Des fraises') returning envoye_par"),
    );

  it("seul un administrateur peut en envoyer et lire l'historique", async () => {
    const { rows } = await ecrire(admin);
    expect(rows[0].envoye_par).toBe(admin);
    await expect(ecrire(livreur)).rejects.toThrow(/row-level security/);
    const { compte } = await clientEnLigneAvecCommande();
    await expect(ecrire(compte)).rejects.toThrow(/row-level security/);
    const lus = await comme(compte, async (c) => (await c.query("select * from public.messages_clients")).rows);
    expect(lus).toHaveLength(0);
  });

  it("refuse un lien vers une autre page que celles prévues", async () => {
    await expect(
      comme(admin, (c) =>
        c.query("insert into public.messages_clients (titre, corps, lien) values ('x', 'y', 'https://pirate.example')"),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("alerte aux livreurs : client ajouté à la tournée après le vendredi 20 h", () => {
  it("vendredi 20 h, heure de Paris : avant non, après oui ; pas pour une livraison passée", async () => {
    const { rows } = await base.client.query(`
      select prive.tournee_apres_vendredi_soir('2026-11-14', '2026-11-13 19:59 Europe/Paris') as avant,
             prive.tournee_apres_vendredi_soir('2026-11-14', '2026-11-13 20:00 Europe/Paris') as vendredi_soir,
             prive.tournee_apres_vendredi_soir('2026-11-15', '2026-11-15 11:00 Europe/Paris') as dimanche_matin,
             prive.tournee_apres_vendredi_soir('2026-11-14', '2026-11-15 11:00 Europe/Paris') as passee,
             prive.tournee_apres_vendredi_soir('2026-11-21', '2026-11-15 11:00 Europe/Paris') as semaine_suivante`);
    expect(rows[0]).toEqual({ avant: false, vendredi_soir: true, dimanche_matin: true, passee: false, semaine_suivante: false });
  });

  it("nouvelle commande ce week-end après vendredi 20 h : seuls les livreurs sont prévenus, avec le secteur et le contenu", async () => {
    await aEnvoyer(); // on vide les alertes précédentes
    const { rows } = await base.client.query(`
      select to_char(d, 'YYYY-MM-DD') as d, prive.tournee_apres_vendredi_soir(d) as ok
      from (select (now() at time zone 'Europe/Paris')::date as d) x`);
    const { d: aujourdhui, ok } = rows[0];
    const client = await creerClient(base.client, secteur);
    const commande = await comme(admin, (c) =>
      enregistrerCommande(c, { clientId: client, date: aujourdhui, lignes: [{ article_id: panier, quantite: 2 }] }),
    );
    const lignes = await aEnvoyer();
    if (ok) {
      // Après le vendredi 20 h (week-end) : alerte au téléphone du livreur seulement
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toMatchObject({ titre: "➕ Client ajouté à la tournée", endpoint: "https://push.test/livreur" });
      expect(lignes[0].corps).toMatch(/2 × Article/);
      expect(lignes[0].url).toMatch(/^\/tournee\?du=\d{4}-\d{2}-\d{2}&secteur=/);
      // La livraison annulée puis remise par le livreur n'est pas un « ajout »
      await comme(livreur, (c) => c.query("select public.marquer_livraison($1, true)", [commande]));
      await comme(livreur, (c) => c.query("select public.marquer_livraison($1, false)", [commande]));
      expect(await aEnvoyer()).toHaveLength(0);
    } else {
      // En semaine avant le vendredi 20 h : rien
      expect(lignes).toHaveLength(0);
    }
  });

  it("commande d'une semaine à venir : pas d'alerte", async () => {
    await aEnvoyer();
    const client = await creerClient(base.client, secteur);
    const { rows } = await base.client.query(
      "select to_char((now() at time zone 'Europe/Paris')::date + 14, 'YYYY-MM-DD') as d",
    );
    await comme(admin, (c) =>
      enregistrerCommande(c, { clientId: client, date: rows[0].d, lignes: [{ article_id: panier, quantite: 1 }] }),
    );
    expect(await aEnvoyer()).toHaveLength(0);
  });
});
