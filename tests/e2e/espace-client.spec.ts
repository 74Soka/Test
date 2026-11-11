import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Espace client : création de compte, confirmation de l'e-mail, rattachement
 * à la fiche, commande en ligne, inscription validée par l'équipe, cadeaux de
 * parrainage, alertes e-mail, suppression du compte.
 * Le nouveau client s'inscrit à Bormes (aucune commune démo) et supprime son
 * compte à la fin : les autres parcours ne voient pas la différence.
 */
test.describe.configure({ mode: "serial" });

/** Capture d'écran facultative (variable CAPTURES = dossier), pour montrer le rendu. */
async function capture(cible: { screenshot: (o: { path: string }) => Promise<unknown> }, nom: string) {
  if (process.env.CAPTURES) await cible.screenshot({ path: `${process.env.CAPTURES}/${nom}.png` });
}

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
  await expect(page.getByRole("region", { name: "Ma fidélité" })).toContainText("graine");

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
  await expect(livraison).toContainText("Œufs (6)");
  await expect(livraison).toContainText("« Sonner deux fois »");

  // Emma reçoit la confirmation par e-mail ; l'équipe, plus d'e-mail de commande (la notification suffit)
  await expect
    .poll(async () => (await emails(request)).find((e) => /^Votre commande est (confirmée|modifiée)/.test(e.subject)))
    .toMatchObject({ to: [{ email: "emma.dubois@example.org" }] });
  // (Emma avait déjà une commande saisie par l'équipe dans la démo : « modifiée »)
  const confirmation = (await emails(request)).find((e) => /^Votre commande est (confirmée|modifiée)/.test(e.subject))!;
  expect(confirmation.textContent).toContain("Bonjour Emma,");
  expect(confirmation.textContent).toMatch(/\d × Panier 50 €/);
  expect(confirmation.textContent).toMatch(/Total à régler à la livraison : \d+\s€/);
  expect(confirmation.textContent).toContain("http://localhost:3100/espace");
  expect((await emails(request)).some((e) => e.to.some((t) => t.email === "equipe@exemple.fr") && /commande/i.test(e.subject))).toBe(false);

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
  await expect
    .poll(async () => (await emails(request)).find((e) => e.subject.startsWith("Votre commande est annulée")))
    .toMatchObject({ to: [{ email: "emma.dubois@example.org" }] });
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
  // Code de parrainage d'Emma Dubois (Emma, Dubois, …3344 : son nouveau téléphone, parcours précédent) :
  // d'abord l'ancien code, devenu invalide
  const code = page.getByLabel("Code de parrainage (facultatif)");
  await code.fill("EMDU 0003");
  await expect(page.getByText("Code invalide, veuillez réessayer.")).toBeVisible();
  await page.getByRole("button", { name: "Envoyer mon inscription" }).click();
  await expect(page.getByText("Vérifiez les champs signalés.")).toBeVisible();
  await expect(page).toHaveURL(/\/espace\/bienvenue/);
  await code.fill("emdu 3344");
  await expect(page.getByText("Code invalide, veuillez réessayer.")).toHaveCount(0);
  await expect(page.getByText("✓ Code valide")).toBeVisible();
  await page.getByLabel("Comment nous avez-vous connu ? (facultatif)").selectOption("Au marché");
  await capture(page.getByLabel("Code de parrainage (facultatif)").locator("xpath=ancestor::section[1]"), "1-inscription-code-parrainage");
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
  // Le parrain est retrouvé grâce au code, et déjà choisi
  await expect(carte).toContainText("Code EMDU 3344");
  await expect(carte).toContainText("✓ Emma Dubois");
  await expect(carte).toContainText("Nous a connusAu marché");
  await capture(carte, "2-validation-inscription");
  await carte.getByLabel("Secteur").selectOption({ label: "Toulon Est – Hyères" });
  await carte.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Aucune inscription en attente.")).toBeVisible();
  await deconnexionEquipe(page);

  // Le client commande : ses œufs de filleul s'ajoutent tout seuls
  await connexion(page, noe.email, noe.motDePasse);
  await page.waitForURL("**/espace");
  await expect(page.getByRole("heading", { name: "Bonjour Noé" })).toBeVisible();
  await page.getByRole("link", { name: "Commander" }).first().click();
  await page.waitForURL("**/espace/commander");
  await expect(page.getByText("Choisissez au moins un panier, ou 30 € de suppléments.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Valider ma commande" })).toBeDisabled();
  await page.getByRole("button", { name: "Ajouter un Panier 30 €" }).click();
  await page.getByRole("button", { name: "Valider ma commande" }).click();
  await page.waitForURL("**/espace?commande=ok");
  const livraison = page.getByRole("region", { name: "Prochaine livraison" });
  await expect(livraison).toContainText("Panier 30 €");
  await expect(livraison).toContainText("🎁 1 × Œufs (6)");
  await expect
    .poll(async () =>
      (await emails(request)).some(
        (e) => e.subject.startsWith("Votre commande est confirmée") && e.to.some((t) => t.email === noe.email),
      ),
    )
    .toBe(true);

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
  await expect(page.getByLabel("Heure")).toBeEditable();
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
  await expect(page.getByLabel("Message aux clients (facultatif)")).toHaveValue("Pas de livraison le 26 décembre");
  await page.getByLabel("Message aux clients (facultatif)").clear();
  await expect(page.getByLabel("Message aux clients (facultatif)")).toHaveValue("");
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
  await page.getByLabel("Panier 30 €").clear();
  await page.getByLabel("Panier 30 €").fill(PANIER_30);
  await expect(page.getByLabel("Panier 30 €")).toHaveValue(PANIER_30);
  await page.getByLabel("Panier 50 €").clear();
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

  // Historique (administrateur) : la semaine, numérotée, avec ses paniers et sa recette
  await page.goto("/reglages");
  await page.getByRole("link", { name: /Historique des paniers/ }).click();
  await expect(page.getByText(/^Semaine \d{1,2} · \d{4}$/).first()).toBeVisible();
  await expect(page.getByText(RECETTE.titre).first()).toBeVisible();
  await expect(page.locator("li:visible", { hasText: "500 g clémentines" }).first()).toBeVisible();
  await page.addStyleTag({ content: "header { position: static !important; } nav { display: none !important; }" });
  await capture(page.locator("main"), "12-historique-paniers");

  // Un visiteur sans compte (lien du SMS)
  const visiteur = await (await browser.newContext({ ...test.info().project.use })).newPage();
  await visiteur.goto("/paniers");
  const recette = visiteur.getByRole("region", { name: "Recette de la semaine" });
  await expect(recette.getByRole("heading", { name: RECETTE.titre })).toBeVisible();
  await expect(recette.getByText("35 min", { exact: true })).toBeVisible();
  await expect(recette.getByText("Dans le panier")).toHaveCount(5);
  await expect(recette.getByText("En supplément")).toHaveCount(1);
  await expect(recette.getByText(/^Creusez 4 petits nids/)).toBeVisible();
  // Ordre : paniers, puis suppléments, puis recette
  const hauteur = async (l: ReturnType<typeof visiteur.getByRole>) => (await l.boundingBox())!.y;
  const yPanier = await hauteur(visiteur.getByRole("article").last());
  const ySupplements = await hauteur(visiteur.getByRole("region", { name: "En supplément" }));
  expect(yPanier).toBeLessThan(ySupplements);
  expect(ySupplements).toBeLessThan(await hauteur(recette));
  if (process.env.CAPTURES) await visiteur.screenshot({ path: `${process.env.CAPTURES}/13-page-paniers-ordre.png`, fullPage: true });
  await expect(visiteur.getByText("500 g clémentines", { exact: true })).toBeVisible();
  if (process.env.CAPTURE_RECETTE) await recette.screenshot({ path: process.env.CAPTURE_RECETTE });
  await capture(visiteur.getByRole("article").first().locator("xpath=.."), "3-page-paniers-panier");
  await capture(recette, "4-page-paniers-recette");
  if (process.env.CAPTURE_PANIERS) await visiteur.screenshot({ path: process.env.CAPTURE_PANIERS, fullPage: true });
  await visiteur.context().close();

  // Téléphone réglé en mode sombre : tout le site passe en sombre
  const nuit = await (await browser.newContext({ ...test.info().project.use, colorScheme: "dark" })).newPage();
  const fond = () => nuit.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await nuit.goto("/paniers");
  await expect(nuit.getByRole("region", { name: "Recette de la semaine" })).toBeVisible();
  expect(await fond()).toBe("rgb(21, 16, 29)");
  if (process.env.CAPTURES) await nuit.screenshot({ path: `${process.env.CAPTURES}/14-page-paniers-sombre.png`, fullPage: true });
  await nuit.goto("/connexion");
  expect(await fond()).toBe("rgb(21, 16, 29)");
  await nuit.context().close();

  // La même recette, sous les paniers, dans l'espace d'un client
  await page.goto("/reglages");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL("**/connexion");
  await connexion(page, "emma.dubois@example.org", "panier-emma-2026");
  await page.waitForURL("**/espace");
  await expect(page.getByRole("region", { name: "Recette de la semaine" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Dans les paniers" })).toContainText("500 g clémentines");
  // En-tête fixe retiré pour la capture (il recouvrirait le haut de la recette)
  await page.addStyleTag({ content: "header { position: static !important; } nav { display: none !important; }" });
  await capture(page.getByRole("region", { name: "Dans les paniers" }), "5a-espace-client-paniers");
  await capture(page.getByRole("region", { name: "Recette de la semaine" }), "5b-espace-client-recette");
});
