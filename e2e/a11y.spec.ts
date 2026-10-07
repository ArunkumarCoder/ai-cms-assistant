import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { TEST_USER } from "./env";

// WCAG 2.0/2.1 A+AA is the ruleset this project targets throughout the Day 33
// pass — matches the manual keyboard/screen-reader/contrast work, not axe's
// (broader, noisier) full default rule set.
async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
}

function expectClean(results: Awaited<ReturnType<typeof scan>>) {
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(pages|sites)/);
}

test.describe("unauthenticated screens", () => {
  test("login page", async ({ page }) => {
    await page.goto("/login");
    expectClean(await scan(page));
  });

  test("signup page", async ({ page }) => {
    await page.goto("/signup");
    expectClean(await scan(page));
  });
});

test.describe("authenticated screens", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("sites screen", async ({ page }) => {
    await page.goto("/sites");
    expectClean(await scan(page));
  });

  test("connect a site form", async ({ page }) => {
    await page.goto("/sites/connect");
    expectClean(await scan(page));
  });

  // These need the real connected Site global-setup.ts seeds from this
  // machine's own .env.local — not present on a runner with no Sanity
  // credentials, so there is nothing meaningful to render or audit.
  test.describe("screens that need a connected Site", () => {
    test.skip(process.env.E2E_HAS_SITE !== "1", "No Sanity credentials in .env.local — skipping.");

    test("pages list", async ({ page }) => {
      await page.goto("/pages");
      expectClean(await scan(page));
    });

    test("page editor", async ({ page }) => {
      await page.goto("/pages");
      const firstPage = page.locator("main a[href^='/pages/']").first();
      test.skip((await firstPage.count()) === 0, "No pages in this Sanity dataset to open.");
      await firstPage.click();
      await page.waitForLoadState("networkidle");
      expectClean(await scan(page));
    });

    test("media library", async ({ page }) => {
      await page.goto("/media");
      expectClean(await scan(page));
    });

    test("dashboard", async ({ page }) => {
      await page.goto("/dashboard");
      expectClean(await scan(page));
    });
  });
});
