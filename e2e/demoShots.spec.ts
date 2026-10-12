import { test, type Page } from "@playwright/test";
import path from "node:path";
import { DEMO_USER_EMAIL, DEMO_USER_PASSWORD } from "../src/lib/demoAccount";

// `npm run demo:shots` (Day 38) — captures a fixed, stable set of
// screenshots from the seeded demo account for the README/portfolio/LinkedIn
// (see docs/demo/script.md and docs/demo/README.md for where each one goes).
//
// Zero live AI calls by default — every shot below reads data `npm run
// seed:demo` already pre-baked, so this is safe and free to re-run as often
// as needed. The one shot that's inherently impossible without a live call
// (the SEO suggestion *diff view* only ever exists in React state after a
// real AI response, never persisted — SPEC.md's "never auto-save" principle
// means there's no pre-baked equivalent to fall back to) is opt-in only,
// behind DEMO_SHOTS_WITH_LIVE=1, and is skipped — not failed — otherwise.
test.setTimeout(60_000);

const OUTPUT_DIR = path.join(__dirname, "..", "docs", "demo", "screenshots");
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 375, height: 800 };

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_USER_EMAIL);
  await page.getByLabel("Password").fill(DEMO_USER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(pages|sites|dashboard)/);
}

async function shot(page: Page, name: string, options: Parameters<Page["screenshot"]>[0] = {}): Promise<void> {
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: filePath, ...options });
  console.log(`  wrote docs/demo/screenshots/${name}.png`);
}

test.describe("demo screenshots (pre-baked data only)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await login(page);
  });

  test("dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await shot(page, "dashboard");
  });

  test("cost dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("heading", { name: "Cost & usage" }).scrollIntoViewIfNeeded();
    await shot(page, "cost-dashboard");
  });

  test("page editor (SEO panel + SERP preview)", async ({ page }) => {
    // A "scores well" seeded page, with a real target keyword and a filled-
    // in SERP preview — more representative of the feature than a problem
    // page would be here.
    await page.goto("/pages/demo-coffee-subscription");
    await page.getByRole("heading", { name: "SEO checks" }).scrollIntoViewIfNeeded();
    await shot(page, "page-editor");
  });

  test("quality score breakdown", async ({ page }) => {
    // The lowest-scoring seeded page — a colorful (red/amber) sub-score
    // breakdown reads better in a screenshot than a uniformly green one.
    await page.goto("/pages/demo-single-origin-beans");
    await page.getByRole("heading", { name: "Quality score" }).scrollIntoViewIfNeeded();
    await shot(page, "quality-score");
  });

  test("FAQ editor", async ({ page }) => {
    // Already has three seeded FAQs — shows the real feature, not its empty
    // state.
    await page.goto("/pages/demo-home");
    await page.getByRole("heading", { name: "FAQs" }).scrollIntoViewIfNeeded();
    await shot(page, "faq-editor");
  });

  test("media library", async ({ page }) => {
    await page.goto("/media");
    await shot(page, "media-library");
  });

  test("mobile width", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/pages");
    await shot(page, "mobile");
  });

  // Opt-in only — see this file's own top comment for why. Run with:
  //   DEMO_SHOTS_WITH_LIVE=1 npm run demo:shots
  test("diff view (opt-in, makes one real AI call)", async ({ page }) => {
    test.skip(
      process.env.DEMO_SHOTS_WITH_LIVE !== "1",
      "Set DEMO_SHOTS_WITH_LIVE=1 to include this one live-AI shot — every other shot needs zero live calls.",
    );

    await page.goto("/pages/demo-single-origin-beans");
    await page.getByRole("button", { name: "Get AI suggestions" }).click();
    // A real provider call — generous timeout, and a clear failure message
    // rather than a silent screenshot of nothing if it's slow/down.
    await page
      .getByText(/^(Accept|Reject)$/)
      .first()
      .waitFor({ timeout: 20_000 });
    await shot(page, "diff-view");
  });
});
