import { createClient, type SanityClient } from "next-sanity";
import { apiVersion } from "./apiVersion";

// Separate from `client.ts` (which has no token at all) because this one
// carries a token when available and must never run with `useCdn: true`.
// Deliberately does not import `./client`: that module throws at import time
// if NEXT_PUBLIC_SANITY_PROJECT_ID/DATASET are unset, which would make merely
// importing sanityAdapter.ts (e.g. from a test file that injects a mock
// client and never calls this function) require real env vars. Reads its own
// env vars lazily instead, inside the function.
//
// The token is optional here on purpose: this same client backs
// getPages/getPage/listImages too (SanityAdapter has one client, not a
// read/write pair — see its constructor), and this project's dataset is
// public, so reads work with no token at all. Only omit the token when it's
// genuinely missing, and let a write attempted without one fail naturally
// with Sanity's own 401 (matches CmsAdapter's "throw on real failures"
// convention) rather than blocking reads on a token they don't need.
let cached: SanityClient | null = null;

export function getWriteClient(): SanityClient {
  if (cached) return cached;

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
  if (!projectId || !dataset) {
    throw new Error(
      "Missing NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET. " +
        "Copy .env.example to .env.local and fill in your Sanity project details.",
    );
  }

  const token = process.env.SANITY_API_TOKEN || undefined;
  cached = createClient({ projectId, dataset, apiVersion, token, useCdn: false });
  return cached;
}
