// Runs once when a new server instance starts, before it handles any
// request (Next's own instrumentation convention — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// This is "fails fast at startup" for real: a misconfigured deploy — a
// forgotten AUTH_SECRET, a SITE_TOKEN_ENCRYPTION_KEY that isn't valid
// base64 — now crashes the instance immediately with a readable, per-
// variable message, instead of surfacing later as an opaque Prisma/NextAuth/
// SDK error on whichever request happens to touch that value first.
export async function register() {
  // Skip on the edge runtime: getEnv() isn't doing anything edge-incompatible
  // today, but this project's Node-only dependencies (Prisma, node:crypto)
  // make Node the only runtime this app actually runs on — guarding here
  // means that stays true even if something edge-only gets added later
  // without anyone remembering this file.
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { getEnv } = await import("./lib/env");
  getEnv();
}
