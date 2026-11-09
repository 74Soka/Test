import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Notifications de livraison : le client active les notifications, l'équipe
 * envoie un test, démarre la tournée (« votre livraison est en route »), puis
 * le « Livré » du client précédent prévient le client (« vous êtes le prochain »).
 *
 * Le téléphone est simulé : son abonnement pointe vers le faux service de push
 * du faux Supabase, qui garde les notifications reçues (chiffrées, signées).
 */
test.describe.configure({ mode: "serial" });

const FAUX = "http://127.0.0.1:54399";
const LEA = { email: "lea.robert@example.org", motDePasse: "paniers-lea-2026" };

test.beforeEach(async ({ page, context }) => {
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  page.on("dialog", (d) => d.accept());
  await context.grantPermissions(["notifications"]);
});

/** Téléphone simulé : son service de push est le faux serveur (/push/<nom>). */
async function simulerTelephone(page: Page, nom: string) {
  await page.addInitScript((endpoint) => {
    const b64 = (octets: ArrayBuffer | Uint8Array) =>
      btoa(String.fromCharCode(...new Uint8Array(octets)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    // Le client touche « Autoriser » (le navigateur de test sans écran refuse d'office)
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
    let courant: unknown = null;
    PushManager.prototype.getSubscription = async () => courant as PushSubscription | null;
    PushManager.prototype.subscribe = async () => {
      const paire = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const p256dh = b64(await crypto.subtle.exportKey("raw", paire.publicKey));
      const auth = b64(crypto.getRandomValues(new Uint8Array(16)));
      courant = {
        endpoint,
        expirationTime: null,
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh, auth } }),
        unsubscribe: async () => {
          courant = null;
          return true;
        },
      };
      return courant as PushSubscription;
    };
  }, `${FAUX}/push/${nom}`);
}

async function connexion(page: Page, email: string, motDePasse: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function pushsRecus(
  request: APIRequestContext,
  nom = "lea",
): Promise<{ endpoint: string; ttl: string; urgence: string; octets: number }[]> {
  return ((await (await request.get(`${FAUX}/test/pushs`)).json()) as { endpoint: string; ttl: string; urgence: string; octets: number }[]).filter(
    (p) => p.endpoint === `/push/${nom}`,
  );
}

async function deconnexion(page: Page) {
  await page.goto("/");
  if (page.url().includes("/espace")) await page.goto("/espace/compte");
  else await page.goto("/reglages");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL("**/connexion");
}

test("le client active les notifications, puis est prévenu au départ de la tournée et quand il est le prochain", async ({
  page,
  request,
}) => {
  await simulerTelephone(page, "lea");
  // L'équipe passe une première fois : les clés de signature sont créées
  await connexion(page, "admin@demo.fr", "demo-demo-demo");
  await page.waitForURL("**/livraisons**");
  await page.goto("/tournee");
  await expect(page.getByRole("heading", { name: "Tournée" })).toBeVisible();
  await page.goto("/reglages");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL("**/connexion");

  // Léa, cliente de la démo, crée son compte et commande
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Léa");
  await page.getByLabel("Nom", { exact: true }).fill("Robert");
  await page.getByLabel("Adresse e-mail").fill(LEA.email);
  await page.getByLabel("Mot de passe").fill(LEA.motDePasse);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Vérifiez vos e-mails")).toBeVisible();
  await request.post(`${FAUX}/test/confirmer`, { data: { email: LEA.email } });
  await connexion(page, LEA.email, LEA.motDePasse);
  await page.waitForURL("**/espace");
  await page.getByRole("link", { name: /^(Commander|Modifier ma commande)$/ }).first().click();
  await page.waitForURL("**/espace/commander");
  await page.getByRole("button", { name: "Ajouter un Panier 30 €" }).click();
  await page.getByRole("button", { name: /^(Valider ma commande|Enregistrer les modifications)$/ }).click();
  await page.waitForURL("**/espace?commande=ok");

  // Elle active les notifications depuis l'accueil
  const carte = page.getByRole("region", { name: "Notifications de livraison" });
  await carte.getByRole("button", { name: "Activer les notifications" }).click();
  await expect(carte).toHaveCount(0);
  await page.getByRole("link", { name: "Compte" }).click();
  await expect(page.getByText("✓ Activées sur ce téléphone")).toBeVisible();
  expect(await pushsRecus(request)).toHaveLength(0);
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL("**/connexion");

  // L'équipe voit le téléphone abonné et envoie un test
  await connexion(page, "admin@demo.fr", "demo-demo-demo");
  await page.waitForURL("**/livraisons**");
  await page.goto("/clients");
  await page.getByLabel("Rechercher un client").fill("lea robert");
  await page.getByRole("link", { name: /Léa Robert/ }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Activées sur 1 téléphone")).toBeVisible();
  await page.getByRole("button", { name: "Envoyer une notification de test" }).click();
  await expect(page.getByText("Notification envoyée (1 téléphone).")).toBeVisible();
  await expect.poll(async () => (await pushsRecus(request)).length).toBe(1);
  const [test0] = await pushsRecus(request);
  expect(test0).toMatchObject({ ttl: "3600", urgence: "high" });
  expect(test0.octets).toBeGreaterThan(100);

  // Sa tournée : Léa passe en 2e position
  await page.getByRole("link", { name: "Voir la commande" }).click();
  await page.getByRole("link", { name: "Voir dans la tournée" }).click();
  await page.waitForURL(/\/tournee\?du=/);
  const arrets = page.getByRole("region", { name: /^Arrêt \d+ :/ });
  await expect(arrets.first()).toBeVisible();
  const noms = await arrets.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const rang = noms.findIndex((n) => n.endsWith("Léa Robert"));
  expect(rang).toBeGreaterThanOrEqual(0);
  if (rang !== 1) {
    await page.getByRole("button", { name: "Réorganiser" }).click();
    if (rang === 0) await page.getByRole("button", { name: "Descendre Léa Robert" }).click();
    for (let i = rang; i > 1; i--) await page.getByRole("button", { name: "Monter Léa Robert" }).click();
    await page.getByRole("button", { name: "Enregistrer l'ordre" }).click();
    await expect(page.getByText("Ordre enregistré.")).toBeVisible();
  }
  await expect(arrets.nth(1)).toHaveAttribute("aria-label", "Arrêt 2 : Léa Robert");

  // Départ : chaque client abonné reçoit son heure d'arrivée
  await page.getByRole("button", { name: "🚚 Démarrer la tournée" }).click();
  await expect(page.getByText(/Tournée démarrée à \d{2}:\d{2} · 1 client sur \d+ prévenu par notification/)).toBeVisible();
  await expect.poll(async () => (await pushsRecus(request)).length).toBe(2);

  // Le premier client est livré : Léa est prévenue qu'elle est la prochaine
  const premier = arrets.first();
  await premier.getByRole("button", { name: "Livré", exact: true }).click();
  await expect(premier.getByRole("button", { name: /✓ Livré/ })).toBeVisible();
  await expect.poll(async () => (await pushsRecus(request)).length).toBe(3);

  // Un second appui (annuler puis Livré) ne la prévient pas deux fois
  await premier.getByRole("button", { name: /✓ Livré/ }).click();
  await expect(premier.getByRole("button", { name: "Livré", exact: true })).toBeVisible();
  await premier.getByRole("button", { name: "Livré", exact: true }).click();
  await expect(premier.getByRole("button", { name: /✓ Livré/ })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await pushsRecus(request)).toHaveLength(3);

  // On remet la tournée comme avant pour les autres parcours
  await premier.getByRole("button", { name: /✓ Livré/ }).click();
  await expect(premier.getByRole("button", { name: "Livré", exact: true })).toBeVisible();
});

test("rappels du jeudi, annonce des paniers, merci après la livraison et avis du client", async ({ page, request }) => {
  await simulerTelephone(page, "chloe");
  const { jeton } = (await (await request.get(`${FAUX}/test/jeton-robot`)).json()) as { jeton: string };
  const rappeler = (j: string) =>
    request.post("/api/rappels", { headers: { "x-jeton": j }, data: { moment: "midi" } });

  // Clôture ce soir, pour que la prochaine livraison soit dans la fenêtre des rappels
  await connexion(page, "admin@demo.fr", "demo-demo-demo");
  await page.waitForURL("**/livraisons**");
  await page.goto("/reglages/commandes-en-ligne");
  const jourDeLaSemaine = await page.evaluate(() =>
    String(((new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })).getDay() + 6) % 7) + 1),
  );
  await page.getByLabel("Jour").selectOption(jourDeLaSemaine);
  await page.getByLabel("Heure").fill("23:59");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("✓ Enregistré")).toBeVisible();
  await deconnexion(page);

  // Chloé (cliente de la démo) crée son compte, active les notifications, et n'a pas commandé
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Chloé");
  await page.getByLabel("Nom", { exact: true }).fill("Petit");
  await page.getByLabel("Adresse e-mail").fill("chloe.petit@example.org");
  await page.getByLabel("Mot de passe").fill("paniers-chloe-2026");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Vérifiez vos e-mails")).toBeVisible();
  await request.post(`${FAUX}/test/confirmer`, { data: { email: "chloe.petit@example.org" } });
  await connexion(page, "chloe.petit@example.org", "paniers-chloe-2026");
  await page.waitForURL("**/espace");
  // Attendre la fin de l'écran de chargement avant de regarder la page
  await expect(page.getByText("Chargement…")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Compte" })).toBeVisible();
  if (await page.getByRole("button", { name: "Annuler ma commande" }).isVisible()) {
    await page.getByRole("button", { name: "Annuler ma commande" }).click();
    await expect(page.getByRole("link", { name: "Commander" }).first()).toBeVisible();
  }
  await page.getByRole("link", { name: "Compte" }).click();
  await page.getByRole("button", { name: "Activer les notifications" }).click();
  await expect(page.getByText("✓ Activées sur ce téléphone")).toBeVisible();

  // Rappel de midi : Chloé seulement (Léa a commandé), une seule fois ; jeton exigé
  expect((await rappeler("faux-".repeat(10))).status()).toBe(403);
  const r1 = await rappeler(jeton);
  expect(r1.ok()).toBe(true);
  expect(await r1.json()).toMatchObject({ moment: "midi" });
  await expect.poll(async () => (await pushsRecus(request, "chloe")).length).toBe(1);
  await rappeler(jeton);
  expect(await pushsRecus(request, "chloe")).toHaveLength(1);
  expect(await pushsRecus(request, "lea")).toHaveLength(3);
  await deconnexion(page);

  // Annonce de la composition de la semaine prochaine : tous les abonnés, une fois
  await connexion(page, "admin@demo.fr", "demo-demo-demo");
  await page.waitForURL("**/livraisons**");
  await page.goto("/reglages/composition");
  await page.getByRole("link", { name: "Semaine suivante ›" }).click();
  await page.getByLabel("Panier 30 €").fill("1 kg de potimarron\nBlettes\n4 pommes");
  await expect(page.getByLabel(/Prévenir les clients par notification/)).toBeChecked();
  await page.getByRole("button", { name: "Enregistrer la composition" }).click();
  await expect(page.getByText(/✓ Composition enregistrée · 2 téléphones prévenus/)).toBeVisible();
  await expect.poll(async () => (await pushsRecus(request, "chloe")).length).toBe(2);
  expect(await pushsRecus(request, "lea")).toHaveLength(4);
  await page.reload();
  await expect(page.getByText(/📣 Clients prévenus/)).toBeVisible();

  // Léa est livrée : elle reçoit le merci
  await page.goto("/clients");
  await page.getByLabel("Rechercher un client").fill("lea robert");
  await page.getByRole("link", { name: /Léa Robert/ }).click();
  await page.getByRole("link", { name: "Voir la commande" }).click();
  await page.getByRole("link", { name: "Voir dans la tournée" }).click();
  const lea = page.getByRole("region", { name: /^Arrêt \d+ : Léa Robert$/ });
  await lea.getByRole("button", { name: "Livré", exact: true }).click();
  await expect(lea.getByRole("button", { name: /✓ Livré/ })).toBeVisible();
  await expect.poll(async () => (await pushsRecus(request, "lea")).length).toBe(5);
  await deconnexion(page);

  // Elle donne son avis depuis son accueil
  await connexion(page, LEA.email, LEA.motDePasse);
  await page.waitForURL("**/espace");
  await page.getByRole("link", { name: /Comment était votre panier/ }).click();
  await page.getByRole("radio", { name: /^2 étoiles/ }).click();
  await page.getByLabel("Un commentaire ? (facultatif)").fill("Une salade un peu abîmée");
  await page.getByRole("button", { name: "Envoyer mon avis" }).click();
  await expect(page.getByText("Votre avis est transmis à l'équipe.")).toBeVisible();
  await expect
    .poll(async () =>
      ((await (await request.get(`${FAUX}/test/emails`)).json()) as { subject: string }[]).some(
        (e) => e.subject === "⚠️ Avis de Léa Robert (lea.robert@example.org) : ★★☆☆☆ (2/5)",
      ),
    )
    .toBe(true);
  await page.goto("/espace/commandes");
  await expect(page.getByText(/Votre avis : ★★☆☆☆/).first()).toBeVisible();
  await deconnexion(page);

  // L'équipe voit le retour et le traite ; on remet la tournée et la clôture comme avant
  await connexion(page, "admin@demo.fr", "demo-demo-demo");
  await page.waitForURL("**/livraisons**");
  await page.goto("/clients");
  await page.getByRole("link", { name: /Retours clients : 1 à traiter/ }).click();
  const retour = page.getByRole("region", { name: "Avis de Léa Robert" });
  await expect(retour).toContainText("« Une salade un peu abîmée »");
  await retour.getByRole("button", { name: "✓ Traité" }).click();
  await expect(retour.getByText("Traité", { exact: true })).toBeVisible();

  await retour.getByRole("link", { name: "La commande" }).click();
  await expect(page.getByText(/Avis du client : ★★☆☆☆ · traité/)).toBeVisible();
  await page.getByRole("link", { name: "Voir dans la tournée" }).click();
  await lea.getByRole("button", { name: /✓ Livré/ }).click();
  await expect(lea.getByRole("button", { name: "Livré", exact: true })).toBeVisible();
  await page.goto("/reglages/commandes-en-ligne");
  await page.getByLabel("Jour").selectOption("5");
  await page.getByLabel("Heure").fill("12:00");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("✓ Enregistré")).toBeVisible();
});

test("les administrateurs sont prévenus sur leur téléphone d'une commande en ligne", async ({ page, request }) => {
  await simulerTelephone(page, "admin");
  const { jeton } = (await (await request.get(`${FAUX}/test/jeton-robot`)).json()) as { jeton: string };
  const envoyer = (j: string) => request.post("/api/alertes", { headers: { "x-jeton": j } });

  // L'administrateur active les alertes sur son téléphone, dans Réglages
  await connexion(page, "admin@demo.fr", "demo-demo-demo");
  await page.waitForURL("**/livraisons**");
  await page.goto("/reglages");
  const alertes = page.getByRole("region", { name: "Alertes de l'équipe" });
  await alertes.getByRole("button", { name: "Activer les notifications" }).click();
  await expect(alertes.getByText("✓ Activées sur ce téléphone")).toBeVisible();
  await deconnexion(page);
  // Les alertes laissées par les parcours précédents partent d'abord
  await envoyer(jeton);
  const avant = (await pushsRecus(request, "admin")).length;

  // Léa modifie sa commande en ligne : une alerte attend l'envoi
  await connexion(page, LEA.email, LEA.motDePasse);
  await page.waitForURL("**/espace");
  await page.getByRole("link", { name: /^(Commander|Modifier ma commande)$/ }).first().click();
  await page.waitForURL("**/espace/commander");
  await page.getByRole("button", { name: "Ajouter un Panier 50 €" }).click();
  await page.getByRole("button", { name: /^(Valider ma commande|Enregistrer les modifications)$/ }).click();
  await page.waitForURL("**/espace?commande=ok");

  // La base appelle le site avec le jeton (ici à la main, sans planificateur) : l'administrateur
  // seul est prévenu, une seule fois ; sans le bon jeton, rien
  expect((await envoyer("faux-".repeat(10))).status()).toBe(403);
  const r = await envoyer(jeton);
  expect(r.ok()).toBe(true);
  expect(await r.json()).toEqual({ alertes: 1, envoyes: 1 });
  await expect.poll(async () => (await pushsRecus(request, "admin")).length).toBe(avant + 1);
  expect(await (await envoyer(jeton)).json()).toEqual({ alertes: 0, envoyes: 0 });
});

test("l'administrateur envoie une notification libre à tous les clients abonnés", async ({ page, request }) => {
  const avantLea = (await pushsRecus(request, "lea")).length;
  const avantChloe = (await pushsRecus(request, "chloe")).length;
  const avantAdmin = (await pushsRecus(request, "admin")).length;

  await connexion(page, "admin@demo.fr", "demo-demo-demo");
  await page.waitForURL("**/livraisons**");
  await page.goto("/reglages");
  await page.getByRole("link", { name: /Notification aux clients/ }).click();
  await expect(page.getByText(/Envoyée tout de suite à 2 téléphones/)).toBeVisible();

  await page.getByLabel("Titre").fill("🍓 Les fraises sont arrivées !");
  await page.getByLabel("Message").fill("Barquettes de 500 g BIO, à ajouter à votre panier cette semaine.");
  await page.getByLabel("Quand le client touche la notification").selectOption("/espace/commander");
  await expect(page.getByRole("region", { name: "Aperçu" })).toContainText("Les fraises sont arrivées");
  await page.getByRole("button", { name: "Envoyer à 2 téléphones" }).click();
  await expect(page.getByText("✓ Notification envoyée à 2 téléphones")).toBeVisible();

  // Les deux clientes abonnées, pas le téléphone de l'administrateur
  await expect.poll(async () => (await pushsRecus(request, "lea")).length).toBe(avantLea + 1);
  expect(await pushsRecus(request, "chloe")).toHaveLength(avantChloe + 1);
  expect(await pushsRecus(request, "admin")).toHaveLength(avantAdmin);

  // Historique ; un double envoi du même message est refusé
  await page.reload();
  await expect(page.getByRole("region", { name: "Historique des envois" })).toContainText("2 téléphones · Commander");
  await page.getByLabel("Titre").fill("🍓 Les fraises sont arrivées !");
  await page.getByLabel("Message").fill("Barquettes de 500 g BIO, à ajouter à votre panier cette semaine.");
  await page.getByRole("button", { name: "Envoyer à 2 téléphones" }).click();
  await expect(page.getByText("Ce message vient déjà d'être envoyé.")).toBeVisible();
});
