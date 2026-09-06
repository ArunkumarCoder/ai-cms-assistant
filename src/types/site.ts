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
  createdAt: string;
  updatedAt: string;
}
