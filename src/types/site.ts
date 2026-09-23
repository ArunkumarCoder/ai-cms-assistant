export type CmsProvider = "sanity" | "wordpress";

export interface Site {
  id: string;
  // Day 6: which account owns this Site — added once a real app datastore
  // (Prisma User/Site tables, see src/lib/db.ts) exists to enforce it. The
  // Sanity API token itself deliberately isn't a field here: it's stored
  // encrypted in the DB row and only ever decrypted inside
  // src/lib/cms/resolveAdapter.ts, never carried on this domain type.
  userId: string;
  name: string;
  cms: CmsProvider;
  sanityProjectId?: string;
  sanityDataset?: string;
  wordpressUrl?: string;
  // Optional style guide threaded into every AI generation/regeneration
  // prompt for this site (src/lib/pages/prompt.ts) — set on the site itself
  // rather than re-entered per brief, so every page generated for this
  // client stays consistent.
  brandVoice?: string;
  createdAt: string;
  updatedAt: string;
}
