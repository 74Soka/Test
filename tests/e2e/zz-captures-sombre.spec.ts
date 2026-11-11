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
  if (compte) await connecter(page, ...compte);
  for (const chemin of pages) {
    await page.goto(chemin);
    await page.getByText("Chargement…").first().waitFor({ state: "detached" }).catch(() => {});
    await page.waitForTimeout(600);
    const nom = chemin.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "accueil";
    await page.screenshot({ path: `${DOSSIER}/${nom}-${mode}.png` });
  }
  await ctx.close();
}

test("captures clair / sombre", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const mode of ["light", "dark"] as const) {
    await serie(browser, mode, null, ["/connexion"]);
    await serie(browser, mode, ["emma.dubois@example.org", "panier-emma-2026"], ["/espace", "/espace/commander", "/espace/fidelite"]);
    await serie(browser, mode, ["admin@demo.fr", "demo-demo-demo"], ["/livraisons", "/clients", "/commandes/nouvelle", "/tournee", "/reglages"]);
  }
});
