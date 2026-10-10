import { readFileSync } from "node:fs";
import path from "node:path";

// A standalone script run via `tsx` never gets .env.local loaded for it the
// way `next dev`/`next build` do automatically — mirrors e2e/env.ts's own
// loadEnvLocal (not imported from there directly: e2e/ and scripts/ are
// deliberately separate, self-contained runners, same reasoning as keeping
// each Playwright/Vitest config independent rather than cross-importing).
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
