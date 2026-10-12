import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// For uptime monitoring (task's own ask) — deliberately unauthenticated
// (an uptime checker can't log in) and deliberately silent about *why*
// something failed: a raw Postgres or Sanity error can carry connection
// details (host, credentials hints) worth keeping off a public, no-secrets
// endpoint. "ok"/"error" is all a monitor actually needs to page someone.
//
// Each check gets a short timeout of its own — this route exists so an
// uptime monitor can tell "the app is down" apart from "the app is up but a
// dependency is slow," and a health check that itself hangs for 30s on a
// flaky upstream defeats that purpose.
const CHECK_TIMEOUT_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("timed out")), CHECK_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]);
}

async function checkDatabase(): Promise<boolean> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

// Checks the app's own Sanity project (src/sanity/client.ts) — the one CMS
// connection that isn't scoped to a particular signed-in user's Site. A
// per-user connected Site's own CMS reachability is already surfaced inline,
// in that Site's own screens (describeCmsActionFailure's "couldn't reach
// this Site's CMS" messages) — this route checks what's actually global
// infrastructure, not a stand-in for every possible connected Site.
async function checkCms(): Promise<boolean> {
  try {
    const { client } = await import("@/sanity/client");
    await withTimeout(client.fetch("count(*[])"));
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const [databaseOk, cmsOk] = await Promise.all([checkDatabase(), checkCms()]);
  const healthy = databaseOk && cmsOk;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: {
        database: databaseOk ? "ok" : "error",
        cms: cmsOk ? "ok" : "error",
      },
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
