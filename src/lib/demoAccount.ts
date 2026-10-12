// The one identifier shared between the demo seed script (scripts/seedDemo.ts)
// and the AI spend cap (src/lib/ai/spendCap.ts) — "is this call coming from
// the public demo account" is resolved by comparing against this email, not
// a stored flag on the User row, for the same reason Day 36's seed script
// avoids synthetic flags elsewhere: a real, already-unique field (email)
// can't drift out of sync with itself the way a separate boolean could.
export const DEMO_USER_EMAIL = "demo@larkspur-coffee.example";
