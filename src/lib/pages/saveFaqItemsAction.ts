"use server";

import { requireUser } from "@/lib/auth/dal";
import { getActiveSiteForCurrentUser, getAdapterForCurrentUser } from "@/lib/cms";
import { logPageActivity } from "@/lib/audit";
import { summarizeFaqChange } from "./auditSummary";
import type { FaqItem, Page } from "@/types";

// Persists the FAQ list through CmsAdapter.updatePage's own faqItems field
// (already supported since Day 5 — the Sanity schema already models
// faqItems as an embedded array on `page`, Day 2) — independent of
// SeoPanel.tsx's own save, so editing FAQs never has to touch or re-save
// title/meta/content at the same time. An empty array is a real, valid input
// here (not "no change") — CmsAdapter.updatePage only skips a field when
// it's `undefined`, so saving `faqItems: []` really does clear every FAQ,
// which is exactly what "delete all the way to zero" (Day 19's task item 5)
// needs to actually persist.
export interface SaveFaqItemsInput {
  cmsDocumentId: string;
  faqItems: FaqItem[];
  // The page's FAQ list as of when FaqEditor loaded — always available here
  // (unlike saveDraftPageAction's equivalent), since this action only ever
  // operates on an already-saved page. Powers the audit log's "what
  // changed" summary (SPEC.md §18).
  previousFaqItems: FaqItem[];
}

export type SaveFaqItemsResult = { page: Page } | { error: string };

export async function saveFaqItemsAction(
  input: SaveFaqItemsInput,
): Promise<SaveFaqItemsResult> {
  const user = await requireUser();
  const site = await getActiveSiteForCurrentUser();

  for (const item of input.faqItems) {
    if (!item.question.trim() || !item.answer.trim()) {
      return {
        error: "Every FAQ needs both a question and an answer — remove any empty ones before saving.",
      };
    }
  }

  try {
    const adapter = await getAdapterForCurrentUser();
    const page = await adapter.updatePage(input.cmsDocumentId, { faqItems: input.faqItems });

    if (site) {
      const summary = summarizeFaqChange(input.previousFaqItems, input.faqItems);
      if (summary) {
        // An AI-generated FAQ only ever reaches this save via FaqEditor's
        // own "Generate FAQs" step, reviewed and possibly edited first
        // (SPEC.md §15) — a `source` of "ai-generated" surviving all the way
        // to a successful save is itself the signal that an AI suggestion
        // was accepted, no separate tracked flag needed.
        const viaAiGeneration = input.faqItems.some((item) => item.source === "ai-generated");
        await logPageActivity({
          pageId: page.cmsDocumentId ?? page.id,
          siteId: site.id,
          userId: user.id,
          userEmail: user.email ?? undefined,
          action: "faqs-updated",
          summary: viaAiGeneration ? `${summary} (includes AI-generated FAQs)` : summary,
        });
      }
    }

    return { page };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save FAQs.",
    };
  }
}
