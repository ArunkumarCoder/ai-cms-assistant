import type {
  AltTextStatus,
  ContentBlock,
  FaqItem,
  ImageAsset,
  Page,
  PageStatus,
} from "@/types";

// Supporting shapes for CmsAdapter (./adapter.ts). All derived from the Day 1
// domain types in `types/` via Omit/Pick/Partial — none of these introduce a
// field that doesn't already exist on Page/ImageAsset. That's deliberate: the
// adapter boundary should never require a second data model to keep in sync
// with the first.

// List views (the /pages index) don't need a page's full body or FAQ list —
// every CMS can produce this cheaply (a GROQ projection, a WP REST `_fields`
// filter), while hydrating full content for every row would force a worse
// query than the UI needs. `faqCount` replaces `faqItems` so the list can
// still show "3 FAQs" without shipping the FAQ text itself.
export type PageSummary = Omit<Page, "contentBlocks" | "faqItems"> & {
  faqCount: number;
};

// Fields the caller can't set on create: `id`/`createdAt`/`updatedAt` are
// bookkeeping the adapter (or the CMS) assigns; `siteId`/`cmsDocumentId` are
// filled in by the adapter instance itself (see CmsAdapter's top comment —
// it's already bound to one Site); `latestSeoAuditId` is written later by
// the (not-yet-built) SEO-audit feature. `status` defaults to "draft" when
// omitted. `contentBlocks`/`faqItems` default to `[]`: a page can be created
// from a brief before content blocks exist, and FAQs are always a later,
// separate generation step (SPEC.md journey d).
//
// `qualityScore` was originally excluded entirely here (Day 5: "a new page
// always starts with no score, written later by the not-yet-built SEO-audit
// feature"). Day 18's composite quality score (src/lib/quality/) is
// deterministic and cheap enough to compute synchronously at save time —
// see saveDraftPageAction.ts — so it's now optional here rather than
// permanently absent; still optional since not every caller computes one
// (e.g. a page created directly in Sanity Studio has none until its next
// save through this app).
export type CreatePageInput = Omit<
  Page,
  | "id"
  | "siteId"
  | "cmsDocumentId"
  | "createdAt"
  | "updatedAt"
  | "latestSeoAuditId"
  | "qualityScore"
  | "status"
  | "contentBlocks"
  | "faqItems"
> & {
  status?: PageStatus;
  contentBlocks?: ContentBlock[];
  faqItems?: FaqItem[];
  qualityScore?: number | null;
};

// A patch, not a full replacement — every field optional, same reasoning as
// CreatePageInput for what's excluded.
export type UpdatePageInput = Partial<CreatePageInput>;

// Named for the one filter SPEC.md's alt-text journey actually needs
// ("filters by missing alt text"). Whether a given adapter pushes this down
// into its own query language or filters in memory after fetching is an
// implementation detail the interface doesn't care about.
export type ImageListFilter = {
  altTextStatus?: AltTextStatus;
};

// `url` is CMS-computed (set on upload, never edited) and `usedOnPageIds` is
// a derived/query-time value per SPEC.md's CMS-agnostic/Sanity-specific
// split, not stored state — neither belongs in a write payload.
export type UpdateImageInput = Partial<
  Pick<ImageAsset, "altText" | "altTextStatus">
>;
