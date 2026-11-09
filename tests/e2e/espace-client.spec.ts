import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Espace client : création de compte, confirmation de l'e-mail, rattachement
 * à la fiche, commande en ligne, inscription validée par l'équipe, cadeaux de
 * parrainage, alertes e-mail, suppression du compte.
 * Le nouveau client s'inscrit à Bormes (aucune commune démo) et supprime son
 * compte à la fin : les autres parcours ne voient pas la différence.
 */
test.describe.configure({ mode: "serial" });

const FAUX = "http://127.0.0.1:54399";
const ADMIN = { email: "admin@demo.fr", motDePasse: "demo-demo-demo" };

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  page.on("dialog", (d) => d.accept());
});

async function connexion(page: Page, email: string, motDePasse: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function deconnexionEquipe(page: Page) {
  await page.goto("/reglages");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL("**/connexion");
}

async function deconnexionClient(page: Page) {
  await page.goto("/espace/compte");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL("**/connexion");
}

async function creerCompte(
  page: Page,
  request: APIRequestContext,
  c: { prenom: string; nom: string; email: string; motDePasse: string },
) {
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill(c.prenom);
  await page.getByLabel("Nom", { exact: true }).fill(c.nom);
  await page.getByLabel("Adresse e-mail").fill(c.email);
  await page.getByLabel("Mot de passe").fill(c.motDePasse);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Vérifiez vos e-mails")).toBeVisible();

  // Tant que l'adresse n'est pas confirmée, pas de connexion
  await connexion(page, c.email, c.motDePasse);
  await expect(page.getByText(/Confirmez d'abord votre adresse/)).toBeVisible();
  expect((await request.post(`${FAUX}/test/confirmer`, { data: { email: c.email } })).ok()).toBe(true);
}

type EmailEnvoye = { subject: string; textContent: string; to: { email: string }[] };
async function emails(request: APIRequestContext): Promise<EmailEnvoye[]> {
  return (await request.get(`${FAUX}/test/emails`)).json();
}

test("un client déjà connu crée son compte, le retrouve relié à sa fiche et commande en ligne", async ({ page, request }) => {
  const emma = { prenom: "Emma", nom: "Dubois", email: "emma.dubois@example.org", motDePasse: "panier-emma-2026" };
  await creerCompte(page, request, emma);
  await connexion(page, emma.email, emma.motDePasse);
  await page.waitForURL("**/espace");

  await expect(page.getByRole("heading", { name: "Bonjour Emma" })).toBeVisible();
  const livraison = page.getByRole("region", { name: "Prochaine livraison" });
  await expect(livraison).toContainText(/Commandes et modifications jusqu'au vendredi .+ à 12 h/);
  await expect(page.getByRole("region", { name: "Dans les paniers" })).toContainText("pommes de terre");
  await expect(page.getByRole("region", { name: "Ma fidélité" })).toContainText("tampon");

  // Commande (ou modification si la démo lui en a déjà une)
  await page.getByRole("link", { name: /^(Commander|Modifier ma commande)$/ }).first().click();
  await page.waitForURL("**/espace/commander");
  await page.getByRole("button", { name: "Ajouter un Panier 50 €" }).click();
  await page.getByRole("button", { name: "Ajouter un Œufs BIO (6)" }).click();
  await page.getByLabel("Un message pour nous ? (facultatif)").fill("Sonner deux fois");
  await page.getByRole("button", { name: /^(Valider ma commande|Enregistrer les modifications)$/ }).click();
  await page.waitForURL("**/espace?commande=ok");
  await expect(page.getByText("✅ Commande enregistrée. Merci !")).toBeVisible();
  await expect(livraison).toContainText("Panier 50 €");
  await expect(livraison).toContainText("Œufs BIO (6)");
  await expect(livraison).toContainText("« Sonner deux fois »");

  // L'équipe est prévenue par e-mail, avec le lien vers la commande
  await expect
    .poll(async () => (await emails(request)).find((e) => e.subject.includes("Emma Dubois")))
    .toMatchObject({ to: [{ email: "equipe@exemple.fr" }] });
  const alerte = (await emails(request)).find((e) => e.subject.includes("Emma Dubois"))!;
  expect(alerte.textContent).toMatch(/Voir la commande : http:\/\/localhost:3100\/commandes\/[0-9a-f-]{36}/);

  // Fidélité, historique, coordonnées
  await page.getByRole("link", { name: "Fidélité" }).click();
  await expect(page.getByRole("heading", { name: "Ma fidélité" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Récompenses" })).toContainText("Supplément offert");
  await page.getByRole("link", { name: "Commandes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mes commandes" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Commande du / }).first()).toContainText("Panier 50 €");
  await page.getByRole("link", { name: "Compte" }).click();
  await page.getByLabel("Téléphone").fill("06 11 22 33 44");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("✓ Enregistré")).toBeVisible();

  // Annulation jusqu'à la clôture
  // (le bouton des outils de Next, en développement seulement, recouvre l'onglet Accueil)
  await page.goto("/espace");
  await page.getByRole("button", { name: "Annuler ma commande" }).click();
  await expect(page.getByRole("link", { name: "Commander" }).first()).toBeVisible();
  await expect.poll(async () => (await emails(request)).some((e) => e.subject.startsWith("Commande annulée : Emma Dubois"))).toBe(true);
  await deconnexionClient(page);
});

test("un nouveau client s'inscrit, l'équipe valide, il commande (œufs de filleul offerts) puis supprime son compte", async ({
  page,
  request,
}) => {
  const noe = { prenom: "Noé", nom: "Nouveau", email: "noe.nouveau@exemple.fr", motDePasse: "legumes-frais-83" };
  await creerCompte(page, request, noe);
  await connexion(page, noe.email, noe.motDePasse);
  await page.waitForURL("**/espace/bienvenue");

  await expect(page.getByLabel("Prénom")).toHaveValue("Noé");
  await page.getByLabel("Téléphone").fill("06 12 34 56 78");
  await page.getByLabel("Votre adresse").fill("chemin oliviers bormes");
  await page.getByRole("button", { name: /3 Chemin des Oliviers/ }).click();
  await page.getByLabel("Qui vous a parlé de nous ? (facultatif)").fill("Emma Dubois");
  await page.getByRole("button", { name: "Envoyer mon inscription" }).click();
  await page.waitForURL("**/espace");
  await expect(page.getByText("Inscription reçue, merci !")).toBeVisible();
  await expect(page.getByRole("region", { name: "Dans les paniers" })).toBeVisible();
  await expect
    .poll(async () => (await emails(request)).some((e) => e.subject === "Nouvelle inscription à valider : Noé Nouveau"))
    .toBe(true);

  // Pas de commande avant la validation
  await page.goto("/espace/commander");
  await page.waitForURL("**/espace");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL("**/connexion");

  // L'équipe valide l'inscription et rattache le parrain
  await connexion(page, ADMIN.email, ADMIN.motDePasse);
  await page.waitForURL("**/livraisons**");
  await page.goto("/espace");
  await page.waitForURL("**/livraisons**");
  await page.goto("/clients");
  await page.getByRole("link", { name: /1 inscription en ligne à valider/ }).click();
  const carte = page.getByRole("region", { name: "Inscription de Noé Nouveau" });
  await expect(carte).toContainText("« Emma Dubois »");
  await carte.getByLabel("Secteur").selectOption({ label: "Toulon Est – Hyères" });
  await carte.getByLabel("Parrain (facultatif)").fill("emma");
  await carte.getByRole("button", { name: /Emma Dubois/ }).click();
  await carte.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Aucune inscription en attente.")).toBeVisible();
  await deconnexionEquipe(page);

  // Le client commande : ses œufs de filleul s'ajoutent tout seuls
  await connexion(page, noe.email, noe.motDePasse);
  await page.waitForURL("**/espace");
  await expect(page.getByRole("heading", { name: "Bonjour Noé" })).toBeVisible();
  await page.getByRole("link", { name: "Commander" }).first().click();
  await page.waitForURL("**/espace/commander");
  await expect(page.getByText("Choisissez au moins un panier.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Valider ma commande" })).toBeDisabled();
  await page.getByRole("button", { name: "Ajouter un Panier 30 €" }).click();
  await page.getByRole("button", { name: "Valider ma commande" }).click();
  await page.waitForURL("**/espace?commande=ok");
  const livraison = page.getByRole("region", { name: "Prochaine livraison" });
  await expect(livraison).toContainText("Panier 30 €");
  await expect(livraison).toContainText("🎁 1 × Œufs BIO (6)");
  await expect.poll(async () => (await emails(request)).some((e) => e.subject.startsWith("Nouvelle commande : Noé Nouveau"))).toBe(true);

  // RGPD : il supprime son compte et ses données
  await page.getByRole("link", { name: "Compte" }).click();
  await page.getByRole("link", { name: "Supprimer mon compte et mes données" }).click();
  await page.getByLabel("Je comprends que c'est définitif.").check();
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await page.waitForURL("**/connexion?message=supprime");
  await expect(page.getByText("Votre compte et vos données ont été supprimés.")).toBeVisible();

  await connexion(page, ADMIN.email, ADMIN.motDePasse);
  await page.waitForURL("**/livraisons**");
  await page.goto("/clients");
  await page.getByLabel("Rechercher un client").fill("nouveau");
  await expect(page.getByText(/^0 client/)).toBeVisible();
  await deconnexionEquipe(page);
});

test("l'équipe publie la composition et un message, que les clients voient", async ({ page }) => {
  await connexion(page, ADMIN.email, ADMIN.motDePasse);
  await page.waitForURL("**/livraisons**");

  await page.goto("/reglages");
  await page.getByRole("link", { name: /Composition des paniers/ }).click();
  await page.getByLabel("Panier 30 €").fill("Potimarron\nBlettes\nPommes");
  await page.getByRole("button", { name: "Enregistrer la composition" }).click();
  await expect(page.getByText("✓ Composition enregistrée")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Panier 30 €")).toHaveValue("Potimarron\nBlettes\nPommes");

  await page.goto("/reglages/commandes-en-ligne");
  await expect(page.getByLabel("Jour")).toHaveValue("5");
  await expect(page.getByLabel("Heure")).toHaveValue("12:00");
  await page.getByLabel("Message aux clients (facultatif)").fill("Pas de livraison le 26 décembre");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("✓ Enregistré")).toBeVisible();
  await deconnexionEquipe(page);

  await connexion(page, "emma.dubois@example.org", "panier-emma-2026");
  await page.waitForURL("**/espace");
  await expect(page.getByText("Pas de livraison le 26 décembre")).toBeVisible();
  await deconnexionClient(page);

  await connexion(page, ADMIN.email, ADMIN.motDePasse);
  await page.waitForURL("**/livraisons**");
  await page.goto("/reglages/commandes-en-ligne");
  await page.getByLabel("Message aux clients (facultatif)").fill("");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("✓ Enregistré")).toBeVisible();
});

test("page publique des paniers, sans compte : composition, suppléments, livraisons et numéro", async ({ page }) => {
  await page.goto("/paniers");
  await expect(page).toHaveURL(/\/paniers$/);
  await expect(page.getByRole("heading", { name: "Frais et Français", level: 1 })).toBeVisible();
  await expect(page.getByText("Potimarron", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "En supplément" })).toBeVisible();
  await expect(page.getByText("Œufs (6)")).toBeVisible();
  await expect(page.getByText("Samedi matin", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "📞 Appeler" })).toHaveAttribute("href", "tel:+33625502487");
  await expect(page.getByRole("link", { name: "💬 Envoyer un SMS" })).toHaveAttribute("href", "sms:+33625502487");
  await expect(page.getByText("Avant le vendredi 12 h pour la livraison du week-end.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mon espace client ›", exact: true })).toHaveAttribute("href", "/espace");
  if (process.env.CAPTURE_PANIERS) await page.screenshot({ path: process.env.CAPTURE_PANIERS, fullPage: true });
});

test("recette de la semaine : saisie avec le panier de la semaine dernière, puis affichée sur la page publique", async ({
  page,
  browser,
}) => {
  const { PANIER_30, PANIER_50, RECETTE } = await import("../fixtures/semaine-derniere");
  await connexion(page, ADMIN.email, ADMIN.motDePasse);
  await page.waitForURL("**/livraisons**");
  await page.goto("/reglages/composition");
  await page.getByLabel("Panier 30 €").fill(PANIER_30);
  await page.getByLabel("Panier 50 €").fill(PANIER_50);
  await page.getByRole("button", { name: "Enregistrer la composition" }).click();
  await expect(page.getByText("✓ Composition enregistrée")).toBeVisible();

  await page.getByLabel("Nom de la recette").fill(RECETTE.titre);
  await page.getByLabel("Infos (facultatif)").fill(RECETTE.infos);
  await page.getByLabel("Ingrédients").fill(RECETTE.ingredients);
  await page.getByLabel("Préparation").fill(RECETTE.etapes);
  await page.getByLabel("Astuce (facultatif)").fill(RECETTE.astuce);
  await page.getByRole("button", { name: "Enregistrer la recette" }).click();
  await expect(page.getByText("✓ Recette enregistrée")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nom de la recette")).toHaveValue(RECETTE.titre);

  // Un visiteur sans compte (lien du SMS)
  const visiteur = await (await browser.newContext({ ...test.info().project.use })).newPage();
  await visiteur.goto("/paniers");
  const recette = visiteur.getByRole("region", { name: "Recette de la semaine" });
  await expect(recette.getByRole("heading", { name: RECETTE.titre })).toBeVisible();
  await expect(recette.getByText("35 min", { exact: true })).toBeVisible();
  await expect(recette.getByText("Dans le panier")).toHaveCount(5);
  await expect(recette.getByText("En supplément")).toHaveCount(1);
  await expect(recette.getByText(/^Creusez 4 petits nids/)).toBeVisible();
  await expect(visiteur.getByText("500 g clémentines", { exact: true })).toBeVisible();
  if (process.env.CAPTURE_RECETTE) await recette.screenshot({ path: process.env.CAPTURE_RECETTE });
  if (process.env.CAPTURE_PANIERS) await visiteur.screenshot({ path: process.env.CAPTURE_PANIERS, fullPage: true });
  await visiteur.context().close();
});
