import { prisma } from "@/lib/db";
import type { CmsAdapter } from "@/lib/cms/adapter";
import type { CreatePageInput, ImageListFilter, UpdateImageInput, UpdatePageInput } from "@/lib/cms/types";
import type { Page } from "@/types";
import { computeQualityScore } from "./score";

// Wraps any CmsAdapter so every createPage/updatePage call automatically
// computes and persists the composite quality score (SPEC.md §10) —
// no caller has to remember to compute or pass one. This closes the gap
// Day 14 left open: back then only saveDraftPageAction bothered to compute a
// score, so regenerateBlockAction's own auto-persist (and any future
// "publish" action, whenever one exists) left the page's score stale.
// Wrapping the CmsAdapter *interface*, not SanityAdapter directly, means a
// future WordPress adapter gets identical behavior for free — this is the
// one place "on save and on publish" needs to be true, since every content
// write of any kind already goes through createPage/updatePage.
//
// Each write's freshly-*persisted* Page (not the caller's input) is what
// gets scored — the adapter's own return value is the authoritative
// post-write truth (Sanity may have normalized fields, and CreatePageInput
// omits several fields updatePage's caller might not have touched), so this
// can't drift from what a reader will actually see.
export interface AutoScoreContext {
  siteId: string;
}

function toQualityScoreInput(page: Page) {
  return {
    title: page.title,
    metaDescription: page.metaDescription,
    targetKeyword: page.targetKeyword,
    contentBlocks: page.contentBlocks,
    faqItems: page.faqItems,
  };
}

// Append-only, best-effort — same "never throws" convention as
// src/lib/ai/logging.ts's logAiCall: a history-write hiccup is an
// observability gap, not a reason to fail a page save that otherwise
// succeeded (the *current* score, persisted via adapter.updatePage above
// this call, is the one thing that must actually propagate a real failure).
async function recordHistory(pageId: string, siteId: string, quality: ReturnType<typeof computeQualityScore>): Promise<void> {
  try {
    await prisma.qualityScoreHistory.create({
      data: { pageId, siteId, score: quality.score, subScores: quality.subScores },
    });
  } catch (err) {
    console.error("Failed to record quality score history:", err);
  }
}

export function withQualityScoring(adapter: CmsAdapter, context: AutoScoreContext): CmsAdapter {
  async function scoreAndPersist(page: Page): Promise<Page> {
    const quality = computeQualityScore(toQualityScoreInput(page));
    const cmsDocumentId = page.cmsDocumentId ?? page.id;

    // Uses the unwrapped `adapter` directly, not `this`/the object this
    // function returns — otherwise this write would recurse back through
    // scoreAndPersist a second time.
    const scored = await adapter.updatePage(cmsDocumentId, { qualityScore: quality.score });
    await recordHistory(cmsDocumentId, context.siteId, quality);
    return scored;
  }

  // Every method is forwarded explicitly, not via `{...adapter, ...}` —
  // found during Day 29's full-feature integration walkthrough as a real,
  // pre-existing bug affecting every real adapter (Sanity included), not
  // just WordPress: `SanityAdapter`/`WordPressAdapter` are ES classes, so
  // their methods live on the prototype, not as the instance's own
  // enumerable properties. Object spread only copies own-enumerable
  // properties, so `{...adapter}` silently produced an object with *only*
  // `site`/`client` plus whichever two methods this wrapper redefined —
  // every call to the wrapped adapter's `getPages`/`getPage`/`listImages`/
  // `updateImage` would throw "is not a function" the moment a real class
  // instance (not a plain mock object) was wrapped. autoScore.test.ts never
  // caught this because its own `makeInnerAdapter` test double is a plain
  // object literal, whose properties *are* own-enumerable — a mock shape
  // that happened to make the bug invisible to its own test suite.
  return {
    getPages: () => adapter.getPages(),
    getPage: (slug: string) => adapter.getPage(slug),
    listImages: (filter?: ImageListFilter) => adapter.listImages(filter),
    updateImage: (cmsAssetId: string, data: UpdateImageInput) => adapter.updateImage(cmsAssetId, data),
    async createPage(data: CreatePageInput): Promise<Page> {
      const created = await adapter.createPage(data);
      return scoreAndPersist(created);
    },
    async updatePage(cmsDocumentId: string, data: UpdatePageInput): Promise<Page> {
      const updated = await adapter.updatePage(cmsDocumentId, data);
      return scoreAndPersist(updated);
    },
  };
}
