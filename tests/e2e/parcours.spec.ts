import { expect, test, type Page } from "@playwright/test";
import { aujourdhui, ajouterJours, formaterDate, prochaineDate } from "../../src/lib/domaine/dates";

/**
 * Parcours principaux de la Phase 1, dans l'ordre (les étapes s'appuient sur
 * les précédentes). Données : démo du Var, base neuve à chaque lancement.
 */
test.describe.configure({ mode: "serial" });

const MOT_DE_PASSE = "demo-demo-demo";

async function seConnecter(page: Page) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill("admin@demo.fr");
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/livraisons**");
}

async function ouvrirFiche(page: Page, recherche: string, nom: RegExp) {
  await page.goto("/clients");
  await page.getByLabel("Rechercher un client").fill(recherche);
  await page.getByRole("link", { name: nom }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
}

test.beforeEach(async ({ page }) => {
  // Les tuiles de carte ne sont pas nécessaires aux tests
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  page.on("dialog", (d) => d.accept());
});

test("une page protégée renvoie vers la connexion, qui refuse un mauvais mot de passe", async ({ page }) => {
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fclients/);
  await page.getByLabel("Adresse e-mail").fill("admin@demo.fr");
  await page.getByLabel("Mot de passe").fill("mauvais");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/clients$/);
});

test("recherche de clients sans accents et filtre par secteur", async ({ page }) => {
  await seConnecter(page);
  await page.goto("/clients");
  await page.getByLabel("Rechercher un client").fill("hyeres");
  await expect(page.getByText(/^2 clients/)).toBeVisible();
  await page.getByLabel("Rechercher un client").fill("");
  await page.getByRole("button", { name: "Centre Var" }).click();
  await expect(page.getByText(/^5 clients/)).toBeVisible();
});

test("création d'un client : adresse proposée, secteur déduit, parrain", async ({ page }) => {
  await seConnecter(page);
  await page.goto("/clients/nouveau");
  await page.getByLabel("Prénom").fill("Zoé");
  await page.getByLabel("Nom", { exact: true }).fill("Essai");
  await page.getByLabel("Téléphone").fill("06 98 76 54 32");
  await page.getByLabel("Rechercher l'adresse").fill("12 rue demo hyeres");
  await page.getByRole("button", { name: /12 Rue Démo/ }).click();
  await expect(page.getByText("Secteur proposé d'après la commune : Toulon Est – Hyères.")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Toulon Est/ })).toBeChecked();
  await page.getByLabel("Parrain (facultatif)").fill("louis");
  await page.getByRole("button", { name: /Louis Durand/ }).click();
  await page.getByRole("button", { name: "Créer le client" }).click();

  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Zoé Essai" })).toBeVisible();
  await expect(page.getByText("06 98 76 54 32")).toBeVisible();
  await expect(page.getByRole("link", { name: "Louis Durand" })).toBeVisible();

  // Le parrain voit son nouveau filleul
  await page.getByRole("link", { name: "Louis Durand" }).click();
  await expect(page.getByRole("link", { name: "Zoé Essai" })).toBeVisible();
});

test("commande : au moins un panier, total, date choisie", async ({ page }) => {
  await seConnecter(page);
  await ouvrirFiche(page, "essai", /Zoé Essai/);
  await page.getByRole("link", { name: "Nouvelle commande" }).click();

  const samedi = prochaineDate(6, aujourdhui());
  await expect(page.getByText(formaterDate(samedi), { exact: true })).toBeVisible();

  const enregistrer = page.getByRole("button", { name: "Enregistrer la commande" });
  await page.getByRole("button", { name: "Ajouter un Œufs BIO (6)" }).click();
  await expect(page.getByText("Ajoutez au moins un panier.")).toBeVisible();
  await expect(enregistrer).toBeDisabled();

  await page.getByRole("button", { name: "Ajouter un Panier 30 €" }).click();
  await page.getByRole("button", { name: "Ajouter un Panier 30 €" }).click();
  await expect(page.getByText("63 €")).toBeVisible();

  // Commande pour la semaine suivante (la semaine en cours servira à « recommander »)
  await page.getByRole("button", { name: "Changer la date" }).click();
  await page.getByLabel("Date de livraison").fill(ajouterJours(samedi, 7));
  await enregistrer.click();
  await expect(page.getByText("Commande enregistrée.")).toBeVisible();
  await expect(page.getByText(formaterDate(ajouterJours(samedi, 7), { annee: true }))).toBeVisible();
});

test("recommander comme la dernière fois, puis doublon de semaine refusé", async ({ page }) => {
  await seConnecter(page);
  await ouvrirFiche(page, "essai", /Zoé Essai/);
  await page.getByRole("link", { name: "Recommander comme la dernière fois" }).click();
  await expect(page.getByRole("group", { name: "Panier 30 €" }).locator("output")).toHaveText("2");
  await expect(page.getByRole("group", { name: "Œufs BIO (6)" }).locator("output")).toHaveText("1");
  await page.getByRole("button", { name: "Enregistrer la commande" }).click();
  await expect(page.getByText("Commande enregistrée.")).toBeVisible();

  // Une deuxième commande la même semaine est refusée, avec un lien vers l'existante
  await page.goto("/commandes/nouvelle");
  await page.getByLabel("Client").fill("essai");
  await page.getByRole("button", { name: /Zoé Essai/ }).click();
  await page.getByRole("button", { name: "Ajouter un Panier 50 €" }).click();
  await page.getByRole("button", { name: "Enregistrer la commande" }).click();
  await expect(page.getByText(/déjà une commande cette semaine-là/)).toBeVisible();
  await page.getByRole("link", { name: /Ouvrir la commande existante/ }).click();
  await expect(page).toHaveURL(/\/commandes\/[0-9a-f-]{36}$/);
});

test("statut : livrée (horodatée), puis remise à livrer", async ({ page }) => {
  await seConnecter(page);
  await ouvrirFiche(page, "essai", /Zoé Essai/);
  await page.getByRole("link", { name: "Voir la commande" }).click();
  await page.getByRole("button", { name: "Marquer comme livrée" }).click();
  await expect(page.getByText(/^Livrée le .+ à \d{2}:\d{2}$/)).toBeVisible();
  await page.getByRole("button", { name: /Annuler la livraison/ }).click();
  await expect(page.getByRole("button", { name: "Marquer comme livrée" })).toBeVisible();
});

test("vue Livraisons : récapitulatif et regroupement par secteur", async ({ page }) => {
  await seConnecter(page);
  await page.goto("/livraisons");
  await expect(page.getByRole("heading", { name: "À préparer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /· Toulon Est – Hyères/ }).first()).toBeVisible();
  await page.getByRole("link", { name: "Jour" }).click();
  await expect(page).toHaveURL(/vue=jour/);
  await expect(page.getByRole("heading", { name: "À préparer" })).toBeVisible();
});

test("adresse introuvable : saisie manuelle et repère placé sur la carte", async ({ page }) => {
  await seConnecter(page);
  await page.goto("/clients/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill("Manuel");
  await page.getByLabel("Rechercher l'adresse").fill("lieu-dit panne");
  await expect(page.getByText(/ne répond pas/)).toBeVisible();
  await page.getByRole("button", { name: /Saisir l'adresse à la main/ }).click();
  await page.getByLabel("Adresse (numéro, rue, lieu-dit)").fill("Lieu-dit Les Pins");
  await page.getByLabel("Code postal").fill("83230");
  await page.getByLabel("Commune").fill("Bormes-les-Mimosas");
  await page.getByRole("radio", { name: /Toulon Est/ }).check();
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByText(/Position manquante/)).toBeVisible();

  const carte = page.locator(".leaflet-container");
  await carte.scrollIntoViewIfNeeded();
  const boite = (await carte.boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await expect(page.getByText("Position placée à la main.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Créer le client" }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Lieu-dit Les Pins")).toBeVisible();
});

test("suppression RGPD d'un client et de ses commandes", async ({ page }) => {
  await seConnecter(page);
  await ouvrirFiche(page, "essai", /Zoé Essai/);
  await page.getByRole("link", { name: /Supprimer le client/ }).click();
  await expect(page.getByText("ses 2 commande(s) et leur contenu ;")).toBeVisible();
  const bouton = page.getByRole("button", { name: "Supprimer définitivement" });
  await expect(bouton).toBeDisabled();
  await page.getByLabel(/définitive/).check();
  await bouton.click();
  await expect(page).toHaveURL(/\/clients\?supprime=1/);
  await expect(page.getByText("Le client et ses données ont été supprimés.")).toBeVisible();
  await page.getByLabel("Rechercher un client").fill("essai");
  await expect(page.getByText("Aucun client ne correspond.")).toBeVisible();
});

test("catalogue : supplément hors saison retiré de la saisie, ajout d'un supplément", async ({ page }) => {
  await seConnecter(page);
  await page.goto("/reglages/catalogue");
  await page.getByRole("switch", { name: /Kakis BIO/ }).click();
  await expect(page.getByRole("switch", { name: "Kakis BIO (1 barquette) : hors saison" })).toBeVisible();
  await page.goto("/commandes/nouvelle");
  await expect(page.getByText("Kakis BIO (1 barquette)")).toHaveCount(0);

  await page.goto("/reglages/catalogue");
  await page.getByRole("radio", { name: "Supplément" }).check();
  await page.getByLabel("Nom").fill("Miel de lavande (pot)");
  await page.getByLabel("Prix (€)").fill("5");
  await page.getByRole("button", { name: "Ajouter au catalogue" }).click();
  await expect(page.getByText("Article ajouté.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Miel de lavande/ })).toBeVisible();
});

test("déconnexion", async ({ page }) => {
  await seConnecter(page);
  await page.goto("/reglages");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion/);
});
