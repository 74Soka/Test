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

  // Première commande d'un filleul : œufs de bienvenue ajoutés d'office
  await expect(page.getByText("🎁 Œufs offerts au filleul")).toBeVisible();

  const enregistrer = page.getByRole("button", { name: "Enregistrer la commande" });
  await page.getByRole("button", { name: "Ajouter un Œufs BIO (6)", exact: true }).click();
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

test("fidélité : ajustement manuel, puis récompense utilisée sur une commande", async ({ page }) => {
  await seConnecter(page);
  await ouvrirFiche(page, "essai", /Zoé Essai/);
  await expect(page.getByRole("heading", { name: "Carte de fidélité" })).toBeVisible();
  await expect(page.getByText("Encore 4 tampons pour « Supplément offert ».")).toBeVisible();

  // Ajustement manuel : +9 tampons
  await page.getByRole("button", { name: /Ajouter ou retirer des tampons/ }).click();
  await page.getByLabel("Tampons (négatif pour en retirer)").fill("9");
  await page.getByLabel("Raison").fill("Test de bout en bout");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("🎁 Récompense disponible")).toBeVisible();
  await expect(page.getByText("Confiture + supplément offerts (10 tampons)")).toBeVisible();

  // Utilisation sur la commande de la semaine
  await page.getByRole("link", { name: "Voir la commande" }).click();
  await page.getByRole("button", { name: "Utiliser : Confiture + supplément offerts" }).click();
  await page.getByRole("button", { name: "Ajouter un Confiture artisanale – figue offert" }).click();
  await page.getByRole("button", { name: "Ajouter un Haricots verts BIO (500 g) offert" }).click();
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Solde : 0 tampon après les récompenses ci-dessous")).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page.getByText("Commande enregistrée.")).toBeVisible();
  await expect(page.getByText("🎁 Confiture + supplément offerts")).toBeVisible();

  // Le solde du client est à 0, le cadeau apparaît dans le récapitulatif à préparer
  await ouvrirFiche(page, "essai", /Zoé Essai/);
  await expect(page.getByText("Encore 5 tampons pour « Supplément offert ».")).toBeVisible();
  // La commande est celle de samedi prochain (la semaine suivante si l'on est dimanche)
  await page.goto(`/livraisons?du=${prochaineDate(6, aujourdhui())}`);
  await expect(page.getByText(/dont 1 offert/).first()).toBeVisible();
  await expect(page.getByText(/🎁 Offert : .*Confiture artisanale – figue/)).toBeVisible();
});

test("parrainage : la confiture due au parrain s'offre depuis sa commande", async ({ page }) => {
  await seConnecter(page);
  // Zoé (filleule de Louis Durand) a commandé : une confiture est due à Louis
  await ouvrirFiche(page, "louis durand", /Louis Durand/);
  await expect(page.getByText(/son filleul Zoé Essai a\s+commandé/)).toBeVisible();

  const voir = page.getByRole("link", { name: "Voir la commande" });
  if (await voir.isVisible()) await voir.click();
  else await page.getByRole("link", { name: "Nouvelle commande" }).click();
  await page.waitForURL(/\/commandes\//);
  await expect(page.getByRole("button", { name: "Ajouter un Panier 30 €" })).toBeVisible();

  await expect(page.getByText(/confitures? de parrainage à offrir/)).toBeVisible();
  await page.getByRole("button", { name: "Offrir", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un Confiture artisanale – fraise offert" }).click();
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Cadeau de parrainage")).toBeVisible();
  const bouton = page.getByRole("button", { name: /Enregistrer (la commande|les modifications)/ });
  if ((await page.getByRole("group", { name: "Panier 30 €" }).locator("output").textContent()) === "0") {
    await page.getByRole("button", { name: "Ajouter un Panier 30 €" }).click();
  }
  await bouton.click();
  await expect(page.getByText("Commande enregistrée.")).toBeVisible();
  await expect(page.getByText("🎁 Confiture offerte au parrain")).toBeVisible();
});

test("réglages de fidélité : règles et récompenses", async ({ page }) => {
  await seConnecter(page);
  await page.goto("/reglages/fidelite");
  await expect(page.getByText("Panier 50 € livré : 2 tampons.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Panier 30 € offert/ })).toBeVisible();
  await page.getByLabel("Filleuls nécessaires pour être VIP").fill("4");
  await page.getByRole("button", { name: "Enregistrer les règles" }).click();
  await expect(page.getByText("Règles enregistrées.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/VIP à 4 filleuls livrés/)).toBeVisible();
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

test("tournée : carte et temps par les routes, ordre optimisé, réorganisation, bouton Livré", async ({ page }) => {
  await seConnecter(page);
  await page.goto("/tournee");
  await expect(page.getByRole("heading", { name: "Tournée" })).toBeVisible();
  const arrets = page.getByRole("region", { name: /^Arrêt \d+ :/ });
  await expect(arrets.first()).toBeVisible();
  const total = await arrets.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByText(/Prochain arrêt/)).toBeVisible();

  // Itinéraire en voiture (faux OpenRouteService) : tracé, total, temps entre arrêts
  await expect(page.getByText(/\d+ km · .+ de route$/)).toBeVisible();
  await expect(page.locator("path.trace-routier")).toHaveCount(1);
  await expect(arrets.first().getByText(/🚗 .+ depuis le départ/)).toBeVisible();
  await expect(arrets.nth(1).getByText(/🚗 .+ depuis l'arrêt précédent/)).toBeVisible();
  await expect(page.getByText(/Retour au départ : /)).toBeVisible();

  // Optimisation par les routes
  await page.getByRole("button", { name: "Optimiser l'ordre" }).click();
  await expect(page.getByText(/Meilleur ordre possible par les routes : \d+ km, .+ de route\./)).toBeVisible();

  // Réorganisation : le 2e arrêt passe en tête, et l'ordre est enregistré
  const deuxieme = (await arrets.nth(1).getAttribute("aria-label"))!.replace(/^Arrêt 2 : /, "");
  await page.getByRole("button", { name: "Réorganiser" }).click();
  await page.getByRole("button", { name: `Monter ${deuxieme}` }).click();
  await expect(page.locator("path.trace-routier")).toHaveCount(0);
  await page.getByRole("button", { name: "Enregistrer l'ordre" }).click();
  await expect(page.getByText("Ordre enregistré.")).toBeVisible();
  // Nouvel ordre : nouvel itinéraire
  await expect(page.locator("path.trace-routier")).toHaveCount(1);
  await expect(arrets.first().getByText(/depuis le départ/)).toBeVisible();
  await page.reload();
  await expect(arrets.first()).toHaveAttribute("aria-label", `Arrêt 1 : ${deuxieme}`);

  // Livré : bouton, départ immédiat vers le suivant avec Waze, puis annulation
  const premier = arrets.first();
  const suivant = (await arrets.nth(1).getAttribute("aria-label"))!.replace(/^Arrêt 2 : /, "");
  await premier.getByRole("button", { name: "Livré", exact: true }).click();
  await expect(premier.getByRole("button", { name: /✓ Livré à \d{2}:\d{2} · annuler/ })).toBeVisible();
  const ensuite = premier.getByRole("group", { name: "Arrêt suivant" });
  await expect(ensuite.getByText(`2. ${suivant}`)).toBeVisible();
  await expect(ensuite.getByRole("link", { name: "Y aller avec Waze" })).toHaveAttribute(
    "href",
    /^https:\/\/waze\.com\/ul\?ll=[\d.]+,[\d.]+&navigate=yes$/,
  );
  await expect(page.getByText(`1 / ${total} livré`)).toBeVisible();
  await page.reload();
  await expect(arrets.first().getByRole("button", { name: /✓ Livré/ })).toBeVisible();
  await arrets.first().getByRole("button", { name: /✓ Livré/ }).click();
  await expect(arrets.first().getByRole("button", { name: "Livré", exact: true })).toBeVisible();
});

test("tournée hors connexion : l'appui « Livré » attend le réseau puis part tout seul", async ({ page, context }) => {
  await seConnecter(page);
  await page.goto("/tournee");
  const arrets = page.getByRole("region", { name: /^Arrêt \d+ :/ });
  const dernier = arrets.last();
  await expect(dernier).toBeVisible();

  await context.setOffline(true);
  await dernier.getByRole("button", { name: "Livré", exact: true }).click();
  await expect(dernier.getByRole("button", { name: /✓ Livré/ })).toBeVisible();
  await expect(page.getByText(/1 livraison en attente d'envoi/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/en attente d'envoi/)).toHaveCount(0, { timeout: 40_000 });
  await page.reload();
  await expect(arrets.last().getByRole("button", { name: /✓ Livré/ })).toBeVisible();
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
