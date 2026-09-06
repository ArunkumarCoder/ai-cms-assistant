import "server-only";
import { createClient } from "next-sanity";
import type { Site as PrismaSite } from "@prisma/client";
import { apiVersion } from "@/sanity/apiVersion";
import { decryptSiteToken } from "@/lib/crypto/siteToken";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import type { Site } from "@/types";
import { SanityAdapter } from "./sanityAdapter";

// Day 6 replacement for the old defaultAdapter.ts singleton: one hardcoded
// Site (from env) becomes "whichever Site the logged-in user connected."
// There's no site-switcher yet (tomorrow's work per today's brief), so a
// user with multiple connected Sites just gets their oldest one — good
// enough until that UI exists, and the schema already supports more than one
// per user without changes.
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

export async function getAdapterForCurrentUser(): Promise<SanityAdapter> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new NotAuthenticatedError();
  }

  const site = await prisma.site.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
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
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };

  return new SanityAdapter(domainSite, client);
}
