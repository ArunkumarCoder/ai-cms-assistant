"use server";

import { requireUser } from "@/lib/auth/dal";
import { getActiveSiteForCurrentUser, getAdapterForCurrentUser } from "@/lib/cms";
import { logPageActivity } from "@/lib/audit";
import { resolvePageStatusTransition, type PageStatusAction } from "./pageStatusTransitions";
import type { Page, PageStatus } from "@/types";

export interface TransitionPageStatusInput {
  cmsDocumentId: string;
  // The status the client believes the page is currently in — used only to
  // decide whether the requested action is legal, per
  // pageStatusTransitions.ts's table. This app has no per-document locking
  // anywhere (every save already just overwrites, matching the rest of this
  // codebase's concurrency posture), so a stale value here can at worst
  // request a transition that wasn't really legal from Sanity's true current
  // status — Sanity itself still ends up with whatever `nextStatus` this
  // resolves to, not a corrupted state.
  currentStatus: PageStatus;
  action: PageStatusAction;
}

export type TransitionPageStatusResult = { page: Page } | { error: string };

export async function transitionPageStatusAction(
  input: TransitionPageStatusInput,
): Promise<TransitionPageStatusResult> {
  const user = await requireUser();
  const site = await getActiveSiteForCurrentUser();

  const nextStatus = resolvePageStatusTransition(input.action, input.currentStatus);
  if (!nextStatus) {
    return {
      error: `Can't "${input.action}" a page that's currently "${input.currentStatus}".`,
    };
  }

  try {
    const adapter = await getAdapterForCurrentUser();
    const page = await adapter.updatePage(input.cmsDocumentId, { status: nextStatus });

    if (site) {
      await logPageActivity({
        pageId: page.cmsDocumentId ?? page.id,
        siteId: site.id,
        userId: user.id,
        userEmail: user.email ?? undefined,
        action: "status-changed",
        summary: `Status changed: ${input.currentStatus} → ${nextStatus}.`,
        metadata: { from: input.currentStatus, to: nextStatus, transitionAction: input.action },
      });
    }

    return { page };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to change this page's status.",
    };
  }
}
