import "server-only";
import { createClient } from "next-sanity";
import type { Site as PrismaSite } from "@prisma/client";
import { apiVersion } from "@/sanity/apiVersion";
import { decryptSiteToken } from "@/lib/crypto/siteToken";
import { auth } from "@/auth";
import { getUserSites, resolveActiveSite } from "@/lib/sites/activeSite";
import type { Site } from "@/types";
import { SanityAdapter } from "./sanityAdapter";

// Day 6 replacement for the old defaultAdapter.ts singleton: one hardcoded
// Site (from env) becomes "whichever Site the logged-in user connected." Day
// 7 added a real switcher (src/lib/sites/activeSite.ts), which this now
// defers to instead of always picking the oldest Site.
export class NoSiteConnectedError extends Error {
  constructor() {
    super("No Sanity project connected for this account yet.");
    this.name = "NoSiteConnectedError";
  }
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated.");
    this.name = "NotAuthenticatedError";
  }
}

// Split out from getAdapterForCurrentUser so callers that only need the Site
// row itself (e.g. reading `brandVoice` for a generation prompt) don't have
// to construct a SanityAdapter — and, unlike getAdapterForCurrentUser, this
// returns null rather than throwing when there's no connected Site, since
// "no site yet" should mean "no brand voice available," not a broken
// generation call.
export async function getActiveSiteForCurrentUser(): Promise<PrismaSite | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new NotAuthenticatedError();
  }

  const sites = await getUserSites(userId);
  return resolveActiveSite(sites);
}

export async function getAdapterForCurrentUser(): Promise<SanityAdapter> {
  const site = await getActiveSiteForCurrentUser();
  if (!site) {
    throw new NoSiteConnectedError();
  }

  return buildSanityAdapter(site);
}

export function buildSanityAdapter(site: PrismaSite): SanityAdapter {
  const token = site.sanityTokenCiphertext
    ? decryptSiteToken(site.sanityTokenCiphertext)
    : undefined;

  const client = createClient({
    projectId: site.sanityProjectId,
    dataset: site.sanityDataset,
    apiVersion,
    token,
    useCdn: false,
  });

  const domainSite: Site = {
    id: site.id,
    userId: site.userId,
    name: site.name,
    cms: "sanity",
    sanityProjectId: site.sanityProjectId,
    sanityDataset: site.sanityDataset,
    brandVoice: site.brandVoice ?? undefined,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };

  return new SanityAdapter(domainSite, client);
}
