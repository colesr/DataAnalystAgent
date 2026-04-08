import { test, expect } from "@playwright/test";

/**
 * Smoke tests — exercise the happy path that touches every layer:
 * UI → API → Postgres workspace schema → back to UI.
 *
 * Each test gets a fresh anonymous workspace via the dda_ws cookie.
 * Playwright's per-test browser context already isolates cookies, so we
 * don't need to clean up between tests.
 */

test("homepage loads with the expected tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Digital Data Analyst" })).toBeVisible();
  for (const label of [
    "Ask",
    "Data",
    "Tools",
    "Dashboard",
    "Clean",
    "Pivot",
    "SQL",
    "Glossary",
    "Saved",
    "Schema",
  ]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
});

test("load demo data → table shows up in Data tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo data" }).click();
  // Toast or stat line should reflect the load
  await expect(page.getByText(/demo_sales/i)).toBeVisible({ timeout: 15_000 });
  // Switch to Data tab and confirm the table appears in the left list
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await expect(page.getByText(/demo_sales/).first()).toBeVisible();
});

test("SQL editor runs a query and renders rows", async ({ page }) => {
  await page.goto("/");
  // Make sure there's data to query
  await page.getByRole("button", { name: "Load demo data" }).click();
  await expect(page.getByText(/demo_sales/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "SQL", exact: true }).click();
  const editor = page.locator("textarea.code").first();
  await editor.fill("SELECT region, SUM(revenue)::float AS rev FROM demo_sales GROUP BY region ORDER BY rev DESC");
  await page.getByRole("button", { name: "Run query" }).click();

  // We expect at least one of the seeded regions in the result
  await expect(page.getByText(/Northeast|Southeast|Midwest|Southwest|West/).first()).toBeVisible({
    timeout: 15_000,
  });
});
