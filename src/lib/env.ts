import * as z from "zod";

// Fails fast with a readable, per-variable message instead of letting a
// missing secret surface later as an opaque SDK/Prisma/NextAuth error deep
// in a request (Day 37's own production-readiness audit found exactly this:
// a missing SANITY_API_TOKEN or AUTH_SECRET today fails with whatever error
// message that specific library happens to throw, not a clear "you forgot
// to set X"). Validated once, at server startup, via instrumentation.ts's
// `register()` — not at import time in this module itself, so importing
// this file (or anything that transitively does) never risks crashing a
// Vitest run that has no real .env configured.
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required — a Postgres connection string."),
  AUTH_SECRET: z
    .string()
    .min(
      32,
      "AUTH_SECRET must be at least 32 characters. Generate one with `openssl rand -base64 32`.",
    ),
  SITE_TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(
      1,
      "SITE_TOKEN_ENCRYPTION_KEY is required. Generate one with `openssl rand -base64 32`.",
    )
    .refine(isValidBase64EncryptionKey, {
      message:
        "SITE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded). Generate one with " +
        "`openssl rand -base64 32`.",
    }),
  // All three AI provider keys are optional here, on purpose: each
  // provider's own getDefaultClient() (src/lib/ai/providers/*.ts) already
  // throws its own clear "Missing X_API_KEY" error, lazily, the first time a
  // call actually routes to that specific provider — not at import time.
  // That's a deliberate, pre-existing design choice (providers/registry.ts's
  // own comment: "a provider with no key configured only throws when a call
  // actually routes to it"), so the app stays usable for every non-AI
  // feature (CMS browsing, SEO scoring's deterministic parts, the review
  // workflow) without every single key configured. Requiring all three here
  // would silently override that choice and break local dev for anyone who
  // hasn't set up every provider — found the hard way (Day 37): this
  // validator's first version did exactly that and refused to even start
  // the dev server in this project's own working local environment, which
  // has never had a real OPENAI_API_KEY configured.
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // The project/dataset this app's own Sanity-facing code points at
  // (src/sanity/client.ts, src/sanity/writeClient.ts) — not secret (the
  // project id is already committed in .env.example), but still required:
  // without both, src/sanity/client.ts throws its own "Missing
  // NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET" error the
  // first time anything touches it.
  NEXT_PUBLIC_SANITY_PROJECT_ID: z
    .string()
    .min(1, "NEXT_PUBLIC_SANITY_PROJECT_ID is required."),
  NEXT_PUBLIC_SANITY_DATASET: z
    .string()
    .min(1, "NEXT_PUBLIC_SANITY_DATASET is required."),
  // Legitimately optional — src/sanity/writeClient.ts already treats an
  // absent token as "read-only," not an error.
  SANITY_API_TOKEN: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

export type Env = z.infer<typeof envSchema>;

function isValidBase64EncryptionKey(value: string): boolean {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

let cached: Env | null = null;

// Memoized rather than re-validated on every call — this runs once from
// instrumentation.ts at server startup, but nothing stops a route from
// calling it again later, and re-running `safeParse` on every request for a
// value that can't change mid-process would just be wasted work.
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(
      `Invalid or missing environment variables:\n${lines.join("\n")}\n\n` +
        "See .env.example for the full list and how to generate each secret.",
    );
  }
  cached = parsed.data;
  return cached;
}

// Test-only: lets a test simulate a fresh process (env.test.ts needs this to
// exercise both the success and failure paths without the memoized result
// from an earlier test leaking into a later one).
export function __resetEnvCacheForTests(): void {
  cached = null;
}
