// The identifiers shared between the demo seed script (scripts/seedDemo.ts),
// the AI spend cap (src/lib/ai/spendCap.ts), and the screenshot tool
// (e2e/demoShots.spec.ts) — "is this call coming from the public demo
// account" is resolved by comparing against this email, not a stored flag on
// the User row, for the same reason Day 36's seed script avoids synthetic
// flags elsewhere: a real, already-unique field (email) can't drift out of
// sync with itself the way a separate boolean could.
export const DEMO_USER_EMAIL = "demo@larkspur-coffee.example";
// Documented in README.md's "Run the demo" section — not a secret, since
// this account only ever touches fake demo content on the staging site.
export const DEMO_USER_PASSWORD = "DemoPass!2026";
