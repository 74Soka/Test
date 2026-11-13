import { test, type Browser, type Page } from "@playwright/test";

const DOSSIER = process.env.CAPTURES_SOMBRE!;
test.skip(!DOSSIER, "captures seulement à la demande");

async function connecter(page: Page, email: string, mdp: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(mdp);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"));
}

async function serie(browser: Browser, mode: "light" | "dark", compte: [string, string] | null, pages: string[]) {
  const ctx = await browser.newContext({ ...test.info().project.use, colorScheme: mode });
  const page = await ctx.newPage();
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  // Comme un vrai téléphone : notifications ni accordées ni refusées, aucun abonnement
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "default" });
    PushManager.prototype.getSubscription = async () => null;
  });
  if (compte) await connecter(page, ...compte);
  for (const chemin of pages) {
    await page.goto(chemin);
    await page.getByText("Chargement…").first().waitFor({ state: "detached" }).catch(() => {});
    await page.waitForTimeout(600);
    const nom = chemin.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "accueil";
    await page.screenshot({ path: `${DOSSIER}/${nom}-${mode}.png` });
    if (chemin === "/tournee") {
      const paiement = page.getByRole("group", { name: /^Paiement de / }).first();
      if (await paiement.count()) {
        await page.addStyleTag({ content: "header { position: static !important; } nav { display: none !important; }" });
        await paiement.locator("xpath=..").screenshot({ path: `${DOSSIER}/paiement-livreur-${mode}.png` });
      }
    }
    if (chemin === "/espace/compte") {
      await page.getByRole("region", { name: "Mon solde" }).screenshot({ path: `${DOSSIER}/mon-solde-${mode}.png` });
    }
    if (chemin === "/commandes/nouvelle") {
      await page.getByRole("button", { name: "+ Ajouter un supplément libre" }).click();
      const libre = page.getByRole("group", { name: "Supplément libre 1" });
      await libre.getByLabel("Supplément (nom)").fill("Fraises (500 g)");
      await libre.getByLabel("Prix (€)").fill("4,50");
      await page.addStyleTag({ content: "header { position: static !important; } nav { display: none !important; }" });
      await libre.locator("xpath=..").locator("> :nth-last-child(-n+2)").first().scrollIntoViewIfNeeded();
      const zone = await libre.boundingBox();
      const bouton = await page.getByRole("button", { name: "+ Ajouter un supplément libre" }).boundingBox();
      if (zone && bouton) {
        await page.screenshot({
          path: `${DOSSIER}/supplement-libre-${mode}.png`,
          fullPage: true,
          clip: { x: 0, y: zone.y - 16 + (await page.evaluate(() => window.scrollY)), width: 412, height: bouton.y + bouton.height - zone.y + 32 },
        });
      }
    }
    const invitation = page.getByRole("region", { name: "Notifications de livraison" });
    if (chemin === "/espace" && (await invitation.isVisible())) {
      await invitation.screenshot({ path: `${DOSSIER}/invitation-notifications-${mode}.png` });
    }
  }
  await ctx.close();
}

test("captures clair / sombre", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const mode of ["light", "dark"] as const) {
    await serie(browser, mode, null, ["/connexion"]);
    await serie(browser, mode, ["emma.dubois@example.org", "panier-emma-2026"], ["/espace", "/espace/commander", "/espace/fidelite", "/espace/compte"]);
    await serie(browser, mode, ["admin@demo.fr", "demo-demo-demo"], ["/livraisons", "/clients", "/commandes/nouvelle", "/tournee", "/reglages"]);
  }
});
