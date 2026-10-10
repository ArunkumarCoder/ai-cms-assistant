import type { CmsAdapter } from "@/lib/cms/adapter";
import type { ContentBlock, FaqItem, Page, PageType } from "@/types";

export interface UpsertPageInput {
  slug: string;
  title: string;
  metaDescription: string;
  targetKeyword?: string;
  pageType: PageType;
  contentBlocks: ContentBlock[];
}

export interface UpsertPageResult {
  page: Page;
  created: boolean;
}

// The one piece of idempotency logic genuinely worth its own unit test
// (Day 36 task: "add tests for the idempotency") — look the page up by its
// fixed demo slug first, and only create when nothing's there yet. Re-running
// the whole seed script converges every demo page to this exact content
// rather than creating a second copy, by construction: there's no code path
// here that can create twice for the same slug.
//
// Deliberately never touches `status` — that's simulated through the real
// draft -> in-review -> approved -> published transition sequence elsewhere
// (upsertPageStatus.ts), the same way a real user moves a page through
// review, not by overwriting the field directly here.
export async function upsertDemoPage(
  adapter: CmsAdapter,
  input: UpsertPageInput,
): Promise<UpsertPageResult> {
  const existing = await adapter.getPage(input.slug);
  if (existing) {
    const updated = await adapter.updatePage(
      existing.cmsDocumentId ?? existing.id,
      {
        title: input.title,
        metaDescription: input.metaDescription,
        targetKeyword: input.targetKeyword,
        pageType: input.pageType,
        contentBlocks: input.contentBlocks,
      },
    );
    return { page: updated, created: false };
  }

  const created = await adapter.createPage({
    slug: input.slug,
    title: input.title,
    metaDescription: input.metaDescription,
    targetKeyword: input.targetKeyword,
    pageType: input.pageType,
    contentBlocks: input.contentBlocks,
  });
  return { page: created, created: true };
}

// Same idempotent-by-slug shape, for the one additional write FAQs need —
// `adapter.updatePage`'s `faqItems` replaces the whole array (never merges),
// so converging to the same list on every run is automatic as long as the
// input list itself is deterministic, which DEMO_PAGES's static data is.
export async function upsertDemoFaqs(
  adapter: CmsAdapter,
  cmsDocumentId: string,
  faqItems: Omit<FaqItem, "pageId">[],
  pageId: string,
): Promise<Page> {
  return adapter.updatePage(cmsDocumentId, {
    faqItems: faqItems.map((item) => ({ ...item, pageId })),
  });
}
