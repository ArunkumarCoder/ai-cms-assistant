// The one guard standing between `npm run seed:demo` and writing fake
// content into (or, with `--reset`, deleting rows from) something real. A
// connection string alone can't prove an environment is safe — there's no
// universal "this is definitely not production" marker — so this is a
// heuristic, not a guarantee: deny by default, require a human to type the
// override flag for anything that isn't *obviously* a local/staging/demo
// target. Pure and synchronous on purpose (no env reads, no network) so it's
// directly unit-testable without mocking anything.

const RISKY_MARKERS = ["prod", "production", "live"];
const SAFE_MARKERS = [
  "localhost",
  "127.0.0.1",
  "::1",
  ".local",
  "staging",
  "demo",
  "dev",
  "test",
];

export interface SeedTarget {
  label: string;
  // The connection string / URL itself — may contain credentials, so
  // callers must redact before ever printing it (see redactTarget below).
  value: string;
}

export interface SafetyCheckResult {
  safe: boolean;
  // One entry per target that was flagged, human-readable, safe to print —
  // never includes the raw target value itself.
  reasons: string[];
}

function isObviouslyRisky(value: string): boolean {
  const lower = value.toLowerCase();
  if (RISKY_MARKERS.some((marker) => lower.includes(marker))) return true;
  if (SAFE_MARKERS.some((marker) => lower.includes(marker))) return false;
  // Ambiguous — no marker either way. Treated as risky rather than safe:
  // this project's own real dev database (a remote Prisma Postgres host
  // with a generic hostname) falls in exactly this bucket, and requiring
  // the override flag for it is the intended behavior, not a false
  // positive — a human confirming "yes, this one's fine" once per
  // environment is the entire point of the flag.
  return true;
}

// `force` short-circuits straight to `safe: true` — it exists specifically
// to override a risky verdict, not to skip evaluating one, so a caller can
// still show the human what *would* have been flagged even when proceeding.
export function checkSeedTargetSafety(
  targets: SeedTarget[],
  force: boolean,
): SafetyCheckResult {
  const flagged = targets.filter((target) => isObviouslyRisky(target.value));
  if (flagged.length === 0 || force) {
    return { safe: true, reasons: flagged.map((t) => reasonFor(t)) };
  }
  return { safe: false, reasons: flagged.map((t) => reasonFor(t)) };
}

function reasonFor(target: SeedTarget): string {
  return `${target.label} doesn't look like an obviously local/staging/demo target.`;
}

// Printed before anything else happens, safe or not — "print what it will
// touch before doing so" applies regardless of the safety verdict. Strips
// credentials: a connection string's userinfo segment, or anything after
// the host for a bare URL that might carry a token in a query string.
export function redactTarget(value: string): string {
  try {
    const url = new URL(value);
    url.username = url.username ? "***" : "";
    url.password = url.password ? "***" : "";
    for (const key of url.searchParams.keys()) {
      url.searchParams.set(key, "***");
    }
    return url.toString();
  } catch {
    return "<unparseable>";
  }
}
