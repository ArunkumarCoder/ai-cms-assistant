import { readFileSync } from "node:fs";
import path from "node:path";

// Playwright's own process (unlike `next dev`, which Next.js starts as a
// child and loads .env.local into automatically) never reads .env.local on
// its own — global-setup.ts and the spec file both need these values
// (SANITY_API_TOKEN to seed a real connected Site, SITE_TOKEN_ENCRYPTION_KEY
// to encrypt it) before anything in src/ that calls process.env.* runs.
export function loadEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Strips wrapping quotes ("postgres://…" -> postgres://…) — values here
    // are stored quoted, which a naive load leaves in place, breaking the
    // very env-var parsing (e.g. Prisma's own scheme-prefix check) that just
    // read this file. Takes priority over whatever `@prisma/client` already
    // auto-loaded from `.env` (a different, thinner file in this project):
    // always overwrites rather than only filling in gaps.
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      process.env[key] = value;
    }
  }
}

// Fixed, not per-run-unique: global-teardown.ts deletes this exact user after
// every run (Site cascades), so re-running locally never accumulates orphan
// accounts, and two tests in the same run can both rely on it existing.
export const TEST_USER = {
  email: "e2e-a11y@local.test",
  password: "A11yAudit!2026",
};
