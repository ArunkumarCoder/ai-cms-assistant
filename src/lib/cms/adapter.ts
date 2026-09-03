import type { ImageAsset, Page } from "@/types";
import type {
  CreatePageInput,
  ImageListFilter,
  PageSummary,
  UpdateImageInput,
  UpdatePageInput,
} from "./types";

// The boundary between "the app" and "a CMS."
//
// Every AI feature in SPEC.md (page generation, SEO audit, alt text, FAQs)
// needs to read and write Page/ImageAsset content, but none of them care
// *how* that content is stored. This interface is that line: everything
// listed on it is something any reasonable CMS can do; everything a specific
// CMS needs beyond this (GROQ, Portable Text, WordPress's REST auth, etc.)
// stays inside that CMS's own adapter file and never leaks up to callers.
//
// Design decisions that shape every method below:
//
// 1. One adapter instance = one Site. `Site.sanityProjectId`/`sanityDataset`
//    (or a future `Site.wordpressUrl`) are already per-site config, so the
//    adapter is constructed once against one site's backend — the same
//    pattern `src/sanity/client.ts` already uses (one client, bound to one
//    project+dataset, not parameterized per call). Multi-site support is an
//    app-layer concern (holding one adapter instance per Site), not a
//    `siteId` parameter threaded through every method here. That's why
//    `siteId` never appears below even though it's a real field on `Page`
//    and `ImageAsset`.
//
// 2. IDs passed into write methods are CMS document/asset ids, not
//    `Page.id`/`ImageAsset.id`. Per SPEC.md, those `id` fields are "our own
//    DB id" — but there is no app-level datastore yet, only a CMS. Until one
//    exists, the adapter necessarily operates on the ids the CMS itself
//    hands out (Sanity's `_id`, a future WordPress post/attachment id) —
//    what the domain types call `cmsDocumentId`/`cmsAssetId`. Parameters are
//    named accordingly so this isn't ambiguous at the call site.
//
// 3. Absence vs. failure is not the same outcome. `getPage` returns `null`
//    for "no page at this slug" — a normal, expected result every caller
//    must handle. Every method throws for actual failures (network error,
//    auth failure, a write against an id that doesn't exist). This mirrors
//    the convention already established by `src/sanity/client.ts`'s
//    `fetch()`: the adapter doesn't swallow errors into a return value,
//    callers decide how to render a failure (see `/pages`'s try/catch).
//
// 4. Content-shape translation is entirely the adapter's problem. The
//    generic `ContentBlock[]` (heading/paragraph/cta/image/content string)
//    is what this interface trades in; converting that to and from a
//    specific CMS's native content format — Sanity's Portable Text `body`,
//    WordPress's Gutenberg blocks — happens only inside that adapter's
//    implementation. No trace of Portable Text belongs here, even though
//    it's how the current Sanity schema actually stores a body (SPEC.md §4).
export interface CmsAdapter {
  // Agnostic: a paginatable(-in-future) list of this site's pages, cheap
  // enough to render on every load of `/pages`. Every CMS can produce a slim
  // projection of "list the documents of this type" without hydrating full
  // content — this method's return type (`PageSummary`, not `Page`) exists
  // specifically so an adapter isn't forced to over-fetch to satisfy it.
  // Sanity-specific: the GROQ projection that produces `PageSummary` (see
  // `src/sanity/queries.ts`'s `PAGES_LIST_QUERY` for the shape this will
  // become tomorrow) — the interface only promises the resulting shape.
  getPages(): Promise<PageSummary[]>;

  // Agnostic: slug is the CMS-agnostic natural key for "which page" — every
  // CMS in scope (Sanity, WordPress) resolves a page/post by a URL slug, and
  // it's the identifier the rest of the app already navigates with
  // (`/pages/[slug]`). Returns the full `Page`, including hydrated
  // `contentBlocks`/`faqItems`, since a detail view needs all of it.
  // Sanity-specific: resolving `slug` to a document via
  // `slug.current == $slug` and assembling `contentBlocks`/`faqItems` back
  // out of the Portable Text `body` and embedded `faqItems[]` array —
  // entirely inside the adapter.
  getPage(slug: string): Promise<Page | null>;

  // Agnostic: creating a new content document from a data bag is a universal
  // CMS operation; the shape of that bag (`CreatePageInput`) is just `Page`
  // minus what the adapter/CMS assigns itself (see types.ts). Returns the
  // full `Page` as the CMS actually persisted it, not an echo of the input —
  // a CMS is free to assign ids, generate array item keys, or normalize
  // fields, and callers should trust the response over what they sent.
  // Sanity-specific: building a draft document via the Sanity mutate API,
  // generating Portable Text `_key`s for every `contentBlocks` entry, and
  // deciding whether the created document starts as a Studio draft (`drafts.`
  // id prefix) — none of that is a concept this interface exposes.
  createPage(data: CreatePageInput): Promise<Page>;

  // Agnostic: a partial update against an existing document, addressed by
  // the CMS's own id (see design note 2 above) — every CMS supports patching
  // a subset of fields on a document it already has. Returns the full
  // updated `Page`, same reasoning as `createPage`.
  // Sanity-specific: whether this becomes a `patch()` against a draft vs. the
  // published document, and re-serializing any updated `contentBlocks` back
  // into Portable Text — adapter-only.
  updatePage(cmsDocumentId: string, data: UpdatePageInput): Promise<Page>;

  // Agnostic: listing image assets for this site, optionally filtered —
  // `ImageListFilter` currently exposes only `altTextStatus` because that's
  // the one filter SPEC.md's batch alt-text journey actually needs ("filters
  // by missing alt text"). Whether the filter is pushed into the CMS's own
  // query or applied in-memory after fetching everything is invisible here.
  // Sanity-specific: images today live inline in each page's `body` (no
  // standalone `ImageAsset` document type exists — SPEC.md §4), so this will
  // mean a GROQ query across all pages' `body[]` image blocks, not a single
  // asset-library endpoint. That aggregation is the adapter's problem to
  // hide, not something this signature should hint at.
  listImages(filter?: ImageListFilter): Promise<ImageAsset[]>;

  // Agnostic: updating alt text (or its review status) on one image by the
  // CMS's own asset id — the single write the alt-text feature (single or
  // batch, looped) needs. Returns the full updated `ImageAsset`.
  // Sanity-specific: because images are inline rather than standalone
  // documents, "update image `cmsAssetId`" likely means patching a specific
  // array member inside whichever page's `body` references that asset
  // (matched via `asset._ref`), not a single-document patch — a materially
  // harder operation than the interface lets on, which is exactly the point
  // of hiding it here.
  updateImage(cmsAssetId: string, data: UpdateImageInput): Promise<ImageAsset>;
}
