import { createClient } from "next-sanity";

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;

// Hard-coded to today's date per next-sanity convention — bump when the API
// contract needs a newer version, don't compute it dynamically.
export const apiVersion = "2026-09-03";

if (!projectId || !dataset) {
  throw new Error(
    "Missing NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET. " +
      "Copy .env.example to .env.local and fill in your Sanity project details.",
  );
}

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  // No CDN caching: this app reads its own CMS content and needs edits made
  // in Studio to show up immediately, not after the CDN's cache window.
  useCdn: false,
});
