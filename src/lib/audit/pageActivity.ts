import { prisma } from "@/lib/db";
import type { PageAuditLogEntry, Prisma } from "@prisma/client";

export interface LogPageActivityInput {
  pageId: string;
  siteId: string;
  userId?: string;
  userEmail?: string;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

// Best-effort, matching logAiCall's (src/lib/ai/logging.ts) and
// autoScore.ts's recordHistory's established "never throws" convention: a
// missed audit entry is an observability gap, not a reason to fail the
// save/transition that already succeeded. Called from inside
// saveDraftPageAction/saveFaqItemsAction/transitionPageStatusAction — never
// exposed as its own client-callable Server Action, since every entry must
// correspond to something that actually happened server-side, not a claim a
// client could make on its own.
export async function logPageActivity(input: LogPageActivityInput): Promise<void> {
  try {
    await prisma.pageAuditLogEntry.create({
      data: {
        pageId: input.pageId,
        siteId: input.siteId,
        userId: input.userId,
        userEmail: input.userEmail,
        action: input.action,
        summary: input.summary,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("Failed to record page audit log entry:", err);
  }
}

// Read side for the History panel (page.tsx) — most recent first, capped so
// a long-lived page's history can't make the page load unbounded. Resilient
// like the write side: a Postgres hiccup here shouldn't take down the whole
// page detail view over a supplementary panel, so this degrades to an empty
// history rather than throwing into the route's own error handling.
export async function getPageActivity(pageId: string, limit = 20): Promise<PageAuditLogEntry[]> {
  try {
    return await prisma.pageAuditLogEntry.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  } catch (err) {
    console.error("Failed to load page audit log:", err);
    return [];
  }
}
