"use server";

import { requireUser } from "@/lib/auth/dal";
import { getAdapterForCurrentUser } from "@/lib/cms";
import type { FaqItem, Page } from "@/types";

// Persists the FAQ list through CmsAdapter.updatePage's own faqItems field
// (already supported since Day 5 — the Sanity schema already models
// faqItems as an embedded array on `page`, Day 2) — independent of
// SeoPanel.tsx's own save, so editing FAQs never has to touch or re-save
// title/meta/content at the same time. An empty array is a real, valid input
// here (not "no change") — CmsAdapter.updatePage only skips a field when
// it's `undefined`, so saving `faqItems: []` really does clear every FAQ,
// which is exactly what "delete all the way to zero" (this task's item 5)
// needs to actually persist.
export interface SaveFaqItemsInput {
  cmsDocumentId: string;
  faqItems: FaqItem[];
}

export type SaveFaqItemsResult = { page: Page } | { error: string };

export async function saveFaqItemsAction(
  input: SaveFaqItemsInput,
): Promise<SaveFaqItemsResult> {
  await requireUser();

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
    return { page };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save FAQs.",
    };
  }
}
