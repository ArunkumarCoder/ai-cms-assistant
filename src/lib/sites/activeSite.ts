import "server-only";
import { cookies } from "next/headers";
import type { Site as PrismaSite } from "@prisma/client";
import { prisma } from "@/lib/db";

// A user can have more than one connected Site (multi-site is core to the
// agency persona per SPEC.md §1), so "which one is the app currently working
// against" needs to be its own piece of state — this cookie, not a DB column,
// since it's per-browser-session UI state, not an account-level fact.
export const ACTIVE_SITE_COOKIE = "activeSiteId";

export async function getUserSites(userId: string): Promise<PrismaSite[]> {
  return prisma.site.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

// Picks the cookie's Site if it still belongs to this user (it may have been
// deleted, or belong to no one — cookies are never trusted blindly), else
// falls back to the oldest connected Site so there's always a sane default
// before a user ever picks one explicitly. Takes `sites` rather than a
// `userId` so callers that already fetched the list (the app shell) don't
// force a second query.
export async function resolveActiveSite(
  sites: PrismaSite[],
): Promise<PrismaSite | null> {
  if (sites.length === 0) return null;

  const cookieStore = await cookies();
  const activeSiteId = cookieStore.get(ACTIVE_SITE_COOKIE)?.value;
  return sites.find((site) => site.id === activeSiteId) ?? sites[0];
}

export async function setActiveSiteCookie(siteId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SITE_COOKIE, siteId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
