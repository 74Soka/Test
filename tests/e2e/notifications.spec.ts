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
  // Service de push du téléphone simulé (le vrai passe par Google ou Apple)
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
  }, `${FAUX}/push/lea`);
});

async function connexion(page: Page, email: string, motDePasse: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function pushsRecus(request: APIRequestContext): Promise<{ endpoint: string; ttl: string; urgence: string; octets: number }[]> {
  return ((await (await request.get(`${FAUX}/test/pushs`)).json()) as { endpoint: string; ttl: string; urgence: string; octets: number }[]).filter(
    (p) => p.endpoint === "/push/lea",
  );
}

test("le client active les notifications, puis est prévenu au départ de la tournée et quand il est le prochain", async ({
  page,
  request,
}) => {
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
