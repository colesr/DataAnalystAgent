import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the smoke e2e suite.
 *
 * Local: `npm run test:e2e` (boots `next start` automatically).
 * CI: same command — see .github/workflows/e2e.yml for the env wiring
 * (postgres service container + DATABASE_URL).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests share a workspace cookie state, keep them serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
