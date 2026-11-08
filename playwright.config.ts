import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout sur un téléphone simulé.
 *
 * Par défaut, l'application tourne contre une imitation de Supabase
 * (tests/e2e/faux-supabase.ts) branchée sur un Postgres de test
 * (TEST_DATABASE_URL) : aucun Docker ni projet en ligne nécessaire.
 */
const PORT_APP = 3100;
const PORT_FAUX = 54399;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://localhost:${PORT_APP}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "off",
  },
  webServer: [
    {
      command: "npx tsx tests/e2e/faux-supabase.ts",
      url: `http://127.0.0.1:${PORT_FAUX}/sante`,
      env: { PORT_FAUX_SUPABASE: String(PORT_FAUX) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next dev --port ${PORT_APP}`,
      url: `http://localhost:${PORT_APP}/connexion`,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PORT_FAUX}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "cle-de-test",
        GEOCODAGE_URL: `http://127.0.0.1:${PORT_FAUX}/geocodage`,
        ORS_API_KEY: "cle-de-test",
        ORS_URL: `http://127.0.0.1:${PORT_FAUX}/openrouteservice`,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
