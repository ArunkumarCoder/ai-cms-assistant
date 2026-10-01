# AI CMS Assistant — Spec

Portfolio project: an AI-powered content assistant for CMSs. Sanity first; WordPress is a stretch goal. Built with Next.js (App Router, TypeScript). AI calls run behind a provider-agnostic interface backed by OpenAI, Claude (Anthropic), and Groq.

---

## 1. Product Spec

### Target user

**Primary persona: a dev agency managing content for multiple small-business clients.**

Justification: a solo marketer only ever touches _their own_ site, so the value of the tool is "save me time." An agency manages content across _many_ sites with repeatable, templated needs (new client sites, recurring SEO passes, image libraries that grow every week) — the same AI operations get reused across clients, which is what makes a provider-agnostic, batchable tool actually pay for itself. It also gives the portfolio project a sharper story: multi-site awareness (the `Site` entity), batch operations (batch alt text), and consistent quality bars across sites (SEO scoring) are all agency-shaped problems. A solo marketer is still fully served by the same UI (it just looks like an agency with one client), so nothing is lost by picking the agency as primary.

### Core user journeys

**a) Generate a new page from a brief**

1. User selects a Site, clicks "New Page," and writes a brief (title, target keyword, audience, key points, tone).
2. User picks a page type (e.g., landing page, blog post, service page).
3. App sends the brief to the text-generation AI call and streams back a structured draft: title, meta description, and an ordered list of content blocks (headings, paragraphs, CTA).
4. User reviews the draft inline, edits any block, and either regenerates a single block or accepts the whole draft.
5. User clicks "Save to Sanity as draft."

**Done state:** a new draft `Page` document exists in Sanity with populated `ContentBlock`s, visible in the app's page list with status "Draft," and openable in Sanity Studio for further editing.

**b) Get an SEO score and suggestions for a page**

1. User opens an existing page and clicks "Run SEO Audit."
2. App sends the page's rendered text + target keyword + meta fields to the SEO-analysis AI call.
3. App displays a 0–100 score, a breakdown by category (keyword usage, meta tags, readability, heading structure, internal linking), and a prioritized list of suggestions.
4. User clicks "Apply" on individual suggestions (e.g., "shorten meta description") or dismisses them.

**Done state:** a `SeoAudit` record is saved and timestamped against the page, the score is visible on the page list as a badge, and applied suggestions are reflected in the page content.

**c) Get AI-generated alt text for images (single + batch)**

1. **Single:** user opens an image asset with missing/poor alt text, clicks "Generate Alt Text," reviews the suggestion, edits if needed, and saves.
2. **Batch:** user opens the site's Image Library, filters by "missing alt text," selects some or all, and clicks "Generate All."
3. App sends each image to the vision-capable AI call and returns a suggested alt text per image.
4. User does a quick pass reviewing/editing suggestions in a table view, then bulk-saves.

**Done state:** every processed `ImageAsset` has `altText` populated and `altTextStatus` set to `"ai-generated"` or `"reviewed"`, and the Image Library's "missing alt text" count drops accordingly.

**d) Get AI-generated FAQs for a page (with schema markup)**

1. User opens a page and clicks "Generate FAQs."
2. App sends the page content to the FAQ-generation AI call, which returns 3–8 question/answer pairs relevant to the page topic.
3. User reviews, edits, reorders, or deletes individual FAQ items, and can regenerate a single answer.
4. User clicks "Save," which stores the `FaqItem`s against the page and generates FAQPage JSON-LD schema markup.

**Done state:** the page has an ordered set of `FaqItem`s, a valid FAQPage JSON-LD block is attached to the page's `ContentBlock`s (or a dedicated field), and it validates in Google's Rich Results Test.

---

## 2. Data Model

Sketched as TypeScript interfaces. These live in `types/` in the app; they are our own domain model, not Sanity's generated types — an adapter layer maps between them.

```typescript
interface Site {
  id: string; // our own DB id
  name: string;
  cms: "sanity" | "wordpress";
  sanityProjectId?: string; // Sanity-specific
  sanityDataset?: string; // Sanity-specific
  wordpressUrl?: string; // WordPress-specific (stretch goal)
  createdAt: string;
  updatedAt: string;
}

interface Page {
  id: string; // our own DB id
  siteId: string;
  cmsDocumentId?: string; // maps to Sanity document _id (or WP post ID)
  slug: string;
  title: string;
  metaDescription: string;
  targetKeyword?: string;
  pageType: "landing" | "blog" | "service" | "other";
  status: "draft" | "in-review" | "published";
  contentBlocks: ContentBlock[];
  latestSeoAuditId?: string;
  faqItems: FaqItem[];
  createdAt: string;
  updatedAt: string;
}

interface ContentBlock {
  id: string;
  type: "heading" | "paragraph" | "cta" | "image" | "faq-schema";
  order: number;
  content: string; // plain text or serialized rich text
  metadata?: Record<string, unknown>; // e.g., heading level, CTA href
}

interface SeoAudit {
  id: string;
  pageId: string;
  score: number; // 0-100
  breakdown: {
    keywordUsage: number;
    metaTags: number;
    readability: number;
    headingStructure: number;
    internalLinking: number;
  };
  suggestions: {
    id: string;
    category: string;
    message: string;
    applied: boolean;
  }[];
  createdAt: string;
}

interface FaqItem {
  id: string;
  pageId: string;
  question: string;
  answer: string;
  order: number;
  source: "ai-generated" | "manual";
}

interface ImageAsset {
  id: string;
  siteId: string;
  cmsAssetId?: string; // maps to Sanity asset _id (or WP media ID)
  url: string;
  altText: string | null;
  altTextStatus: "missing" | "ai-generated" | "reviewed";
  usedOnPageIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

### CMS-agnostic vs. Sanity-specific fields

- **CMS-agnostic (live in our own DB only):** `SeoAudit` (entire entity — Sanity has no concept of an SEO score), `FaqItem.source`, `ImageAsset.altTextStatus`, `ImageAsset.usedOnPageIds`, and all `id`/`createdAt`/`updatedAt` bookkeeping fields. These describe _our_ workflow state, not CMS content.
- **Sanity-specific (map directly onto Sanity schema fields):** `Page.cmsDocumentId` ↔ Sanity `_id`; `Page.slug` ↔ Sanity `slug.current`; `Page.title`/`metaDescription` ↔ plain string fields on the Sanity document; `ContentBlock[]` ↔ a Sanity `body` array of block/portable-text objects; `ImageAsset.cmsAssetId` ↔ Sanity `_id` of an `sanity.imageAsset`; `ImageAsset.url` ↔ Sanity's asset `url` field; `FaqItem` list ↔ likely an array field on the Page document in Sanity, or a referenced `faq` document type.
- Fields named `siteId`/`pageId` are always _our_ foreign keys, never CMS IDs — that distinction is what lets one `Page` in our DB be swapped between CMS backends without changing its identity in our system.

### Mapping to WordPress (stretch goal)

The model is designed so no field name assumes Sanity. `Page.cmsDocumentId` would hold a WordPress post ID instead of a Sanity `_id`; `contentBlocks` would serialize to/from Gutenberg blocks (or plain HTML via `the_content`) instead of Portable Text; `ImageAsset.cmsAssetId` would hold a WP attachment ID, and `altText` would map to the attachment's `alt_text` meta field via the WP REST API instead of a Sanity asset field. `SeoAudit` and `FaqItem` stay entirely in our DB either way, written back to WordPress only as rendered content (e.g., FAQ schema injected as a Yoast/Rank Math-compatible meta box, or raw JSON-LD in the post content) since WordPress has no native equivalent. The only code that needs to change per CMS is the adapter layer (`lib/cms/sanity.ts` vs. a future `lib/cms/wordpress.ts`); the domain types and every AI call stay identical.

---

## 3. AI Call & Provider Inventory

**Routing rule of thumb:** Groq for text-only calls (fastest/cheapest for dev-time iteration); OpenAI or Claude for the vision call (alt text), since Groq's vision support isn't guaranteed across its hosted models. All pricing below is a rough estimate as of this writing — **verify against each provider's current pricing page before using these numbers in anything final** (a case study, a client proposal, etc.).

| #   | Call                                      | Purpose                                                    | Vision? | Est. input / output tokens | Default provider     | Est. cost/call     | Schema                                                          |
| --- | ----------------------------------------- | ---------------------------------------------------------- | ------- | -------------------------- | -------------------- | ------------------ | --------------------------------------------------------------- |
| 1   | Page generation                           | Draft title, meta description, content blocks from a brief | No      | ~500 in / ~1,200 out       | Groq (Llama 3.3 70B) | ~$0.0006           | `pageDraftSchema` (`src/lib/ai/schemas/pageDraft.ts`)           |
| 2   | Single-block regeneration                 | Regenerate one block (heading/paragraph/CTA)               | No      | ~300 in / ~250 out         | Groq (Llama 3.3 70B) | ~$0.0001           | `blockRegenerationSchema` (`src/lib/ai/schemas/blockRegeneration.ts`) |
| 3   | SEO scoring & suggestions                 | Analyze page text, produce score + suggestions             | No      | ~1,500 in / ~600 out       | Groq (Llama 3.3 70B) | ~$0.0005           | `seoSuggestionsSchema` (`src/lib/ai/schemas/seoSuggestions.ts`) |
| 4   | Alt text generation (single)              | Describe one image for accessibility/SEO                   | **Yes** | ~300 in (+image) / ~60 out | OpenAI (GPT-4o-mini) | ~$0.006            | `altTextSchema` (`src/lib/ai/schemas/altText.ts`)               |
| 5   | Alt text generation (batch)               | Same as #4, looped per image                               | **Yes** | same per image as #4       | OpenAI (GPT-4o-mini) | ~$0.006 × N images | same as #4, called once per image                               |
| 6   | FAQ generation                            | Produce 3–8 Q&A pairs from page content                    | No      | ~1,200 in / ~700 out       | Groq (Llama 3.3 70B) | ~$0.0006           | `faqListSchema` (`src/lib/ai/schemas/faqList.ts`)               |
| 7   | FAQ schema (JSON-LD) formatting           | Convert FAQ items into valid FAQPage schema                | No      | ~500 in / ~400 out         | Groq (Llama 3.3 70B) | ~$0.0003           | _not yet defined_ — see note below                              |
| 8   | Content quality scoring (optional/future) | Tone/readability check before publish                      | No      | ~1,200 in / ~300 out       | Groq (Llama 3.3 70B) | ~$0.0003           | `qualityScoreSchema` (`src/lib/ai/schemas/qualityScore.ts`)     |

Notes:

- Groq pricing at Llama 3.3 70B rates (~$0.59/M input, ~$0.79/M output) and OpenAI vision pricing at GPT-4o-mini rates (~$0.15/M input, ~$0.60/M output, image tokens billed as ordinary input tokens already included in the API's own `usage.prompt_tokens` — no separate per-image surcharge, unlike this note originally assumed) — both **verified directly against each provider's own current pricing on 2026-09-29** (`src/lib/ai/pricing.ts`'s own top comment has the full note, including a live check of Groq's own deprecation docs after a few third-party aggregators turned up an inaccurate "Llama 3.3 70B is enterprise-only now" claim their own docs don't support). Re-verify again if either model changes.
- Call #7 could be merged into call #6 (have the FAQ call return schema-ready JSON directly) to save a call; kept separate here for clarity of responsibility. Worth revisiting once the AI adapter interface exists — noting as an assumption, flag if you'd rather merge them from day one.

### Estimated total cost — 15-page demo site

Assumptions: each page gets one full generation (#1), one SEO audit (#3), one FAQ generation (#6) + schema formatting (#7), and an average of 3 images each needing alt text (#4/#5). No regeneration retries counted.

| Call                  | Count | Cost/call | Subtotal    |
| --------------------- | ----- | --------- | ----------- |
| Page generation       | 15    | $0.0006   | $0.009      |
| SEO scoring           | 15    | $0.0005   | $0.0075     |
| FAQ generation        | 15    | $0.0006   | $0.009      |
| FAQ schema formatting | 15    | $0.0003   | $0.0045     |
| Alt text (45 images)  | 45    | $0.006    | $0.27       |
| **Total**             |       |           | **≈ $0.30** |

Even doubling every estimate for safety margin, a full 15-page demo site is well under $1 in AI spend under this routing — the alt-text vision calls dominate the cost, which is expected and is the reason the routing rule keeps vision on a paid frontier model while everything else runs on cheap/fast Groq. Per-token rates were verified live on 2026-09-29 (§20) — this estimate is safe to quote as-is until a model changes.

### Structured-output schemas

Every AI-produced shape a feature will consume is defined once, in `src/lib/ai/schemas/`, as a Zod schema — matching the interface's own design intent (`adapter.ts`'s top comment: `generateStructured`'s `schema` parameter is plain JSON Schema, not Zod, specifically so Zod schemas can live one layer above it and get converted at the call site). Each file exports the Zod schema itself (for validating a response), a `z.infer`-derived TS type, and a `z.toJSONSchema()`-derived JSON Schema constant (what actually gets passed into `aiClient.generateStructured`/`generateWithVision`). No provider gets its own copy of a schema — translation into that provider's own function-calling format (OpenAI's `response_format.json_schema`, Anthropic's forced tool-use `input_schema`, Groq's prompt-embedded `json_object` instruction) already happens generically inside each `AiProvider` implementation (`src/lib/ai/providers/`), since all three already accept the same plain JSON Schema object — nothing provider-specific needed to change to support this.

Each schema mirrors the domain type (`src/types/`) it's closest to, minus fields the AI doesn't generate (bookkeeping ids, `order`/array position, user-driven state like `SeoAuditSuggestion.applied`) — see each schema file's own top comment for its specific omissions/additions, including two real gaps this surfaced in the domain model: `SeoAudit` has no field yet for a rewritten meta title/description or keyword gaps (`seoSuggestions.ts`), and alt text's `confidence`/`needsReview` has no equivalent on `ImageAsset` at all (`altText.ts`) — both flagged there rather than silently added to `suggestions` as unstructured text or dropped.

**Not yet covered:** call #7 (FAQ schema/JSON-LD formatting) has no schema yet. Flagged in the table above, not silently absent. Call #2 (single-block regeneration) is now covered — see §9 — by `blockRegenerationSchema`, which reuses `pageDraft.ts`'s `pageDraftBlockSchema` wrapped in an object, exactly as anticipated here.

---

## Open assumptions (flag if you'd rather decide differently)

- Persona: agency-first, marketer-compatible (see justification above).
- FAQ schema call is kept separate from FAQ generation for now; may be merged later.
- WordPress mapping is designed-for but not built; no WP code exists yet.
- Groq model assumed as Llama 3.3 70B; OpenAI vision model assumed as GPT-4o-mini. Either can be swapped without changing the architecture since calls sit behind a provider-agnostic interface.

---

## 4. Sanity Project & Schema (Day 2)

Project ID `nrk18555`, dataset `production`. Studio lives in `studio/` as a **standalone app**, not embedded in the Next.js app at `/studio`. Reasoning: `sanity dev`/`sanity build` run on Vite and are 10–30x faster than compiling the Studio through Next.js; a standalone Studio auto-updates (embedded Studios can't, since Next.js doesn't support the ESM import maps Studio auto-updates rely on); and it keeps the content model decoupled from the frontend app rather than growing website-specific assumptions into it. Run both dev servers side by side: `npm run dev` in `studio/` (localhost:3333) and, once the frontend is wired up, `npm run dev` at the repo root (localhost:3000). CORS is already open for both origins.

### FAQ modeling decision

`faqItem` is a Sanity **object type embedded in an array on `page`** (`page.faqItems[]`), not a standalone document type. Per Sanity's reference-vs-object guidance, references are for content that's reusable across documents, needs independent editing, or must be queried on its own; FAQ items here are always page-specific, are only ever edited in the context of "this page's FAQs," and don't need to be looked up independently. An embedded array also gives ordering and identity for free via Sanity's array `_key`, matching `FaqItem.order` without a dedicated field.

### Divergences from the `types/` TypeScript model (flagged for reconciliation)

- **`contentBlocks` → `body`.** The TS `ContentBlock` interface (generic `type`/`order`/`content`/`metadata` bag) is replaced by an idiomatic Sanity **Portable Text array**: heading/paragraph become standard block styles (`normal`, `h2`, `h3`, `h4`, `blockquote`); `cta` becomes a typed `ctaBlock` object (`text`, `href`, `openInNewTab`); `image` becomes an inline image array member with `alt` and `altTextStatus`. Array position replaces `ContentBlock.order`; each block type's explicit fields replace the generic `metadata: Record<string, unknown>` bag. There is no `faq-schema` block type — the FAQPage JSON-LD is generated by the app from `faqItems` at render/build time, not authored as Studio content.
- **SEO fields.** TS `Page` has a single flat `metaDescription` string. The schema instead nests `seo: { metaTitle, metaDescription }` — `metaTitle` is a new field not present in the TS interface, added because the task called for both a meta title and meta description as distinct editorial fields.
- **`qualityScore`.** New `number` field on `page`, not present in the TS `Page` interface. It's a denormalized snapshot of the latest SEO/quality score, computed later by the SEO-audit AI call — not a replacement for `SeoAudit`. The full `SeoAudit` entity (breakdown, suggestions, history) is intentionally **not** modeled in Sanity; per this spec's original CMS-agnostic/Sanity-specific split, it continues to live in the app's own DB.
- **Bookkeeping fields dropped from the Sanity schema.** `Page.id/siteId/cmsDocumentId/latestSeoAuditId/createdAt/updatedAt`, `ImageAsset.id/siteId/cmsAssetId/usedOnPageIds/createdAt/updatedAt`, `ContentBlock.id/order`, and `FaqItem.id/pageId/order` are app-DB bookkeeping, not CMS content — Sanity's own `_id`/`_createdAt`/`_updatedAt` and array `_key`/position cover the CMS-side equivalents, exactly as this spec's "CMS-agnostic vs. Sanity-specific fields" section anticipated. `FaqItem.source` is kept as a real field since it's workflow state (ai-generated vs. manual), not bookkeeping.
- **No standalone `ImageAsset` document type.** Images are modeled wherever they're used (currently: inline in `body`), using Sanity's native `image` type (hotspot enabled) plus custom `alt` and `altTextStatus` (`missing`/`ai-generated`/`reviewed`) fields — this is what the alt-text batch feature needs at the point of use. Cross-page usage (`usedOnPageIds`) and a library-wide "missing alt text" view are query/app-DB concerns (GROQ's `references()` can compute usage later), not schema concerns.

---

## 5. Next.js ↔ Sanity Integration (Day 3)

`/pages` (list) and `/pages/[slug]` (detail) are real Server Components reading live from the `production` dataset via `src/sanity/client.ts`, `src/sanity/queries.ts`, and `src/sanity/image.ts`. No AI code yet — this is read-only wiring.

### Caching: no caching, on purpose

The Sanity client is created with `useCdn: false`, and every `client.fetch()` call passes `{ cache: "no-store" }`. That means **every request hits the live Sanity API directly** — no CDN cache window, no Next.js Data Cache, no ISR revalidation delay. Chosen over ISR/time-based revalidation because this app is, at this stage, effectively a CMS content review tool: an editor (or this app's own AI features, later) changes a document in Studio and expects to see the result on the next page load, not after a 30–60s revalidation window. The cost — every request re-fetches from Sanity — is a non-issue at this project's scale, and is the same tradeoff `useCdn: false` recommends for anything that isn't high-traffic public delivery. Revisit with tag-based revalidation + webhooks (see `nextjs.md`'s Sanity integration notes) once/if this app serves real traffic rather than being used for content review.

Verified live end-to-end: mutated a sample document's `title` directly (the same effect as editing + publishing in Studio), reloaded `/pages` in the running dev server with no restart, saw the new title immediately, then reverted it. Also verified: an empty result set renders the empty-state message, and a deliberately broken query renders the error-state message instead of a 500/crash — both tested by temporarily editing `queries.ts`, confirming the render path, then restoring the real queries.

### Content states covered

- **Empty dataset:** `/pages` shows "No pages yet."
- **Missing optional fields:** a real sample page (`new-client-onboarding-checklist`) has no `seo`, no `qualityScore`, and no `faqItems` — the detail view shows "No SEO fields filled in yet." / "No FAQs yet." instead of blank or broken sections.
- **Sanity request failure:** both routes wrap their fetch in try/catch and render an inline error message with the underlying error text instead of throwing (which would otherwise trigger Next's default error page).
- **Missing alt text:** one sample image block was seeded with `altTextStatus: "missing"` and a blank `alt`; the detail view renders it and flags the status, which is exactly the signal the alt-text batch feature will need to find candidates later.

---

## 6. CMS Adapter Interface (Day 4)

`CmsAdapter` (`src/lib/cms/adapter.ts`) is the interface every CMS backend must satisfy — Sanity today, WordPress as the stretch goal — so that adding a second CMS is a new adapter file, not a rewrite of the app. Interface only as of Day 4; no implementation exists yet (`src/lib/cms/index.ts` still doesn't wire anything up, and nothing in the app calls this interface yet). Supporting shapes live in `src/lib/cms/types.ts`, all derived from the Day 1 `types/` domain model via `Omit`/`Pick`/`Partial` rather than a second parallel model.

```typescript
interface CmsAdapter {
  getPages(): Promise<PageSummary[]>;
  getPage(slug: string): Promise<Page | null>;
  createPage(data: CreatePageInput): Promise<Page>;
  updatePage(cmsDocumentId: string, data: UpdatePageInput): Promise<Page>;
  listImages(filter?: ImageListFilter): Promise<ImageAsset[]>;
  updateImage(cmsAssetId: string, data: UpdateImageInput): Promise<ImageAsset>;
}
```

### Key decisions (full reasoning is written as comments on the interface itself)

- **One adapter instance per `Site`, not a `siteId` parameter on every call.** `Site` already carries per-backend config (`sanityProjectId`/`sanityDataset`, later `wordpressUrl`), so an adapter is constructed once against one site's backend — matching how `src/sanity/client.ts` is already a single client bound to one project+dataset. Multi-site support means the app holds one adapter instance per `Site`, not threading `siteId` through every method.
- **Write methods take the CMS's own document/asset id, not `Page.id`/`ImageAsset.id`.** Those domain fields are defined in §2 as "our own DB id," but no app-level datastore exists yet — only a CMS. Until one does, `updatePage`/`updateImage` necessarily operate on what the CMS hands out (Sanity's `_id`), so parameters are named `cmsDocumentId`/`cmsAssetId` to make that explicit rather than ambiguous.
- **`getPages()` returns `PageSummary`, not `Page`.** A list view doesn't need every page's full body/FAQs hydrated, and forcing that would push every adapter toward a worse query than the UI needs (the existing `PAGES_LIST_QUERY`/`PageListItem` in `src/sanity/types.ts` already does exactly this projection). `PageSummary` is `Page` minus `contentBlocks`/`faqItems`, plus a `faqCount`.
- **`null` means "not found," not failure.** `getPage` returns `null` for a missing slug — an expected outcome every caller handles — while every method throws on an actual error (network/auth/a write against a stale id), matching the existing convention in `src/sanity/client.ts` and the `/pages` routes' try/catch.
- **Content-shape translation is adapter-only, never interface-visible.** The interface trades exclusively in the generic `ContentBlock[]`; converting that to/from Sanity's Portable Text `body` (or, later, WordPress Gutenberg blocks) happens entirely inside each adapter. No Portable Text concept appears on `CmsAdapter` or its supporting types.
- **`listImages`/`updateImage` hide a harder-than-they-look Sanity reality.** Since no standalone `ImageAsset` document type exists (§4 — images live inline in each page's `body`), the Sanity adapter's `listImages` will mean querying across every page's body for image blocks, and `updateImage` will mean patching a specific array member inside whichever page references that asset — not a single-document read/write. The interface deliberately gives no hint of this; hiding it is the point.

Not yet decided (left for the Sanity adapter, Day 5): how `createPage`/`updatePage` choose between writing a Studio draft vs. the published document, and whether `getPages`/`listImages` should support pagination once the sample dataset outgrows a single page of results.

---

## 7. Sanity Adapter Implementation (Day 5)

`SanityAdapter` (`src/lib/cms/sanityAdapter.ts`) is the first real implementation of `CmsAdapter` — first write traffic in this project, and the first time `/pages`/`/pages/[slug]` go through the adapter instead of calling `src/sanity/client.ts` directly. It's constructed with one `Site` and one injectable client (`SanityQueryClient`, a narrow interface covering just `fetch`/`create`/`patch`, so unit tests pass a plain mock instead of the real Sanity client). No app-level `Site` datastore exists yet, so the app currently wires up a single placeholder `Site` (`src/lib/cms/defaultAdapter.ts`) rather than anything multi-site.

Implementing it for real surfaced four gaps in the Day 4 design that weren't visible on paper. All fixed rather than worked around:

1. **`Page` had no field for `qualityScore`.** SPEC.md §4 flagged this as a schema divergence back on Day 2, but nobody reconciled it into the Day 1 domain model, so `PageSummary`/`Page` (both derived from it via `Omit`) had no way to carry a score the live UI already displayed. Fixed: added `qualityScore: number | null` to `Page` (§2), omitted it entirely from `CreatePageInput` (a new page always starts with no score, same treatment as `latestSeoAuditId` — both are written later by the not-yet-built SEO-audit feature, not through `updatePage`).

2. **`Page.id`/`ImageAsset.id` ("our own DB id") have no source on reads.** CmsAdapter's design note 2 only anticipated this for write-method parameters (`cmsDocumentId`/`cmsAssetId`); `getPages`/`getPage`/`listImages` still have to return a full `Page`/`ImageAsset` with a required `id`, and there's no app datastore to assign one independently. Stopgap: `id` is set equal to the Sanity-native id (`_id` for pages, an imageBlock's `_key` for images) until a real app datastore exists. `siteId` was already solvable — the adapter is bound to one `Site` at construction, so it just uses `site.id`.

3. **Images have no single owning identity, and the interface's own guess about how to address one was wrong.** There's no standalone `ImageAsset` document (§4) — `alt`/`altTextStatus` live per _usage_ (per imageBlock instance inside a page's `body`), not per underlying asset, so the same binary image reused on two pages can carry two different alt texts. `updateImage`'s own comment on the interface speculated matching by `asset._ref`; implementation showed that's wrong — the adapter addresses images by the imageBlock's own `_key` instead (one row per usage), which is what `listImages`/`updateImage` actually need. Consequence: `usedOnPageIds` is always a single page for now; deduping a reused asset across pages into one logical `ImageAsset` isn't attempted.

4. **`ContentBlock[]` ⟷ Portable Text translation is lossy, and one `ContentBlock` type has no Sanity representation at all.** `ContentBlock.content` is a single plain string; Sanity's Portable Text `block` type carries multiple spans with marks (bold/italic/links). Reading a page strips marks to plain concatenated text; writing a page always produces mark-free spans — round-tripping through this adapter loses inline formatting. This is why `/pages/[slug]`'s renderer (`src/components/ContentBlocks.tsx`, replacing the old Sanity-specific `PageBody.tsx`) is visibly simpler than before: it can no longer lean on `next-sanity`'s `<PortableText>` component, because `CmsAdapter` never exposes Portable Text above the adapter boundary (by design — see CmsAdapter's decision 4). Separately, `ContentBlock`'s `"faq-schema"` type has no Sanity content type to translate to or from — matches §4's original decision that FAQ JSON-LD is generated by the app from `faqItems` at render time, never authored as body content — so `contentBlocksToPortableText` throws if asked to translate one rather than silently dropping it.

Two smaller fixes made along the way, not interface changes but worth recording:

- **Studio's `body` field required `.min(1)`.** `CreatePageInput.contentBlocks` is deliberately allowed to default to `[]` (§6: "a page can be created from a brief before content blocks exist"), which a `min(1)` rule would reject outright. Relaxed to `Rule.required()` in `studio/schemaTypes/page.ts` — the field must still exist, just not be non-empty.
- **Reads must not require a write token.** The adapter's single client (`src/sanity/writeClient.ts`) originally required `SANITY_API_TOKEN` just to construct, which broke `getPages`/`getPage` (no writes involved) as soon as that env var was unset. Fixed: the token is optional at construction; only `projectId`/`dataset` are required (this dataset is public, so reads work with no token at all), and an actual write attempted without a token now fails naturally with Sanity's own 401 — matching `CmsAdapter`'s "every method throws on real failures" convention rather than blocking reads pre-emptively.

Testing: `src/lib/cms/sanityAdapter.test.ts` (Vitest, `npm test`) covers a successful read (`getPages`, `getPage`), a successful write (`createPage`, `updatePage`) including asserting the translated document sent to Sanity, a validation failure that never reaches Sanity, a mutation rejected by Sanity propagating rather than being swallowed, `listImages`/`updateImage` (including the not-found case), and the Portable-Text-translation functions directly. The client is injected as a plain mock object (`SanityQueryClient`), not a mocked module — no env vars needed to run the suite.

---

## 8. Auth, Accounts & Per-User Site Connection (Day 6)

Everything through Day 5 pointed at one hardcoded Sanity project from `.env` (`src/lib/cms/defaultAdapter.ts`). Day 6 replaces that with real accounts: `/pages`/`/pages/[slug]` now resolve which Sanity project to query from the logged-in user's own connected `Site` row, not from env. No sidebar/site-switcher UI yet (a user's _first_ connected Site is used) — that's the next piece of work, and the schema already supports more than one Site per user without changes.

### Auth library and provider choice

**NextAuth (Auth.js v5, `next-auth@beta`) with the Credentials provider (email/password), not OAuth.** Two reasons:

- The task brief left the provider choice open ("your call"). Credentials means a reviewer can clone this repo and create an account locally with any email — no OAuth app to register with GitHub/Google first, no callback URL to configure. OAuth would be the better real-world default for a multi-tenant SaaS, but it adds setup friction that doesn't pay for itself in a portfolio project meant to be run cold.
- Session strategy is **JWT, not database**. Auth.js only supports database-backed sessions through an `Adapter`, and the Credentials provider's `authorize()` callback is explicitly incompatible with adapter-backed sessions (Auth.js's own restriction) — the session has to carry its claims in a signed JWT. `src/auth.ts`'s `jwt`/`session` callbacks thread the app's own `User.id` (Prisma, not Auth.js's) onto the token/session so the rest of the app can look up "this session's user" without a second lookup table.

Version note: `next-auth@beta` (5.0.0-beta.32 as of this writing) was confirmed via `npm view next-auth@beta peerDependencies` to declare `next: ^14.0.0-0 || ^15.0.0 || ^16.0.0` — i.e. it already targets this project's Next 16 before hitting `npm install`, not discovered after the fact.

### Next.js 16: Middleware is now Proxy

Per `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`: "Starting with Next.js 16, Middleware is now called Proxy." Same mechanism, new file convention — `src/proxy.ts` (not `middleware.ts`), exporting a default function and (optionally) a `config.matcher`. `src/proxy.ts` wraps Auth.js's `auth()` to redirect unauthenticated requests to `/pages`/`/sites/*` to `/login?callbackUrl=...`, matching the pattern in Next's own auth guide (`02-guides/authentication.md`) almost exactly, just renamed.

This is deliberately only the **optimistic** check the Next.js auth guide describes — cookie-based, no DB round trip, because Proxy runs on every matched request including prefetches. `src/lib/auth/dal.ts`'s `requireUser()` is the real check: every protected Server Component calls it directly (not just relying on Proxy having run), matching `node_modules/next/dist/docs/01-app/02-guides/data-security.md`'s explicit warning that a page-level/Proxy-level check does not extend to Server Actions or guarantee every render path was covered — `connectSiteAction` also calls `requireUser()` itself rather than trusting that only the (already-guarded) connect page could have reached it.

### Data model: a real `User`/`Site` datastore (Prisma + SQLite)

Prisma was added purely for this — SQLite as the provider, a single `dev.db` file, zero external database service to stand up for a local/demo-scope app. Schema (`prisma/schema.prisma`):

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  sites        Site[]
}

model Site {
  id                    String   @id @default(cuid())
  userId                String
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name                  String
  cms                   String   @default("sanity")
  sanityProjectId       String
  sanityDataset         String
  sanityTokenCiphertext String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

`Site` mirrors §2's domain interface plus `userId` (ownership) and `sanityTokenCiphertext` (see below) — the domain type in `src/types/site.ts` gained `userId` too, but deliberately never gains a token field; only `src/lib/cms/resolveAdapter.ts` ever turns a DB row into the plain `Site` + a live Sanity client together.

**Prisma 7 vs. 6:** `npm install -D prisma@7` (the current stable major at time of writing) installed cleanly, but `prisma generate` immediately failed schema validation — Prisma 7 removed `datasource { url = env(...) }` support in favor of a `prisma.config.ts` + explicit driver-adapter package (e.g. `@prisma/adapter-better-sqlite3`) passed to the `PrismaClient` constructor. That's a real, deliberate breaking change in 7.x, not a mistake — but it adds a dependency and a second config file for no benefit here. Downgraded to the latest 6.x (`6.19.3`, still a fully-supported stable release, confirmed via `npm view prisma versions`) to keep the simple `url = env("DATABASE_URL")` form. Worth reconsidering if/when this app needs a driver adapter for another reason (e.g. Postgres via Accelerate).

**Gotcha:** the Prisma CLI (`prisma migrate`, `prisma generate`) only loads a plain `.env` file, not `.env.local` — that's a Next.js-specific convention Prisma doesn't know about. A root `.env` containing just `DATABASE_URL="file:./dev.db"` was added alongside `.env.local` (which carries the same value, plus everything else) so both the CLI and the running app agree. `prisma/*.db`/`*.db-journal` are gitignored — the file contains real password hashes and encrypted tokens even in dev.

### Storing a third-party API credential: encrypted, not hashed, and why

A connected Site's Sanity API token has to come back out in plaintext on every read/write — unlike a password, it can't be one-way hashed. Storage (`src/lib/crypto/siteToken.ts`): **AES-256-GCM**, key from a new `SITE_TOKEN_ENCRYPTION_KEY` env var (32 bytes, base64, generated with `openssl rand -base64 32`, gitignored like all secrets). Each encryption call gets a fresh random 96-bit IV; the stored value is `base64(iv).base64(authTag).base64(ciphertext)` — one opaque string in `Site.sanityTokenCiphertext`. GCM's auth tag means a tampered/corrupted ciphertext throws on decrypt instead of silently handing a garbage string to Sanity as a bearer token. `decryptSiteToken` is called in exactly one place (`resolveAdapter.ts`, building the per-request Sanity client) — nowhere else in the app ever sees the plaintext token, including the connect-site UI after the initial save.

Account passwords use a separate, deliberately different mechanism (`src/lib/auth/password.ts`): Node's built-in `crypto.scrypt`, salted, one-way, constant-time compared on verify (`timingSafeEqual`) — not bcrypt/argon2, to avoid a native-addon dependency that needs a working node-gyp toolchain (a real source of Windows dev-machine friction this project has already hit once, per [[sanity-adapter-day5]]'s vitest install gotcha). scrypt is Node's own recommended KDF for this and needed no extra dependency.

### The "connect a Sanity project" flow

`src/app/sites/connect/page.tsx` + `src/lib/cms/connectSiteAction.ts` (a Server Action). Takes a site name, Sanity project ID, dataset, and API token; before saving anything, it builds a throwaway `SanityAdapter` against exactly those values and makes one real call through it (`getPages()`) — a wrong project ID, wrong dataset, or bad/expired token all surface here as a real Sanity API error message, not as a saved-but-broken Site discovered on next use. Only on success is the token encrypted and the Site persisted, owned by the current session's `user.id`.

### Per-user adapter resolution

`src/lib/cms/resolveAdapter.ts` replaces `defaultAdapter.ts`'s singleton. `getAdapterForCurrentUser()`: reads the session, looks up that user's oldest `Site` row, decrypts its token, constructs a `next-sanity` client bound to _that_ project/dataset/token, and returns a `SanityAdapter` wrapping it — throwing a distinguishable `NoSiteConnectedError` (not a generic error) when the user has no Site yet, so `/pages` can render a "connect a project" prompt instead of an error box. `/pages` and `/pages/[slug]` both call this instead of importing a module-level adapter constant, which is the actual "one demo project → any user's project" change this task asked for.

### Failure cases handled

- **Wrong/expired Sanity token, or wrong project/dataset:** rejected at connect-time by the real validation call above (verified live against the actual Sanity API with an intentionally invalid token — see Testing below), never silently saved.
- **No Site connected yet:** `/pages`/`/pages/[slug]` catch `NoSiteConnectedError` specifically and render/redirect to `/sites/connect` rather than throwing.
- **Expired/tampered session:** `src/proxy.ts` redirects to `/login` when Auth.js can't decode the session cookie (verified by sending a garbage cookie value directly); `requireUser()` provides the same redirect for any request that reached a Server Component without going through Proxy.
- **Wrong login credentials / duplicate signup email / weak password:** handled as form errors returned from the Server Actions (`src/lib/auth/actions.ts`), not thrown exceptions — verified live (see below).

### Testing

Unit (Vitest, `npm test`): `src/lib/crypto/siteToken.test.ts` (round-trip, tamper detection via a flipped ciphertext byte, missing/malformed key), `src/lib/auth/password.test.ts` (hash/verify round-trip, wrong password, malformed stored hash), `src/lib/cms/connectSiteAction.test.ts` (mocked `SanityAdapter` — asserts the validate-then-encrypt-then-persist-then-redirect order, that a failed validation call never reaches `prisma.site.create`, and that an obviously malformed project ID is rejected before any network call).

Live, end-to-end against the running dev server (no browser automation available in this environment — same constraint as [[nextjs-sanity-integration]]'s Day 3 verification; curl was used instead, submitting real multipart form POSTs including the hidden `$ACTION_*` fields Next.js renders into a Server-Action-bound `<form>` for progressive enhancement): signup issues a real session cookie and Prisma `User` row; a fresh account with no Site sees the "connect a project" empty state; connecting with an intentionally wrong token _and_ with a nonexistent project ID both fail with the real Sanity error surfaced in the form, and neither leaves a `Site` row behind; wrong password and duplicate-email signup both return form errors with no session issued; logout clears the session cookie and blocks `/pages` again; a garbage session cookie is rejected the same way an expired one would be.

**Not verified live:** a successful connect with a genuinely valid Sanity token — no write-capable token exists in this environment (per [[sanity-adapter-day5]], generating one requires an interactive dashboard session at manage.sanity.io that this environment can't drive). That path is covered by the mocked unit test above instead; a real end-to-end check needs a human to paste in an actual project token.

---

*(Days 7–9's work — the app shell/site-switcher, empty/loading/error states + first staging deploy, and the structured-output schemas in §3 above — shipped in git history but was never written back into this running log. Not backfilled here; picking numbering up at Day 10.)*

## 9. Generate Page: Persistence & Block Regeneration (Day 10)

The first feature to actually call through `src/lib/ai/` — `/pages/new` (`src/app/(app)/pages/new/page.tsx` + `src/components/GeneratePageForm.tsx`) takes a brief (title, target keyword, audience, tone, key points, page type), runs it through call #1 (`generatePageDraftAction`, `src/lib/pages/`), and renders the returned draft as editable blocks held in local state. Saving persists it into Sanity through `CmsAdapter.createPage`/`updatePage` — never a direct Sanity call from a component — and a per-block "Regenerate" action re-runs call #2 for just that block.

### No new field needed for "draft" state

The task called for saving the draft in "a clear draft/unpublished state distinct from published." `Page.status` (§2) already covers this end-to-end — the Sanity schema (`studio/schemaTypes/page.ts`) already defaults it to `'draft'`, and `SanityAdapter.createPage` already defaults to `"draft"` when `status` is omitted (Day 5). `saveDraftPageAction` deliberately never passes `status` on create, so that one existing default stays the single source of truth instead of a second hardcoded `"draft"` drifting out of sync with it.

### Regenerating one block still means writing the whole `body` array

`CmsAdapter.updatePage`'s `contentBlocks`, when provided, replaces the entire body — there is no narrower "patch one array item" method on the interface (by design, per §6: content-shape translation is adapter-only, and the interface doesn't expose Portable Text's array-item addressing). So "regenerate this block, leave the rest of the page untouched" is implemented one layer up: `regenerateBlockAction` merges the newly-generated block into a full copy of the current `contentBlocks` (same `id`/order for every other entry) and calls `updatePage` with that whole array. The *write* touches the whole array; the *content* doesn't — every other block's value is byte-for-byte what it was.

This only auto-persists once the page has already been saved once (`cmsDocumentId` is known). Before the first save, a regeneration only updates the client's local state — there's nothing to persist to yet, and requiring a save first would just be the same "Save" click happening twice.

### `blockRegenerationSchema` reuses `pageDraftSchema`'s block union — with one gap schema validation can't close

`src/lib/ai/schemas/blockRegeneration.ts` is `z.object({ block: pageDraftBlockSchema })`, exactly what §3's original note anticipated. What it can't enforce: that a targeted "rewrite this heading" call actually came back as a heading — the discriminated union validates *some* valid block, not *the same kind* the caller asked to regenerate. `regenerateBlockAction` compares `result.block.type` against the original block's type itself and discards a mismatch as a failure, before any persistence is attempted.

### Edge cases: hand-edited blocks, and a regenerate call that fails

Each draft block tracks an `edited` flag, set on any manual change in `DraftBlockEditor` and cleared on any AI-sourced write (initial generation or a successful regeneration). Clicking "Regenerate" on an `edited` block gates through a `window.confirm` before the call goes out — no extra dependency, consistent with this project's plain-HTML-forms style elsewhere. A failed regenerate call (AI error, type mismatch, or the persisting `updatePage` throwing after a good regeneration) returns `{ error }` rather than `{ block }`; the client only ever replaces a block's content on a full success, so a failure always leaves the block exactly as it was rather than blanking it out.

### Scope boundary: one continuous session, not a reopenable editor

There's no route to load an already-saved page back into this editable draft screen — `/pages/new` is a one-way session (brief → draft → regenerate/save), matching SPEC.md journey (a)'s own framing. Regenerating a block only works while that session's local state is still in memory. Revisiting an already-saved draft to keep refining it is a real gap, not an oversight, and would need its own route (`/pages/[slug]/edit` or similar) rehydrating the same `GeneratePageForm` state shape from a fetched `Page` — left for later since nothing in this task asked for it.

### Testing

Unit (Vitest, `npm test`): `src/lib/pages/slugify.test.ts`, `prompt.test.ts` (pure functions, no mocking), `mapping.test.ts` (block↔ContentBlock translation), `src/lib/ai/schemas/blockRegeneration.test.ts` (mirrors `pageDraft.test.ts` — validates a well-formed response, rejects an unknown block type, and documents that a type-swapped-but-otherwise-valid block passes schema validation, since that check is the action's job, not the schema's), and `generatePageDraftAction.test.ts`/`saveDraftPageAction.test.ts`/`regenerateBlockAction.test.ts` (mocked exactly like `connectSiteAction.test.ts` — no live AI/Sanity credentials exist in this environment, confirmed by `.env.local` having every AI provider key present but empty). The regenerate-action suite specifically covers: no-`cmsDocumentId` returns the block without ever calling `updatePage`; a present `cmsDocumentId` calls `updatePage` once with only the target index changed; an AI failure, a type mismatch, and a persistence failure after a good regeneration all return `{ error }` without a partial success; and an unknown `targetBlockId` short-circuits before any AI call at all.

**Not verified live:** actual generation — no `GROQ_API_KEY`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY` is set in this environment. What *was* verified live: `next build` compiles the new route/actions with no type errors, and an unauthenticated request to `/pages/new` redirects to `/login?callbackUrl=%2Fpages%2Fnew`, matching every other route under `(app)`.

---

*(Days 11–13's work — per-site brand voice threaded into every generation prompt, the deterministic SEO analysis module in `src/lib/seo/`, and AI-assisted SEO suggestions layered on top of it — shipped in git history but was never written back into this running log, same gap already noted above for Days 7–9. Not backfilled here; picking numbering up at Day 14.)*

## 10. Composite Quality Score (Day 14)

The single number the project's headline feature was always building toward: one 0–100 score per page, combining SEO copy quality, readability, and structural completeness, with a full breakdown so the number is never shown without an explanation. Implemented in `src/lib/quality/score.ts` (`computeQualityScore`) — deterministic, no AI call, reusing `src/lib/seo/`'s own checks rather than re-deriving them.

### Reusing, not duplicating, the Day 10 AI schema

`src/lib/ai/schemas/qualityScore.ts` already defined this exact shape back on Day 10 — `{ score, subScores: { seo, readability, structure } }`, each sub-score a `{ score, reason }` pair — as the not-yet-built AI call #8 ("content-quality," flagged "optional/future" in §3's table). Rather than inventing a second, parallel shape for a deterministic version, `computeQualityScore` returns exactly that type (`QualityScore`/`QualitySubScore`) and re-validates its own output against `qualityScoreSchema` before returning — the same belt-and-suspenders pattern the AI actions use for a provider's own JSON, except here it's catching a bug in this file's own weighting arithmetic rather than a bad model response. Call #8 itself is still unbuilt; if it's ever added, it would produce the same shape via a different (AI, not rule-based) computation.

### How the composite is calculated

**Composite = 40% seo + 30% readability + 30% structure**, with one exception below. SEO copy (title, meta description, keyword usage) is weighted highest because it's the most directly actionable, fully deterministic signal a page owner can fix in one field edit; readability and structure both shape on-page experience for a reader and split the remainder evenly.

- **seo sub-score** = 30% title length + 30% meta description length + 40% keyword density, reusing `checkTitleLength`/`checkMetaDescriptionLength`/`checkKeywordDensity` from `src/lib/seo/checks.ts` directly — same checks, same 0/20/60/100 scores, same reason text the SEO checklist UI already shows. Keyword density gets the largest single weight (it's the strongest ranking-relevant signal of the three) but is entirely excluded from the sub-score — not scored as a failure — when no target keyword is set on the page, its weight redistributed across the other two. This mirrors `analyzeSeoContent`'s own not-applicable handling (§ src/lib/seo/analyze.ts) rather than inventing a second convention for the same idea.
- **readability sub-score** = the actual Flesch reading-ease score (`fleschReadingEase`), clamped to 0–100, not `checkReadability`'s coarser pass/warn/fail bucketing (100/60/20) — the composite wants the continuous number, not a rounded-off category. Its `reason` still reuses `checkReadability`'s own generated sentence rather than writing new copy for the same fact.
- **structure sub-score** = 30% heading hierarchy (`checkHeadingHierarchy`) + 25% content depth (new) + 25% FAQ presence (new) + 20% image alt-text coverage (new). FAQs and alt text have no equivalent check in `src/lib/seo/checks.ts` (they aren't SEO-copy concerns), so this module adds two small, consistently-styled checks for them: FAQ absence is a mild nudge (score 70), never a hard failure or an exclusion, since every page can add FAQs whether or not it currently has any; alt-text coverage is excluded entirely (not penalized) when the page has no image blocks at all, same not-applicable treatment as keyword density. Content depth (body word count, bucketed <40/<120/120+ words) exists because heading hierarchy alone isn't enough to catch a genuinely empty page — see below.

### Two fixes made after testing against this project's own seeded demo pages, not just synthetic ones

Running the composite against the three real pages already seeded in the `production` dataset (the flagship landing page, the meta-description how-to blog post, and the deliberately-blank onboarding-checklist placeholder from §5's "missing optional fields" demo) surfaced a real problem before this shipped: **the richest, most complete demo page scored *lower* than the blank placeholder stub.** Two root causes, both fixed rather than patched over with an arbitrary constant:

1. **`checkHeadingHierarchy` alone can't tell "no errors" from "well-structured."** A page with zero headings and zero body copy has no hierarchy *violations* to report, so it scored a trivial "pass" (100) — exactly as well as a page with a real, well-organized heading structure. Fixed by adding a **content depth** component (25% of the structure sub-score) based on body word count, which is what actually distinguishes an empty stub from a real page — heading hierarchy still contributes, just no longer as the sole or dominant structural signal.
2. **Flesch reading-ease is a noisy signal on very short text.** A one- or two-sentence page can land anywhere from "very easy" to "difficult" depending on a single sentence break — not a meaningful verdict on a page that barely has content yet, but it was still getting the readability sub-score's full 30% composite weight regardless of sample size. Fixed by excluding readability from the **composite** (not from display — it's still computed and shown, with a note, for transparency) when body text is under `MIN_READABILITY_WORDS` (80 words), redistributing its weight to seo/structure — the same renormalize-on-exclusion pattern every other not-applicable component in this module already uses.

After both fixes, the three real demo pages score 69 (flagship landing page — correctly dinged for a target keyword that literally never appears in the copy, thin body text, and one image missing alt text), 74 (the blog post — the best-rounded real content of the three), and 63 (the blank placeholder — correctly lowest, flagged for thin content and no FAQs). That ordering and those reasons are legible on their own, which is what step 5 of this task asked to confirm before moving on — no further weight tuning was needed once these two gaps were closed.

### Breakdown UI

`src/components/QualityScorePanel.tsx` renders the composite score front and center (large, color-coded number) with each sub-score directly below it — its own 0–100 score, a small progress bar, and its `reason` sentence. No sub-score (and no composite score) is ever rendered without its reason alongside it. Wired into `SeoPanel.tsx` (the page detail screen), computed live via `useMemo` from the same in-editing `title`/`metaDescription`/`targetKeyword` state `analysis`/`SeoChecklist` already use — so it reflects what "Save changes" is about to persist, not yesterday's saved snapshot. `contentBlocks`/`faqItems` aren't editable from that screen, so only the SEO fields ever move it before a save.

### Persistence

`Page.qualityScore` (added Day 5, §7 point 1) already existed as a denormalized snapshot field with nowhere that wrote to it. `CreatePageInput`/`UpdatePageInput` (`src/lib/cms/types.ts`) originally excluded `qualityScore` entirely ("written later by the not-yet-built SEO-audit feature") — now that a deterministic, synchronous-to-compute version of that feature exists, it's optional on both instead of permanently absent. `saveDraftPageAction` (used by both `/pages/new`'s first save and `SeoPanel`'s "Save changes") computes the composite score from exactly the content it's about to persist and includes it in the same `createPage`/`updatePage` call — one write, no separate round trip, and the persisted number always matches that save's own content rather than being re-derived from a possibly-stale re-fetch. `SanityAdapter` validates it's a number in [0, 100] or `null` before writing, same convention as every other adapter-level input check.

This only recomputed on an explicit save from inside `saveDraftPageAction`, per that day's scope — always recomputing on every write automatically, and keeping a score history rather than only the latest snapshot, is §11 below.

## 11. Auto-Scoring and Score History (Day 15) — closes Phase 3

Day 14 left a real gap: only `saveDraftPageAction` bothered to compute a score, so `regenerateBlockAction`'s own auto-persist (writing a regenerated block straight to Sanity once a page is already saved) left `Page.qualityScore` stale until the next manual "Save changes." A future "publish" action (still unbuilt — no route or UI anywhere in this app currently changes `Page.status`) would have needed the same computation copy-pasted a third time. Day 15 moves scoring off individual Server Actions entirely and onto the one place every content write already passes through: `CmsAdapter.createPage`/`updatePage`.

### The auto-scoring adapter wrapper

`withQualityScoring` (`src/lib/quality/autoScore.ts`) wraps any `CmsAdapter` — deliberately typed against the interface, not `SanityAdapter` directly, so a future WordPress adapter gets identical auto-scoring behavior for free, the same CMS-agnostic boundary `CmsAdapter` itself was designed around (§6). Its `createPage`/`updatePage` call straight through to the wrapped adapter first, then immediately re-score from *that call's own returned `Page`* — not the caller's input — with one more `updatePage(cmsDocumentId, { qualityScore })` patch. Using the adapter's own post-write return value (not the caller's input) matters: it's the authoritative state Sanity actually persisted, already includes fields a particular caller might not have touched (e.g. `regenerateBlockAction` only ever sends `contentBlocks`, never `faqItems`), and can't drift from what a reader will see next.

`src/lib/cms/resolveAdapter.ts`'s `getAdapterForCurrentUser()` — the one place every real write path in this app obtains its adapter — now returns `withQualityScoring(buildSanityAdapter(site), { siteId: site.id })` instead of the bare `SanityAdapter`, and its return type changed from `SanityAdapter` to `CmsAdapter` accordingly (no caller anywhere used anything beyond the interface, confirmed by grep before making the change). The one deliberate exception: `connectSiteAction.ts` still constructs its own throwaway `SanityAdapter` directly for the "does this token/project actually work" validation probe — a one-off `getPages()` read that should never write a score or a history row.

This is also how "on save and on publish" is satisfied without building a publish feature today: a future publish action would just be another `updatePage` call, which already re-scores automatically. Nothing publish-specific needed to be written.

With `saveDraftPageAction` no longer responsible for scoring, its own explicit `computeQualityScore` call (and the `faqItems` field Day 14 had added to `SaveDraftPageInput` solely to feed that call) were both removed — simpler than Day 14 left it, not just different. `SeoPanel.tsx`'s live-updating `QualityScorePanel` preview (computed client-side via `useMemo` from in-progress edits, per §10) is unaffected and still serves its own purpose: showing what a save is *about to* persist, before the round trip that now computes the authoritative version.

### Score history

`QualityScoreHistory` (`prisma/schema.prisma`) — one append-only row per computation, written by the same `scoreAndPersist` step inside `withQualityScoring`, right after the current-score patch succeeds. `pageId` is the Sanity document id (`Page.cmsDocumentId`), not a Prisma relation: Sanity, not Postgres, is the source of truth for Page content, the same reasoning `AiCallLog` (Phase 2) already uses for its own unenforced `siteId`/`userId` rather than a `@relation`. `subScores` is stored as `Json`, mirroring `QualityScore["subScores"]` verbatim — each sub-score's `reason` text included, not just its number, since a future trend view (Phase 5) will want to explain *why* a score moved, not just chart that it did. `score` is also its own indexed `Int` column so a future query (e.g. "pages that dropped below 50") doesn't need to unpack JSON to filter.

Writing the history row is best-effort, matching `logAiCall`'s (`src/lib/ai/logging.ts`) established "never throws" convention: a Postgres hiccup while writing an observability row must not fail a page save whose actual content write (and current-score patch) already succeeded. The current-score `updatePage` patch itself still propagates a real failure normally, same as every other adapter write.

No trend UI reads this table yet — visualizing it is explicitly Phase 5's dashboard work (mirroring `AiCallLog`'s own "foundation for the Phase 5 cost dashboard" framing), and building it before there's more than a few hours of real history to show would be premature. Today's job was only to start capturing it correctly, since history not recorded today can't be backfilled later — verified with a real (not mocked) round trip against the project's actual hosted Postgres database (write, read back, delete) before considering this done.

### Testing

Unit (Vitest): `src/lib/quality/autoScore.test.ts` — a fake `CmsAdapter` (not `SanityAdapter`, keeping the wrapper's CMS-agnosticism honest) verifies `createPage`/`updatePage` each trigger exactly one additional scoring `updatePage` call using the *returned* page rather than the input, that a history row is written with the right `pageId`/`siteId`/`subScores` shape, that a history-write failure doesn't block the current-score write or its return value, that a genuine score-patch failure still propagates, and that every other `CmsAdapter` method (`getPages`/`getPage`/`listImages`/`updateImage`) passes through untouched. `saveDraftPageAction.test.ts` was updated to assert it no longer sends a `qualityScore` field at all — that responsibility fully moved to the adapter layer.

This closes Phase 3 (deterministic SEO checks → AI-assisted suggestions → SERP preview → composite quality score → automatic scoring → score history).

## 12. Media Library (Day 16) — Phase 4 begins

An honest view of every image across the active Site's content and whether its alt text is actually worth anything — no AI call yet (that's tomorrow); today is purely surfacing what needs fixing. `/media` (`src/app/(app)/media/page.tsx`), added to the Sidebar alongside Sites/Pages.

### Composing two existing adapter calls instead of a new one

The task called for building this "not a direct Sanity query, keep using the adapter." `CmsAdapter` already has everything needed: `listImages()` returns every image (§6's own design note 5 already flagged that this means scanning every page's body, not a real asset-library endpoint — still true, still hidden from this screen) and `getPages()` returns every page's `id`/`title`/`slug`. The media page calls both (`Promise.all`) and joins them itself — `image.usedOnPageIds[0]` against `PageSummary.id`, both of which are the same Sanity `_id` today (Day 5's stopgap, §7 point 2) — rather than adding a third adapter method or a join CmsAdapter would have to expose. If the two reads ever see a slightly inconsistent snapshot (a page renamed or deleted between the two calls, no transaction spans them), the image just shows "used on an unknown page" instead of crashing — same no-caching, no-transaction tradeoff §5 already accepted for everything else in this app.

### "Weak" alt text is a new, purely content-based heuristic

`assessAltText` (`src/lib/images/altTextQuality.ts`) flags an image when: `altTextStatus` is `"missing"` (or the text is empty/whitespace despite a non-missing status — belt and suspenders); the text is under 5 characters; it's an exact match against a small list of generic placeholders (`"image"`, `"photo"`, `"screenshot"`, `"untitled"`, etc.); or it's just the asset's filename with separators normalized. It's deliberately independent of `altTextStatus` beyond the "missing" case — an image already marked `"ai-generated"` or even `"reviewed"` can still carry genuinely weak text (someone typed `"image"` once and moved on), and content is the only signal that actually tells a reader whether the text means anything. The generic-word check is an *exact* match on the whole trimmed string, not a substring search — "Product photo of the blue widget" contains "photo" but isn't flagged, only literal one-or-two-word non-answers are.

This heuristic will get noisier as more real content flows through it (the task itself flags "refine later if it's noisy") — it's intentionally simple today rather than front-loading tuning against a dataset of three demo images.

### Filtering, sorting, and "very large" libraries

Filter (All / Flagged) and sort (Flagged first / Recently updated) are both client-side, over an array `getMediaLibrary()` already fetched in full — deliberate, not an oversight: `listImages()` has no CMS-level pagination cursor to push a filter into (§6 flagged "whether getPages/listImages should support pagination" as an open question back on Day 4, never resolved), and pushing the *derived* "flagged" heuristic down into a paginated fetch would risk hiding every flagged image behind several pages of unflagged ones. Instead, `MediaLibrary.tsx` windows the already-fetched array client-side (24 at a time, "Show more" appends rather than re-fetching) — filter and sort apply before windowing, so they compose correctly regardless of library size. This is real lazy-rendering, just not query-level pagination; a media library that grew into the tens of thousands of images would need the adapter-level cursor §6 already anticipated, which is a real follow-up, not attempted here since nothing in this project's actual seeded data comes close to that scale yet.

### States handled

- **Zero images:** a dashed-border empty state, same visual language as Sites'/Pages' own empty states.
- **Adapter failure:** caught and rendered inline (red box with the underlying error), matching `/pages`'s exact pattern — never left to throw into the segment's `error.tsx`.
- **No Site connected:** `NoSiteConnectedError` redirects to `/sites`, same as `/pages`.
- **Zero results after filtering:** distinct from "zero images overall" — "No flagged images" reads as a win, not an error.
- **Large library:** client-side windowing, above.

### Testing

Unit (Vitest): `src/lib/images/altTextQuality.test.ts` covers every flagging path (missing status, empty-despite-not-missing, too short, each generic word, filename-as-alt-text) and confirms real descriptive text — including text that merely *contains* a generic word — isn't flagged.

**Not verified live:** no browser automation is available in this environment (same constraint noted for every earlier Phase 1/2 UI, e.g. §8's Day 6 log) and no write-capable Sanity token exists here either, so the filter/sort/"show more" interactions weren't clicked through in a real browser. What *was* verified: `next build` compiles `/media` with no type errors and registers it as a dynamic (`ƒ`) route rendered on demand, identical to `/pages`' own build output — including the same expected "Dynamic server usage" log during static-generation probing, which is `auth()` reading cookies, not a bug.

## 13. Single-Image Alt-Text Generation (Day 17)

SPEC.md journey (c), step 1: generate → review/edit → accept, for one image at a time. Batch mode (tomorrow) is explicitly "run this same logic many times reliably," so today's job was getting this single-image path exactly right rather than a quick version to be rebuilt tomorrow.

### Almost everything this needed already existed

`generateWithVision` (`AiProvider`, §3), the `alt-text-single`/`alt-text-batch` routing table entries (already pointing at OpenAI, never Groq — `../ai/routing.ts`, unchanged today), `altTextSchema`/`altTextJsonSchema` (Day 10), and cost logging (`aiClient`'s `runLogged` wraps every call type identically, and `pricing.ts` already has a `gpt-4o-mini` rate) were all built and tested before this task started. Today's actual work was one layer up: `src/lib/images/generateAltTextAction.ts` (prompt → `aiClient.generateWithVision("alt-text-single", ...)` → re-validate against `altTextSchema`, the same "re-validate the provider's own JSON" convention every other AI action already follows) and `src/lib/images/prompt.ts`'s `buildAltTextPrompt` (asks for one specific descriptive sentence, a confidence level, and a `needsReview` flag; includes the page title as context when the caller has one, since Media Library's own page-association join from Day 16 already resolves it). Task item 4 ("surface the same cost/provider logging") needed zero new code — it was already automatic the moment this action called through `aiClient` instead of a provider directly.

### Never auto-saving means two actions, not one

`generateAltTextAction` never touches Sanity — it only returns a suggestion. `src/lib/images/saveAltTextAction.ts` is the one place a suggestion (or a hand-edited version of one) ever reaches `CmsAdapter.updateImage`, and only ever called from an explicit "Accept" click. It picks between the two valid terminal states SPEC.md's original journey (c) "done state" already named: `altTextStatus: "ai-generated"` when the user accepted the suggestion byte-for-byte (a human approved it but didn't rewrite it — still worth a later second look), or `"reviewed"` when they edited it first (the strongest signal this app has for "a person actually looked at this"). There is no code path that persists `"ai-generated"` before a human has seen the text at all — that would be exactly the auto-save this task ruled out.

### UI: one card, one small state machine

`MediaLibraryCard.tsx` (split out of `MediaLibrary.tsx`, which now only handles filter/sort/windowing) holds a single `CardPhase` union — `idle | generating | reviewing | saving` — rather than a few independent booleans, so "generating and reviewing at once" isn't a state the type system allows. `reviewing` carries both the original AI suggestion and an editable `draft` string (initialized to the suggestion, freely editable) — accepting compares `draft` against the original to decide `ai-generated` vs. `reviewed`, exactly matching `saveAltTextAction`'s own contract. A low-confidence or `needsReview` suggestion gets a small inline note ("worth a careful read") rather than being hidden — the whole point of a review step is not to bury the one signal that says "look closer." On successful accept, the card resets to `idle` and `router.refresh()` re-fetches the Server Component's data — since `assessAltText` is a pure function re-run fresh on every load, a newly-accepted good alt text stops being flagged immediately, with no separate client-side state to keep in sync.

### Failure handling (task item 5)

None of these leave anything stuck, because nothing is written until Accept:

- **Vision call fails or times out:** `withTimeoutAndRetry` (already existing, unchanged) retries a timeout or a 5xx/429 once, gives up on anything else; whatever reaches `generateAltTextAction` is caught and returned as `{ error }`. The card drops back to `idle` with an inline error and an unchanged "Generate alt text" button — retry is just clicking it again.
- **Image URL inaccessible:** surfaces as an ordinary OpenAI API error (a 4xx, not retried per `retry.ts`'s own status-code table) — handled by the exact same catch block as any other failure, no special-casing needed.
- **Response fails schema validation:** `altTextSchema.parse(result.data)` throws, caught the same way.
- **The save itself fails:** `saveAltTextAction` returns `{ error }` without partially applying anything (a Sanity patch is atomic); the card stays in `reviewing` with the user's edited draft intact rather than reverting or clearing it, so a flaky save doesn't cost them their edit.

### Testing

Unit (Vitest): `src/lib/images/prompt.test.ts` (page title included/omitted, confidence/needsReview always requested), `generateAltTextAction.test.ts` (mocked `aiClient.generateWithVision` — asserts the `alt-text-single` call type, the image URL and prompt passed through, `userId`/`siteId` context threading with and without a connected site, a provider failure, and a schema-validation failure), `saveAltTextAction.test.ts` (mocked adapter — asserts `ai-generated` vs. `reviewed` status selection, trimming, rejecting empty text before ever calling the adapter, and an adapter failure returning `{ error }`).

**Not verified live:** no write-capable Sanity token or browser automation exists in this environment (same standing constraint as every earlier UI day), so the actual Generate → review → Accept click-through wasn't exercised against a real image. What *was* verified: `next build` compiles cleanly with no type errors, matching every other route's build output.

## 14. Batch Alt-Text Generation (Day 18)

"Run the single-image flow many times with a queue on top" (this task's own framing, item 3) — not a second implementation. Everything from Day 17 (`generateAltTextAction`, `saveAltTextAction`, the review-before-save contract) is reused verbatim; today's work is a queue and a concurrency-limited runner around it.

### Lifting state up so there's exactly one code path, not two

Yesterday's `MediaLibraryCard` owned its own `useState` for generate/review/accept. That had to change: the batch queue needed to drive the *same* state a card's own button drives, or "reuse yesterday's logic" would only be true in spirit, not in code. `phases` (`Record<imageId, CardPhase>`) now lives in `MediaLibrary.tsx`; `MediaLibraryCard` is purely presentational (`phase` + four callback props), and `runGenerate`/`runAccept` are two plain async functions defined once in `MediaLibrary.tsx` that both a single card's own button *and* the batch runner call identically. A single click and "run this for all 40 flagged images" are the same function, called once vs. many times through a pool — never a parallel branch.

`CardPhase` (`src/lib/images/batchQueue.ts`) gained two states beyond yesterday's four: `"saved"` (distinct from `"idle"` — see below) and a `reviewing.error` field (a failed save now stays in `reviewing` with the error attached, rather than needing a second error-tracking map alongside `phases`).

### The concurrency pool is the entire rate-limiting story (task item 6)

`runWithConcurrency` (`src/lib/images/concurrency.ts`) is a plain worker pool: at most `GENERATE_CONCURRENCY` (2) vision calls in flight at once, regardless of batch size. Deliberately not a token-bucket/scheduler — with a small pool, even a 40-image batch can't burst the provider, and any 429 that does slip through is still caught and retried by `../ai/retry.ts`'s existing exponential backoff underneath (unchanged today). Accepting suggestions in bulk uses a separate, wider pool (`ACCEPT_CONCURRENCY`, 4) — Sanity patches are cheap; there's no reason to rate-limit them as cautiously as a vision API call. A worker that throws is caught inside the pool itself so one unexpected bug can't abort the rest of the batch (belt-and-suspenders — `runGenerate`/`runAccept` already resolve to a state update rather than rejecting, mirroring every Server Action's `{ data } | { error }` convention, so this should never actually trigger).

### Partial failure and retry (task item 4)

The batch's roster (`batchIds`, in `MediaLibrary.tsx`) is a **fixed snapshot** taken once when "Generate alt text for all flagged" is clicked, and it never shrinks — not even when "Retry failed" reprocesses just the failed subset. This was a real design decision, not an accident: an earlier draft had retry replace the roster with just the failed ids, which reset the progress panel's "N of 40 processed" back down to "0 of 2," discarding the fact that 38 others had already succeeded. Instead, `handleRetryFailed` calls the exact same `processIds` used for the initial run, scoped to `selectByPhase(batchIds, phases, "failed")`, while `batchIds` itself stays untouched — `computeBatchProgress` re-derives the whole summary from the fixed roster plus the live `phases` map every render, so a retry's progress is additive, not a reset.

`selectEligibleForBatch` is what makes "Generate all flagged" itself idempotent/re-clickable: it only selects images that are flagged *and* currently `idle` or `failed` — anything already `generating`, holding an unsaved suggestion (`reviewing`/`saving`), or already `saved` this session is skipped, so clicking the button again after a partial run never clobbers in-progress work.

### Why "saved" exists as its own phase

Once a suggestion in `reviewing` is accepted, the naive move is back to `{ name: "idle" }` — but `computeBatchProgress` derives "done" purely from `phases`, and `"idle"` also means "never started." Without a distinct `"saved"` phase, individually accepting an item mid-batch (before the eventual `router.refresh()` lands) would make the progress panel's completed count *drop*, looking like work reverted rather than finished. `"saved"` renders identically to `"idle"` in the card itself (nothing left to do until the refresh brings fresh server data) but keeps the batch panel's arithmetic honest in the meantime.

### Review stays the default; "accept all" is the opt-in shortcut (task item 5)

Generation only ever produces `reviewing` state — nothing is written to Sanity until an explicit accept, exactly like Day 17, whether that generation came from one click or forty. `BatchAltTextQueue.tsx`'s "Accept all N suggested" button is available once anything has reached `reviewing`, but it's an additional action next to the per-card Accept/Discard buttons already visible in the grid below, not a replacement for them — a user can review and hand-edit every single one individually and never touch it. Clicking it runs `runAccept` (the identical function, again) over whatever's currently `reviewing`, using each item's *current* draft — including any the user had already hand-edited before clicking.

### The progress panel (task item 2)

`BatchAltTextQueue.tsx` is a compact, independently-scrollable roster (`max-h-64 overflow-y-auto`) — a small thumbnail, status dot, and label per image — deliberately separate from the full review cards in the grid, which would be unreadable at dozens of items with a textarea each. It reads `items`/`batchIds`/`phases` as plain props (no state of its own) and is filter/pagination-independent: it always covers the full batch roster regardless of what the grid below is currently showing, since a user might filter the grid to "All" mid-batch without losing sight of progress.

### Testing

Unit (Vitest): `src/lib/images/concurrency.test.ts` (every item processed exactly once, concurrency never exceeds the cap, one worker's rejection doesn't stop the rest, empty input, cap larger than the item count), `src/lib/images/batchQueue.test.ts` (eligibility selection — including the "already reviewing shouldn't be clobbered" and "failed is eligible again" cases — phase-filtering, and progress computation, including the specific regression this task's design surfaced: a roster's total must not shrink when a retry only reprocesses the failed subset, and an accepted item must count as done, not revert to queued). No component-level tests — this codebase has no React testing library anywhere (confirmed before starting), so `MediaLibrary`/`MediaLibraryCard`/`BatchAltTextQueue` follow the same precedent as `SeoPanel`/`GeneratePageForm`: orchestration and rendering stay untested directly, with every piece of actual logic they call extracted into a plain, tested function first.

**Not verified live:** same standing constraint as every earlier UI day — no browser automation or write-capable Sanity token in this environment. What *was* verified: `next build` compiles cleanly with no type errors.

Tomorrow starts FAQ generation — the second AI feature of Phase 4.

## 15. FAQ Generation (Day 19)

SPEC.md journey (d): generate → edit/reorder/delete → save, on the page detail view (`/pages/[slug]`) — the only editor an already-saved page has, since (per §9's own note) there's still no separate `/pages/[slug]/edit` route reopening `GeneratePageForm`'s draft state. `FaqEditor.tsx` replaces what was a static, read-only FAQ list on that page with an editable one, sitting alongside `SeoPanel` as its own independent save surface.

### Reusing Day 10's schema and Day 2's modeling exactly as they already existed

`generateFaqListAction.ts` calls `aiClient.generateStructured("faq-generation", ...)` against `faqListSchema`/`faqListJsonSchema` — both already built and tested on Day 10, unchanged today. Persistence goes through `CmsAdapter.updatePage`'s existing `faqItems` field (`saveFaqItemsAction.ts`), which already writes into the embedded `page.faqItems[]` array Day 2 chose over a standalone referenced document type — no adapter or schema change was needed for either side of this feature; today's actual work was the prompt, the two thin Server Actions around already-existing capabilities, and the editable UI.

### Prompt is grounded in the page's real content (task item 1)

`buildFaqGenerationPrompt` (`src/lib/pages/prompt.ts`) feeds the model the page's actual headings and body text — the same `extractHeadingBlocks`/`extractParagraphText` helpers `buildSeoSuggestionsPrompt` already uses — plus the site's brand voice (Day 13), so generated answers read consistently with everything else this app generates for that site. The prompt explicitly instructs the model not to invent facts the page doesn't already state, backing up the "grounded, not generic boilerplate" requirement with more than just good input data.

### Refusing to generate rather than generating filler

`faqListSchema` requires 3-8 items (Day 10) — on a page with too little body content, that requirement would force the model to pad real answers out with invented or generic filler to hit the minimum. `generateFaqListAction` checks the page's body word count (`extractWords`, the same tokenizer `src/lib/seo/checks.ts` and the Day 14 quality score already use) before ever calling the AI, and refuses with a plain, actionable message below a 40-word floor — this task's "too little content to generate meaningful FAQs" edge case (item 5), handled by not spending an AI call on a request likely to hallucinate rather than by trying to clean up its output afterward.

### Never auto-published; append, not replace, on generate

Nothing reaches Sanity until "Save FAQs" is clicked — matching Day 12's draft/review pattern (item 3): generated items land in local component state exactly like `GeneratePageForm`'s draft blocks did, editable and re-orderable before anything is persisted. Clicking "Generate FAQs" *appends* newly generated items to whatever's already in the local list rather than replacing it — never destructive, since deleting unwanted items afterward (including all the way down to zero, task item 5) is already how the editor works.

### Editing, reordering, and the zero-FAQ edge case

Each FAQ item is an inline `question`/`answer` pair with up/down move buttons (plain buttons, not drag-and-drop — task item 2 explicitly allows either, and this is the simpler one to build well and keep accessible) and a delete button. An empty list renders its own explicit message ("save with none — that's a valid choice too") rather than looking like a loading or broken state, and `saveFaqItemsAction` passes `faqItems: []` straight through to `CmsAdapter.updatePage` exactly like any other value — `UpdatePageInput` only skips a field when it's `undefined`, so an empty array is a real "clear everything" write, not a no-op.

`source` (`"ai-generated"` vs. `"manual"`) reflects an item's origin and is set once, when it's created (generated vs. hand-typed via a future "Add FAQ" affordance, not built today since nothing in this task asked for manually-authored-from-scratch items) — editing a generated item's text afterward doesn't flip it to `"manual"`, since the field describes provenance (matching its own name), not a review/approval workflow the way `ImageAsset.altTextStatus` does (Day 17's `"ai-generated"` vs. `"reviewed"` distinction is a different, deliberately separate concept for a different domain type).

### Validation and failure handling (task item 5)

`saveFaqItemsAction` rejects a save if any item has an empty (or whitespace-only) question or answer, before ever calling the adapter — Sanity's own `Rule.required()` on the `faqItem` schema is a Studio-side validation warning, not a server-enforced constraint on the raw mutate API this adapter uses, so this app has to be the one to actually stop empty junk from being written. A generation failure (AI error, or the too-little-content refusal above) is caught and shown inline without touching whatever's already in the local list; a save failure is caught and shown inline too, leaving every edit exactly as the user left it rather than reverting or clearing anything.

### Testing

Unit (Vitest): `prompt.test.ts` gained `buildFaqGenerationPrompt` cases (title/page-type/heading-outline/body-text inclusion, explicit "no headings/body yet" flags, the "don't invent facts" instruction, brand-voice threading). `generateFaqListAction.test.ts` (call type, prompt/context threading, the too-little-content refusal never reaching the AI client, a provider failure, and a schema-validation failure). `saveFaqItemsAction.test.ts` (persists a normal list, persists an empty list as a real write rather than a no-op, rejects an empty question/answer before calling the adapter, and surfaces an adapter failure).

**Not verified live:** no browser automation or write-capable Sanity token in this environment, same standing constraint as every earlier UI day. What *was* verified: `next build` compiles cleanly with no type errors.

Tomorrow adds FAQPage JSON-LD schema markup alongside the visible FAQ content this feature now generates and persists.

## 16. FAQPage JSON-LD Schema Markup (Day 20) — closes Phase 4

The part of FAQ generation that actually earns its SEO keep. SPEC.md §3 originally listed this as AI call #7 ("FAQ schema/JSON-LD formatting"), flagged from Day 1 as unbuilt with a note that it might merge into the FAQ-generation call rather than stay separate. It's resolved today, but not as an AI call at all: `buildFaqPageJsonLd` (`src/lib/faq/jsonLd.ts`) is a pure, deterministic transform of `FaqItem[]` — the exact same data `FaqEditor` already generated, edited, and persisted on Day 19 — into schema.org's `FAQPage` shape. Mirrors how the Day 14 composite quality score resolved its own once-planned AI call (#8) the same way: a call already sitting unbuilt in the inventory turned out not to need a model at all once the data it would have summarized already existed.

### The transform and its one real edge case

`buildFaqPageJsonLd` sorts by `FaqItem.order`, filters out any item with a blank question or answer (defensive — `saveFaqItemsAction` already rejects those at save time, but a page edited directly in Studio bypasses this app's own validation), and returns `null` — not an empty `mainEntity: []` — when nothing's left. Google's guidelines require at least one real question; an empty shell isn't valid markup, so the page renders no script tag at all rather than a technically-present-but-empty one.

### Where it's injected, and why staleness can't happen

Per Next's own current guidance (`node_modules/next/dist/docs/01-app/02-guides/json-ld.md`, read before writing this — this project's AGENTS.md requires checking bundled docs for anything Next-specific rather than trusting training data): a plain `<script type="application/ld+json">` rendered directly in the page component, not through `next/head` or `generateMetadata`. `/pages/[slug]/page.tsx` computes it from `page.faqItems` — the Server Component's own freshly-fetched data — never from `FaqEditor`'s local draft state, so a generated-but-not-yet-saved FAQ can never leak into live structured data (the same "never auto-published" boundary Day 19 established for the visible content carries over to the markup describing it). This route already fetches with no caching (§5) and `FaqEditor`'s "Save FAQs" already calls `router.refresh()` (Day 19) — so the script tag recomputes fresh on every request and is back in sync the moment a save completes, with no separate cache-invalidation path to build or forget.

### Sanitization

`serializeJsonLd` applies exactly the escaping Next's own guide calls out as necessary: `JSON.stringify(data).replace(/</g, "\\u003c")`, run once in a shared helper rather than inline at each call site so it can't be forgotten at a future second one. Plain `JSON.stringify` alone doesn't stop a `</script>` sequence inside a question or answer from prematurely closing the surrounding script tag — a real HTML-injection vector for any inline JSON-LD, not specific to this app. Tested directly: a deliberately hostile answer containing `</script><script>alert(1)</script>` serializes with zero raw `<` characters left in the output, while still round-tripping back to the exact original text once parsed (this is HTML-context escaping, not data corruption).

### Manual validation against a real page (task item 3)

Pulled the real, already-saved `faqItems` from the seeded demo project's flagship landing page directly from the live (public, read-only) Sanity API — not a hand-crafted fixture — and ran them through `buildFaqPageJsonLd`/`serializeJsonLd` to inspect the actual output. Checked against Google's FAQPage structured-data requirements by hand: valid JSON; correct `@context`/top-level `@type`; a non-empty `mainEntity` array; each entry `@type: "Question"` with a non-empty `name`; a single (not array-valued) `acceptedAnswer` object per question, each with `@type: "Answer"` and non-empty `text`. No cloaking risk either, by construction — the markup is generated from the identical `faqItems` `FaqEditor` renders visibly, never authored separately, so visible content and structured data can't drift apart.

One factual caveat worth recording for anyone reviewing this later: Google's own eligibility policy (as of a 2023 update) now generally restricts the FAQPage *rich result* in search to well-known, authoritative government and health sites — most sites, including this one, won't get the visible rich snippet even with fully valid markup. That's a search-result-eligibility policy, not a markup-correctness issue, and it's exactly what this task asked to validate; the markup itself is correct and other consumers (AI crawlers, other search engines, the generic [Schema.org validator](https://validator.schema.org/)) aren't subject to that same policy.

### Testing

Unit (Vitest): `src/lib/faq/jsonLd.test.ts` — a normal FAQ list produces the exact expected shape; ordering follows `FaqItem.order` regardless of input array order; an empty list (and a list where every item is blank) returns `null`; a partially-blank list filters just the blank entries; whitespace is trimmed; `serializeJsonLd` produces parseable JSON and specifically defeats a `</script>`-embedding attempt while preserving the original text through a full serialize/parse round trip.

**Phase 4 polish pass (task item 4):** re-read the whole chain fresh — `MediaLibrary`/`MediaLibraryCard`/`BatchAltTextQueue`'s shared `phases` state (Day 18), `generateAltTextAction`/`saveAltTextAction` (Day 17), and `FaqEditor` (Day 19) — specifically looking for rough edges before today's demo-readiness deadline. Nothing needed fixing: the shared-phase architecture from Day 18 already prevents the one race condition worth checking (a card's own "Generate" button and the batch queue targeting the same image at once) by construction, since both read and disable off the identical `phases` map rather than independent state.

**Not verified live:** no browser automation or write-capable Sanity token in this environment, same standing constraint as every earlier UI day — the actual rendered `<script>` tag wasn't inspected in a live browser's DOM or run through Google's Rich Results Test (which requires a publicly reachable URL). What *was* verified: the exact JSON-LD payload the app would emit for a real page, checked by hand against Google's documented field requirements, plus `next build` compiling cleanly.

This closes Phase 4 (media library → single alt-text generation → batch alt-text generation with a progress queue → FAQ generation with inline review → FAQPage schema markup). Phase 5 starts next: the diff UI for AI edits to existing content.

## 17. Diff View for AI Edits (Day 21) — Phase 5 begins

A shared before/after review surface for anywhere AI proposes a change to content that already exists — today, that's block regeneration and applied SEO suggestions; tomorrow's review-workflow states (draft → in review → approved → published) build on top of this.

### A real bug this task surfaced: block regeneration was already silently auto-persisting

Building the retrofit meant re-reading `regenerateBlockAction.ts` closely, and it turned up something worse than "no diff exists yet": once a page had been saved once (`cmsDocumentId` set), a regeneration call *already wrote the result straight to Sanity* inside the action itself, before returning anything to the UI to review. There was no version of this flow where a user could see a regenerated block and reject it — by the time the suggestion reached the browser, it was already live. This is exactly the failure mode this task exists to close, not a hypothetical: fixed by deleting the adapter call from `regenerateBlockAction.ts` entirely. It now only ever generates and returns a suggestion (`{ block } | { error }`), matching `generateAltTextAction`'s (Day 17) "never touches Sanity" contract. Persistence now flows through exactly one path — `saveDraftPageAction`, the same action every other content write already goes through — and only once a user explicitly accepts a suggestion into their local draft and then clicks Save. `regenerateBlockAction.test.ts` was rewritten around this (no more `cmsDocumentId` parameter, no more "persists through the adapter" test — replaced with tests confirming it only ever returns a suggestion).

### The shared diff primitive

`computeArrayDiff` (`src/lib/diff/computeDiff.ts`) matches `before`/`after` items by id (not position) and classifies each as `added`/`removed`/`changed`/`unchanged` — genuinely built at "added or removed" breadth per task item 2, even though neither of today's two call sites ever produces an add/remove (block regeneration always keeps the same block id; an applied SEO suggestion always changes an existing field). That breadth is there because this is explicitly meant to outlive today's two call sites, not because either of them needs it yet. `computeValueDiff` is a one-line convenience wrapper over the same function for the common "one value changed" case both of today's retrofits actually are, so there's exactly one diffing algorithm, not a duplicate a simpler-looking single-value case would tempt someone into writing.

`DiffView` (`src/components/DiffView.tsx`) is generic over the value type and holds no decision state of its own — it renders whatever `entries` it's given (already filtered by the caller down to what still needs a decision) with Accept/Reject buttons per entry, calling back the id. This is what makes "accept 3 of 5 in a single review pass" (task item 3) work without any special multi-entry logic: each decision the caller records shrinks the next `entries` array it passes down, so accepted/rejected items simply stop appearing, one at a time, in whatever order the user resolves them.

### Retrofit 1: block regeneration (`GeneratePageForm.tsx` / `DraftBlockEditor.tsx`)

`DraftBlockState` gained a `suggestion: PageDraftBlock | null` field, replacing the old `edited: boolean` flag entirely (see below for why that flag didn't survive). A regenerated block lands in `suggestion`, never applied to `block` directly. `DraftBlockEditor` shows a single-entry `DiffView` (current `block` vs. pending `suggestion`) in place of its normal editable fields whenever a suggestion is pending — Accept copies `suggestion` into `block` and clears it; Reject just clears it, leaving `block` untouched. Because the editable fields are hidden while a suggestion is pending, there's no window where a hand edit and an unreviewed suggestion could both be in flight for the same block — which is also what makes task item 5 ("compare against actual current state, not stale cache") automatic here rather than something extra to build: `handleRegenerate` always sends `current.block` — the live draft state at the exact moment Regenerate is clicked, already reflecting any prior hand edits — as the context for the AI call, and that same live value is what the diff's "Current" side shows.

The old `edited` flag existed for exactly one reason: gating a `window.confirm("This block was edited by hand — regenerate and overwrite it?")` before regenerating. That confirm dialog was a blunt stand-in for the same problem — approve/reject blind trust of an about-to-happen overwrite — that Accept/Reject on a real diff now solves properly (you see what changed before deciding, rather than being asked to gamble beforehand). Keeping both would mean the same risk gated twice, so the confirm dialog and the flag it existed for were both removed, not left in place alongside the new flow.

### Retrofit 2: applied SEO suggestions (`SeoChecklist.tsx` / `SeoPanel.tsx`)

`SeoChecklist`'s old "AI suggests a change" box called `onApplyTitle`/`onApplyMetaDescription` directly from a single "Apply" button — no diff, no way to say no beyond just not clicking it. It now receives the current `title`/`metaDescription` as props and renders the same `DiffView` (one entry per suggested field) in its place. Accept still calls the exact same `onApplyTitle`/`onApplyMetaDescription` handlers as before (SeoPanel's own local state, unchanged) — nothing about *what* accepting does was touched, only the fact that it's now a deliberate choice next to a visible before/after instead of the only button available.

Reject needed one small addition SeoPanel didn't have: a `dismissedSuggestionIds` set, reset every time a fresh "Get AI suggestions" call returns. Accept needs no such bookkeeping — once `title` equals the suggested value, `computeValueDiff` itself reports `unchanged`, and `DiffView` already doesn't render unchanged entries, so an accepted suggestion disappears for free. A *rejected* one wouldn't: the current and suggested values still differ, so without tracking "the user already said no to this," the exact same diff would silently reappear on every re-render. That gap is exactly what `dismissedSuggestionIds` closes.

### Testing

Unit (Vitest): `src/lib/diff/computeDiff.test.ts` — unchanged/changed/added/removed classification individually and in a single realistic mixed diff, order preservation (before's order, then new `after` ids appended where they first appear), a custom equality function, and `computeValueDiff`'s wrapper behavior including its own custom-equality path. `regenerateBlockAction.test.ts` rewritten to assert the action never persists anything, under any input shape. No component tests for `DiffView`/`DraftBlockEditor`/`SeoChecklist` themselves — this codebase still has no React testing library (confirmed again before writing this), consistent with every other client component here: the logic that matters (`computeArrayDiff`/`computeValueDiff`) is extracted and tested; the components stay thin renderers over it.

**Not verified live:** no browser automation in this environment, same standing constraint as every earlier UI day. What *was* verified: `next build` compiles cleanly with no type errors, and `tsc --noEmit` catches nothing across the whole retrofit (including every call site that previously passed `cmsDocumentId`/`edited` fields that no longer exist).

Tomorrow builds the full review workflow (draft → in review → approved → published) on top of this diff view.

## 18. Review Workflow: Status Machine and Audit Trail (Day 22)

Real content states on top of yesterday's diff view, and a record of what actually happened to a page over time.

### Extending, not replacing, Day 12's draft/unpublished state

`Page.status` (`src/types/page.ts`) already existed as `"draft" | "in-review" | "published"` (Day 12, SPEC.md §9) — today adds `"approved"` between the two, making it `"draft" | "in-review" | "approved" | "published"`. Every place that enumerated the old three values got the fourth added alongside them, nothing rebuilt: the Sanity schema's status field options (`studio/schemaTypes/page.ts`), `SanityAdapter`'s own validation list (`PAGE_STATUSES`), and the `/pages` list's status-badge colors (a new blue for "approved," between amber "in-review" and emerald "published").

### The transition table (task item 5: enforced sensibly)

`src/lib/pages/pageStatusTransitions.ts` is the single source of truth, expressed as a plain lookup table rather than scattered if/else checks:

```
draft --submit--> in-review --approve--> approved --publish--> published
                      ^                     |
                      \--------reject-------/
```

Publishing can only be reached by passing through `in-review` and `approved` in that exact order — there is no direct `draft → published` or `in-review → published` edge. That's the deliberate choice task item 5 asked to either enforce or document: skipping review would defeat the entire point of having one. `reject` is one general "send it back to draft" action available from both `in-review` and `approved` (not two separately-named actions for the same intent), and there is no back-edge out of `published` at all — nothing in this task asked for an unpublish/revoke flow, and building one speculatively would be designing for a requirement that doesn't exist yet.

`resolvePageStatusTransition(action, current)` is called from both sides: server-side in `transitionPageStatusAction.ts` (where it's actually enforced — an illegal request returns an error before the adapter is ever touched) and client-side in `PageStatusPanel.tsx` (to decide which buttons even render, so the UI never offers something the server would reject). One honest limitation, recorded rather than silently accepted: the action trusts the client's own `currentStatus` to decide legality, since `CmsAdapter` has no "read a page by id" method to re-fetch it authoritatively server-side without a larger interface change. This app has no per-document locking anywhere already (every save already just overwrites — SPEC.md §5's no-caching stance accepts the same class of race elsewhere), so the worst case is a transition computed from a stale belief about the current status, not data corruption — Sanity still only ever receives one well-formed `nextStatus`.

### The audit trail (task items 3 and 4)

`PageAuditLogEntry` (Prisma) — one more append-only table in the same family as `QualityScoreHistory` (Day 15) and `AiCallLog` (Phase 2): `pageId`/`siteId` as unenforced strings rather than `@relation`s, since Sanity, not Postgres, owns Page content. `userEmail` is denormalized onto the row at write time instead of joined from `userId` at read time — the History panel always wants a human-readable "by whom," and there's no reason to pay a join per read for it. `logPageActivity`/`getPageActivity` (`src/lib/audit/`) are both resilient — a Postgres hiccup writing an audit entry doesn't fail the save that already succeeded (matching `logAiCall`'s/`recordHistory`'s established "never throws" convention), and a hiccup reading history degrades to an empty list rather than breaking the whole page detail route over a supplementary panel.

`logPageActivity` is deliberately never exposed as a client-callable Server Action of its own — every entry is written from inside `saveDraftPageAction`, `saveFaqItemsAction`, or `transitionPageStatusAction`, right after that action's own real persistence succeeds, so an entry can only ever describe something that actually happened server-side, never a claim a client made about itself.

### Reusing yesterday's diff module for a third purpose

Task item 3 asks for "what changed," not just "something changed." `src/lib/pages/auditSummary.ts`'s `summarizeContentChange`/`summarizeFaqChange` compute that generically by running the *exact same* `computeArrayDiff`/`computeValueDiff` (Day 21, SPEC.md §17) that render `DiffView` — reused here for text output instead of a UI, not a parallel diffing implementation. Both return `null` when nothing actually differs, and both call sites skip logging entirely in that case: a "Save" click that persists no real change isn't a meaningful event worth an audit row.

This also needed a "before" to diff against, which `saveDraftPageAction` doesn't otherwise have (it doesn't re-fetch the page's prior state before writing). Rather than adding a new adapter read, both `SeoPanel` and `FaqEditor` already hold the last known persisted state in their own `page` prop — the Server Component's fresh fetch from this exact page load — so they pass it through as `previousContent`/`previousFaqItems`. `GeneratePageForm`'s own save never passes either (there's rarely a real "previous persisted state" worth diffing against for a session that's still assembling its first save), so it falls back to a generic "Page created as a draft." / "Page content updated." — simpler, and accurate for what that flow actually is.

### Distinguishing "AI edit accepted" without tracking intent through every click

Task item 3 names "AI edit accepted" as its own category, distinct from a plain manual edit. Rather than threading a tracked flag through every Accept click (real complexity for arguably little accuracy gain — see Day 21's own reasoning for keeping `DiffView` stateless), both call sites *derive* it from the final data at save time:

- `FaqEditor`: an AI-generated FAQ only ever reaches a save via "Generate FAQs," reviewed (and possibly edited) first (Day 19). A saved item's `source` still reading `"ai-generated"` *is* the signal that a suggestion was accepted — no separate flag needed.
- `SeoPanel`: at save time, if the current `title`/`metaDescription` still equals the last fetched suggestion's, an AI suggestion is part of what's being saved. Also derived, not tracked.

Both feed into the same optional `viaAiSuggestion`/detected-`ai-generated` path, appending "(includes an applied AI suggestion)" / "(includes AI-generated FAQs)" to the audit summary when true.

### UI

`PageStatusPanel.tsx` — the current status as a colored badge plus exactly the buttons `availablePageStatusActions(page.status)` says are legal right now, never a disabled-but-visible button for an illegal one. `PageHistoryPanel.tsx` — a plain server-rendered list (no `"use client"`; nothing in it is interactive), newest-first, each row showing the summary, who, and when. Both render on `/pages/[slug]`, alongside `SeoPanel`/`FaqEditor` — the header's own old raw `{page.status}` text was removed once `PageStatusPanel` existed, rather than showing the same value twice in two different (and differently-formatted) places.

### Testing

Unit (Vitest): `pageStatusTransitions.test.ts` (the full forward path, both reject sources, every illegal transition explicitly including "nothing is legal from published," and `availablePageStatusActions` per status). `auditSummary.test.ts` (no-change returns `null`, field-level and block-level change/add/remove summaries together, FAQ add/edit/remove together). `transitionPageStatusAction.test.ts` (a legal transition applies and logs; an illegal one is rejected before the adapter is ever called; reject-from-approved; an adapter failure; and no crash when there's no active site to attribute the log to). `saveDraftPageAction.test.ts`/`saveFaqItemsAction.test.ts` extended with audit-logging cases (page-created vs. content-updated, the AI-generated-FAQ note, and "no log when nothing changed").

**Verified against the real hosted Postgres, not just mocked:** wrote and read back real `PageAuditLogEntry` rows (including newest-first ordering and JSON `metadata` round-tripping) against the actual database this migration was applied to, then deleted them — the same live-verification standard Day 15's `QualityScoreHistory` set.

**Not verified live:** no browser automation in this environment, same standing constraint as every earlier UI day — the actual status buttons and History panel weren't clicked through in a real browser. What *was* verified: `next build` compiles cleanly with no type errors.

Tomorrow builds the site-wide health dashboard, aggregating quality scores and flagged content across every page — using exactly what today's audit trail and this week's diff/review work already track.

## 19. Site Health Dashboard (Day 23)

Turns everything the app has already computed and stored — persisted quality scores (Day 14), score history (Day 15), review status (Day 22), alt-text status (Day 16/17) — into one aggregate view, plus a queue telling a user exactly which pages to act on next. `/dashboard`, promoted to a real Sidebar entry.

### Read-heavy by construction, not by discipline (task item 4)

Every number on this screen comes from a read that already existed for another feature: `adapter.getPages()`'s own `qualityScore`/`faqCount` fields (Day 14/19), `adapter.listImages()` run through `assessAltText` — the *exact* function Media Library already calls, not a re-implementation (Day 16/17) — and a new `getLatestScoresForSite` (`src/lib/quality/scoreHistory.ts`) that reads Day 15's `QualityScoreHistory` table for sub-score averages. There is no AI call anywhere in this route, and no per-page recomputation of a score that's already sitting on the document — the composite quality score itself is read as a plain field, never recalculated. `getLatestScoresForSite` reduces "latest row per page" in JS after one `findMany`, rather than a raw `DISTINCT ON` query — perfectly fast at this project's real scale (a handful of demo pages per Site), and it's resilient like every other Postgres read helper in this app (`getPageActivity`, Day 22): a hiccup degrades that one card, not the whole page.

### Aggregation and the attention queue as pure, tested functions

`src/lib/dashboard/health.ts` — `summarizeSiteHealth` (page/image counts, status breakdown, average quality score, FAQ coverage) and `averageSubScores` both guard every division explicitly: an empty Site produces `null`/zero-filled results, never `NaN` or a crash (task item 5). `attentionReasonsFor(page)` is the single place "does this page need attention, and why" is decided — a page can be unscored, below the good-score threshold, stuck in `in-review`/`approved`, or carrying flagged images, and any combination of these produces a combined reasons list for that one page (never a separate row per reason). The threshold for "low score" (80) isn't a new number invented for this screen — it's the same green/amber/red boundary `QualityScorePanel.tsx` and `SeoChecklist.tsx` already use everywhere else a quality score gets a color.

`attentionReasonsFor` is exported and called from both sides: server-side (`buildAttentionQueue`, for the initial default view) and client-side (`HealthQueue.tsx`, so toggling to "All pages" can still show *why* a flagged page is flagged, with no re-fetch).

### The queue: filter/sort, same pattern as Media Library

`HealthQueue.tsx` mirrors Media Library's already-established All/Flagged segmented filter + sort-select pattern (Day 16) rather than inventing a new interaction model for a very similar problem: a "Needs attention" / "All pages" filter, and a sort select (lowest score first / most flagged images / review state). An unscored page sorts as if it scored below every real number under "lowest score first" — not knowing is itself worth surfacing ahead of a merely-mediocre score.

### Linking to the right screen, not just the generic editor (task item 3)

Each reason badge is its own link, resolved by `hrefForReason`:

- `unscored` / `low-score` → `/pages/{slug}#seo-panel`
- `in-review` / `approved` → `/pages/{slug}#status-panel`
- `flagged-images` → `/media?page={slug}`

The first two needed anchor ids added to `/pages/[slug]/page.tsx` (`id="seo-panel"` / `id="status-panel"`, with `scroll-mt-6` so the jumped-to panel isn't flush against the viewport edge) — cheap, and it meant the page's old duplicate raw-`{page.status}` header text could finally come out (`PageStatusPanel` already showed it, correctly formatted; showing the same value twice, differently, was never a deliberate choice, just left over from before that panel existed).

The third needed a real capability Media Library didn't have yet: page-scoped filtering. `/media` now reads an optional `?page={slug}` search param (Next 16's `searchParams` prop, a promise like `params` — confirmed against `node_modules/next/dist/docs`'s current `page.js` reference before writing it) and filters server-side to that page's images before anything reaches the client, with a small "Showing images used on {title} · Clear filter" banner so the filtered view never looks like the whole library just happens to be one image. Filtering server-side (not just passing an initial client-side filter prop) keeps this consistent with how every other read in this app already works: the server decides what data reaches the client, not the other way around.

### Handling a small or empty Site (task item 5)

Zero pages: a single dashed-border empty state, no stat cards attempting to average nothing. Zero images: the flagged-image stat correctly reads "0 / 0," not a crash. A page nobody has ever saved through this app (`qualityScore: null`, no `QualityScoreHistory` rows): counted honestly as "not yet scored" rather than silently excluded or shown as a misleading 0 — this is precisely why `averageQualityScore`/`averageSubScores` both return `null` (rendered as "—") instead of `NaN` or `0` when nothing's scored yet, and why the sub-score averages section doesn't render at all when no page has ever been scored.

### Testing

Unit (Vitest): `src/lib/dashboard/health.test.ts` (zero-page/zero-image graceful handling, average-excludes-unscored-pages, status counting, FAQ coverage, every individual attention reason plus a page with several at once, and that a fully healthy page produces none). `src/lib/quality/scoreHistory.test.ts` (latest-row-per-page reduction from an unordered-by-page result set, an empty Site, and resilience to a failed query).

**Validated against real demo data:** pulled the three actual seeded pages plus their real image/FAQ/score data directly from the live (public, read-only) Sanity API and ran them through `summarizeSiteHealth`/`buildAttentionQueue` to inspect the real output — this is what surfaced a genuine small bug before it shipped: the flagged-images reason read "1 image **need** alt text" (pluralizing the noun but not agreeing the verb with a singular count). Fixed and re-verified against the same real data.

**Not verified live:** no browser automation in this environment, same standing constraint as every earlier UI day — the actual filter/sort clicks and anchor-scroll behavior weren't exercised in a real browser. What *was* verified: `next build` compiles cleanly, and `/dashboard` registers as a dynamic route identical in build output to every other adapter-backed page in this app.

Tomorrow adds the cost/usage tracking dashboard on top of this, surfacing the token/cost logging (`AiCallLog`) that's been running since Day 9.

## 20. Cost & Usage Dashboard (Day 24)

Surfaces `AiCallLog` (Day 9) as a real screen — total spend, spend per provider, spend per feature, a per-day view, and which provider is actually handling the bulk of calls in practice. Added as a second section on `/dashboard` (yesterday's own Sidebar comment already predicted the cost dashboard would extend that screen rather than need its own nav entry — honored today).

### A real gap found before the dashboard could be accurate: half the AI actions never attributed a site

Before writing any aggregation code, a check of every AI action's logging `context` turned up an inconsistency: `generateAltTextAction`/`generateFaqListAction` (Days 17/19) already passed `siteId`, but `generatePageDraftAction`, `generateSeoSuggestionsAction`, and `regenerateBlockAction` never did — despite every one of them already calling `getActiveSiteForCurrentUser()` for brand voice and having a `site` variable sitting right there unused for this purpose. A dashboard scoped by Site (matching Day 23's own convention) built on top of that gap would have silently shown zero page-generation, SEO-suggestion, and block-regeneration activity for every Site, no matter how much of it actually happened — not a dashboard bug, a data-completeness bug the dashboard would have just faithfully rendered. Fixed by threading `siteId: site?.id` into all three call sites' logging context, with a test added to each action confirming it (mirroring how Day 22's audit-trail work and Day 23's live-data check each surfaced and fixed a real bug before shipping, not after).

One honest limitation this fix can't retroactively undo: any call logged *before* today under one of those three call types has `siteId: null` in Postgres already and will never attribute to a Site — `getCallLogForSite`'s own top comment records this as a known gap in old data, not something the read function can recover.

### Pricing verified live, not carried forward from training data or a guess (task item 4)

`src/lib/ai/pricing.ts`'s rates were checked directly against each provider's own current pricing on **2026-09-29**: OpenAI's and Anthropic's pricing pages (fetched directly), and Groq's own deprecation docs at `console.groq.com/docs/deprecations`. That last check mattered more than expected — several SEO-aggregator sites returned by a general search claimed Groq had moved `llama-3.3-70b-versatile` (this app's default Groq model) to "enterprise-only, contact sales" pricing as of August 2026. Groq's own documentation directly contradicts this: the model remains active and is explicitly the *recommended replacement* for several other deprecated models. All three of this file's existing rates turned out to already be correct — OpenAI at $0.15/$0.60 per million tokens, Anthropic Haiku 4.5 at $1/$5, Groq at $0.59/$0.79 — so nothing needed to change except replacing the old "reverify" caveats (SPEC.md §3) with this note and the date. The lesson worth keeping: when a live check is warranted, prefer a provider's own docs over aggregator summaries, even when several of the latter agree with each other — that agreement can just mean they scraped the same wrong source.

Also resolved while checking: SPEC.md §3's old note that "OpenAI vision pricing... image tokenization adds a fixed per-image overhead" was itself imprecise. In practice, `gpt-4o-mini` bills an image by converting it into ordinary input tokens that are already included in the API response's own `usage.prompt_tokens` — there's no separate flat per-image fee this codebase needs to add on top. `estimateCostUsd`'s existing generic per-token math already handles this correctly; the imprecision was only in the comment, not the code.

### Aggregation as a pure, tested function over already-logged rows

`summarizeCostUsage` (`src/lib/costUsage/aggregate.ts`) takes whatever rows `getCallLogForSite` (`src/lib/ai/logging.ts`, the read side `logAiCall`'s own Day 9 comment was always written anticipating) returns for a Site and computes every breakdown in one pass: total spend/calls/failures, spend-and-count per provider, per call type, and per UTC calendar day. An empty log (a brand-new Site, or one that's never made a call) produces empty/zero results, never a crash — the same "handle a small Site gracefully" bar Day 23 already set.

`dominantProvider` is deliberately its own field, not just "the top row of `byProvider`" — `byProvider` is sorted by **cost** (useful for "where's the money going"), while `dominantProvider` is computed by **call count** (task item 3's actual question: "which provider is handling the bulk of calls in practice," a volume question, not a cost one — a single expensive OpenAI vision call shouldn't make OpenAI look "dominant" over the dozens of free-tier Groq calls that did the rest of the work). This is also the sanity check on Day 9's Groq-default routing table the task asked for, and a real number for a case study: whatever percentage `dominantProvider.percentOfCalls` reports for Groq is direct evidence the routing table is actually being honored in practice, not just configured correctly on paper.

### UI

`CostUsagePanel.tsx` — another plain server-rendered section (no `"use client"`; every number arrives already computed). Stat cards (total spend, total calls, dominant provider + its %, failed calls), a two-column provider/feature breakdown, and a per-day view built the same way this app already builds every other proportional visual (`QualityScorePanel`'s bars, `BatchAltTextQueue`'s progress bar): plain CSS width percentages against the day with the highest spend, not a charting library — task item 2 explicitly allowed "a simple chart or table," and this project has never once reached for a charting dependency when a styled `<div>` does the job. Spend under a cent renders with 4 decimal places instead of rounding to a misleading "$0.00" — most of this app's real per-call costs (fractions of a cent, per SPEC.md §3's own cost table) would otherwise all display identically.

### Testing

Unit (Vitest): `src/lib/costUsage/aggregate.test.ts` (empty log, totals, per-provider/per-call-type/per-day breakdowns and their sort order, and the dominant-provider-by-volume-not-cost distinction specifically). `src/lib/ai/logging.test.ts` — new (none existed for `logAiCall` before today) — covering the existing write path's never-throws behavior plus the new `getCallLogForSite` read path and its own resilience. `generatePageDraftAction.test.ts`/`generateSeoSuggestionsAction.test.ts`/`regenerateBlockAction.test.ts` each gained a test asserting `siteId` now reaches the logging context, directly covering today's bug fix.

**Verified against the real hosted Postgres, not just mocked:** wrote real `AiCallLog` rows for a scratch Site, read them back through the actual `getCallLogForSite` → `summarizeCostUsage` pipeline this dashboard uses, confirmed the totals, then deleted them — same live-verification standard every new/changed Postgres read path in this app has met since Day 15.

**Not verified live in a browser:** no browser automation in this environment, same standing constraint as every earlier UI day. What *was* verified: `next build` compiles cleanly, and live pricing/model-status checks were made against each provider's actual current documentation rather than assumed.

Tomorrow closes Phase 5: rate limiting and graceful failure handling per provider, plus partial-failure states specifically for batch alt text.

## 21. Provider Resilience: Rate Limiting, Backoff, and Fallback (Day 25) — closes Phase 5

Everything today lives in `src/lib/ai/` (the AI client layer, per task item 1), and every call in this app already flows through it — so all of it applies everywhere, automatically, with no changes needed to any feature-level action beyond one shared error-message helper.

### Proactive rate limiting

`waitForRateLimitSlot` (`src/lib/ai/rateLimit.ts`) is a sliding 60-second window per provider, called once in `client.ts`'s `runLogged` before every call: if a provider is already at its per-minute budget, the call **waits** for room rather than firing and letting the provider reject it. Defaults are conservative and asymmetric — Groq at 25/min, OpenAI and Anthropic at 500/min — matching the task's own framing ("this matters most for Groq, since its free-tier limits are noticeably tighter"); all three are overridable via `AI_RATE_LIMIT_<PROVIDER>_RPM`, the same env-override convention `routing.ts`'s `AI_ROUTE_<CALL_TYPE>` already established. The check-then-record step is synchronous (no `await` between reading the window's length and pushing to it), so concurrent callers can't both observe "there's room" for what's actually one slot; only the wait branch yields, and it always re-checks from scratch after waking rather than assuming the slot it queued for is still free.

This is deliberately test-injectable (`now`/`sleepFn` overrides, plus a `__resetRateLimitStateForTests` escape hatch) rather than hard-coded to `Date.now`/real `setTimeout` — the alternative would have meant either real 60-second waits in the test suite or a fragile shared module-level window silently leaking state between unrelated tests.

### Reactive backoff: a real gap, not just a rename

Rewriting `retry.ts` surfaced something that mattered before it could be fixed: the existing backoff schedule (300ms, doubling per retry, giving up after 2 retries — under one second total) treats a 429 exactly like a transient 5xx blip. A per-minute rate limit cannot possibly clear in under a second — which means, before today, **any genuine rate limit was structurally guaranteed to exhaust its retries and fail**, no matter how the retry loop was tuned, because the wait was never long enough to matter. This is exactly the gap task item 3 pointed at ("retry-with-backoff is a better fit here than a flat 'failed' state" — implying the existing retry wasn't actually a good fit yet).

Fixed by giving a 429 its own, much longer backoff path: `backoffMsFor` now checks for a `Retry-After` response header first (handling both a Headers-like `.get()` shape and a plain object, since this app doesn't control what shape a given provider SDK's thrown error takes) and honors it exactly; only falling back to a fixed 2s/4s/8s schedule when the provider doesn't say. Generic 5xx/timeout failures keep the original short schedule — those genuinely are usually momentary blips, and a 429-length wait for a random 500 would just slow down the common case for no benefit.

Also fixed while touching this file: `AiProviderError.retryable` was set on every thrown error, always hardcoded to `false` — declared on Day 9, never actually read anywhere (confirmed by grep before changing it), so it silently did nothing. It now reflects the real failure mode (`isRetryable(err, timedOut)`, the same check the retry loop itself already uses) — a 429/5xx/timeout that exhausted its retry budget is still `retryable: true` (trying again *later* has a real chance), while a 400/401/403 is `retryable: false` (retrying changes nothing). This flag is what makes the next piece possible.

### One user-facing message, not five near-identical ones

Every AI-calling Server Action (`generatePageDraftAction`, `generateSeoSuggestionsAction`, `regenerateBlockAction`, `generateFaqListAction`, `generateAltTextAction`) had the identical `err instanceof Error ? err.message : fallback` pattern in its catch block — meaning a raw, technical 429 message would have reached the UI unchanged in all five places. `describeAiActionFailure` (`src/lib/ai/errorMessage.ts`) is now the one place this is decided: a `retryable` `AiProviderError` (the flag fixed above) gets "The AI provider is busy right now — please try again in a moment" — task item 2's "clear 'try again in a moment' message where a delay isn't practical," for every interactive single-call action at once. Anything else still gets its real message, since telling someone to "try again" for a genuinely non-transient failure (bad input, a schema mismatch, a config error) would be actively misleading. All five actions now call this one function instead of five copies of the same inline conditional.

### Provider fallback

`client.ts`'s `runLogged` now catches a primary provider's failure, checks a small `FALLBACK_PROVIDER` map (`{ groq: "openai" }` — only Groq gets a target, per the task's own directional framing: OpenAI/Anthropic are already the reliable paid tier with little to gain falling back *from*, and Groq's tight free tier makes a poor fallback target *to*), and — if one exists — makes one additional attempt against it before giving up. The fallback attempt still goes through the rate limiter for *its own* provider first.

"Log that a fallback occurred, don't silently swap providers without a trace" (task item 4) is a real Postgres column, not just a code comment: `AiCallLog.fallbackFrom` (new, migrated today) is set only on the fallback attempt's own log row, naming the provider that failed first — the primary failure still gets logged as its own distinct row, so the full sequence ("Groq failed, then OpenAI was tried and succeeded") is always reconstructable from the log, never merged into one entry that would hide that Groq had trouble at all. Surfaced in the UI too, not just queryable in Postgres: the Day 24 Cost & Usage dashboard now shows a small callout whenever `fallbackCalls > 0`. When *both* the primary and the fallback fail, the primary provider's own error is what gets thrown back to the caller — that's the provider `routing.ts` actually configured for the call type, the more relevant root cause to surface than the fallback's own secondary failure.

### Why batch alt-text needed no changes at all

Task item 3 asked to "revisit batch alt-text specifically" and confirm Day 18's partial-failure handling still holds up against a rate-limit failure mode rather than a generic one. It does, and needed zero changes to `MediaLibrary.tsx`, `BatchAltTextQueue.tsx`, or `runWithConcurrency` — because the fix belongs at the layer task item 1 named (the AI client), and every one of those UI pieces already just awaits whatever `generateAltTextAction` resolves to. A card that used to sit in "Generating…" for under a second before failing now transparently sits there for however long the rate limiter/backoff actually takes, then either succeeds or lands in "Failed" with the new, clearer message — the queue's own accept/reject/retry-failed mechanics (Day 18) are completely unaffected because they were already built around "whatever the action resolves to," not around any assumption about *why* or *how fast*. This is the payoff of having fixed the problem at the right layer the first time, and it's exactly what SPEC.md §18's own framing predicted queue-based UIs would get "for free."

### Stress test (task item 5)

No real API keys exist in this environment (the standing constraint noted on every earlier Phase 4/5 day), so "hammering a rate-limited path" was built as a proper repeatable test rather than a one-off manual run that can't be re-verified later: `src/lib/ai/resilience.test.ts` runs the exact same `runWithConcurrency` (Day 18) + `withTimeoutAndRetry` combination a real batch alt-text run uses, against a mock provider that fails an uneven number of times per item (simulating a real burst against a shared limit affecting different in-flight requests differently) before eventually succeeding. All 20 simulated images complete with no drops and no duplicates. A second scenario confirms the inverse: when a few items are *permanently* broken (never succeed, exhausting their full retry budget), the rest of the batch still completes and only the genuinely broken ones land as failed — Day 18's original partial-failure guarantee, now verified against a realistic rate-limit-shaped failure pattern instead of a generic one. Both run under fake timers — this exercises real multi-second backoff durations without the test suite actually waiting for them.

### Testing

Unit (Vitest): `rateLimit.test.ts` (resolves immediately under budget, queues once at the limit, frees a slot once the window rolls, tracks providers independently, respects the env override — all via an injected fake clock, zero real waiting). `retry.test.ts` — rewritten with fake timers throughout (was real-time before, which would have made the new multi-second 429 backoff genuinely slow to test) — covers the longer 429-specific backoff, both `Retry-After` header shapes, and the now-accurate `retryable` flag on both outcomes. `errorMessage.test.ts` (the friendly message only for a retryable `AiProviderError`, real messages otherwise). `client.test.ts` extended with the rate-limiter-called-before-the-provider ordering check and four fallback scenarios (success, the fallback's own rate limit respected, both fail and the primary's error surfaces, and no fallback attempted for a provider with none configured). `resilience.test.ts` — the stress test above.

**Verified against the real hosted Postgres, not just mocked:** wrote and read back a real fallback-attempt row (and its paired primary-failure row) through the actual migrated `fallbackFrom` column, confirming the field round-trips correctly — same live-verification standard every new Postgres column in this app has met since Day 15.

**Not verified against a real rate-limited provider:** no API keys exist in this environment to actually trigger a live 429 from Groq/OpenAI/Anthropic, so the rate limiter and fallback were never exercised against a real provider response — only against realistic simulations built from how these SDKs are documented to behave (an HTTP `status` of 429, an optional `Retry-After` header). `next build` compiles cleanly with no type errors.

**This closes Phase 5.** The app now has a full CMS layer (Sanity adapter, multi-site), a full AI layer (three providers, routing, retries, rate limiting, fallback, cost logging), SEO/quality scoring with history, alt text and FAQ generation with review-before-save, a draft → in-review → approved → published workflow with an audit trail, and two dashboards (content health, cost/usage) — all now resilient to the real provider limits a live deployment would actually hit. Phase 6 starts next: the WordPress adapter.

## 22. WordPress Adapter: Scoping and Mapping (Day 26) — Phase 6 begins (stretch)

**This entire phase is a stretch goal.** If it slips, the plan already treats its last day as a fallback to hardening the Sanity side instead — nothing about the rest of this project depends on WordPress support existing. Today is pure scoping and mapping, the same discipline Day 4 applied to `CmsAdapter` itself before Day 5 ever touched an implementation: **no `WordPressAdapter.ts` was written today**, and no WordPress-side custom-fields plugin either (see "what's deliberately not done today" below) — everything here is a decision, checked live against a real staging install, not code.

### Integration approach: REST API + Application Passwords

Chosen over a custom plugin exposing bespoke endpoints, for the same reason Credentials-over-OAuth won out for this app's own login (Day 6, §8): Application Passwords need zero app registration, zero callback URL, zero approval process with anyone — a reviewer (or this project's own `WordPressAdapter.test.ts`, tomorrow) can point at any WordPress 5.6+ site, generate one from the standard wp-admin profile screen or via `wp user application-password create`, and start making authenticated REST calls with plain HTTP Basic Auth. A custom plugin would give more flexibility (batch endpoints, exposing exactly the shape the adapter wants) at the cost of requiring every WordPress site this app connects to install and maintain a plugin — a much heavier ask than "generate an application password," and one this stretch phase doesn't need to make. The core REST API (`/wp/v2/*`) already exposes everything §CmsAdapter's four content methods need; a custom plugin only becomes necessary for the *custom fields* gap analysis below, not for auth or for reading/writing standard content.

One real setup gotcha worth recording because it cost real debugging time: modern WordPress (this was checked against 7.1.1) gates Application Passwords behind `wp_is_application_passwords_supported()`, which returns `is_ssl() || 'local' === wp_get_environment_type()` — **not** the "is the hostname literally `localhost`" check older WordPress docs and tutorials describe. A plain-HTTP local install with `home_url()` set to `http://localhost:8890` still returned `wp_is_application_passwords_available() === false` until `WP_ENVIRONMENT_TYPE` was explicitly set to `'local'` in `wp-config.php` (`wp config set WP_ENVIRONMENT_TYPE local --type=constant`). Confirmed live: Basic Auth against `/wp-json/wp/v2/users/me` returned `401 rest_not_logged_in` before this constant was set, and the correct authenticated user after.

### Content model mapping

**Page.** WordPress natively splits static content into two separate post types with two separate endpoints — `page` (`/wp/v2/pages`) and `post` (`/wp/v2/posts`) — which doesn't cleanly fit `Page.pageType: "landing" | "blog" | "service" | "other"`, a single unified type or content with a sub-type field, not two structurally different content shapes. Rather than branch every adapter method on `pageType` to decide which of two endpoints to call, the plan is a **single custom post type** (`ai_cms_page`, REST base `ai-cms-pages`) registered by this project's own companion code — one uniform endpoint for every `Page` regardless of `pageType`, exactly mirroring how Sanity's own single `page` document type already works today. `pageType` itself becomes a custom meta field on that post type (see gap analysis below), not a WordPress-native distinction.

**ContentBlock[] ↔ Gutenberg blocks.** WordPress's block editor stores body content as one HTML string annotated with HTML comments per block (`<!-- wp:paragraph -->...<!-- /wp:paragraph -->`) — structurally close to Portable Text's own "array of typed blocks" shape, which is encouraging for the interface's own "content-shape translation is adapter-only" design (§6) actually holding up. The critical finding, verified live: the REST API's *default* response (`content.rendered`) is fully-rendered HTML with the block comment markers already stripped — reading that would lose block boundaries entirely, the same failure mode as never having discrete blocks at all. The block-annotated source only appears in `content.raw`, which only appears when the request is authenticated *and* passes `?context=edit`. Confirmed live against a real draft page: `content.raw` came back with clean `<!-- wp:paragraph -->`/`<!-- wp:heading -->` boundaries intact, parseable back into discrete `ContentBlock`s the same way `portableTextToContentBlocks` already parses Portable Text today.

Per-block-type mapping:
- `heading` ↔ `core/heading` (`level` lives in the block's own JSON attributes, e.g. `{"level":2}`).
- `paragraph` ↔ `core/paragraph` (the existing `blockquote` style variant maps to `core/quote`, a distinct block type in Gutenberg rather than a style flag on paragraph — a real, if minor, structural difference from both this app's own `ContentBlock` model and Sanity's Portable Text style variants).
- `cta` ↔ `core/buttons` → `core/button` (text/href/target map cleanly onto the block's own attributes).
- `image` ↔ `core/image`, referencing a media library attachment by ID — see the alt-text gap below for why this one is more complicated than it looks.
- `faq-schema` ↔ no Gutenberg equivalent, same decision Sanity's adapter already made (§4/§5): FAQ JSON-LD is generated by the app at read/render time from `faqItems`, never authored as body content.

**A second real finding, independent of blocks:** a freshly-created draft page's `slug` came back as an empty string from the REST API — in *both* the default and `context=edit` views — confirmed live by creating three sample pages via `wp post create` and querying each one. WordPress only finalizes `post_name` (its internal slug field) automatically on first publish; an unpublished draft that was never given one explicitly just doesn't have one yet. `CmsAdapter`'s own design already requires `CreatePageInput.slug` as the natural key regardless of status (§6, §7) — the resolution is on the adapter's own write side, not a gap to route around: **always pass an explicit `slug` in the create payload**, which makes WordPress persist a real `post_name` immediately no matter what `status` the page is created with. Documented here because it would have been a confusing intermittent bug (works for published pages, silently returns an empty slug for drafts) if it surfaced during implementation instead of being caught during mapping.

**A third finding:** `getPages()`'s equivalent REST call must explicitly pass `status=draft,in_review,approved,publish` (once the two custom statuses below exist) — confirmed live that `/wp/v2/pages` with no `status` param, even fully authenticated, returns *only* `publish` status content by default. An adapter that queried without this parameter would silently behave as if every draft/in-review/approved page didn't exist — the same class of bug SPEC.md §20 already found and fixed once this phase for a different reason (missing `siteId` attribution), worth naming explicitly here so it isn't rediscovered the hard way during implementation.

### Gap analysis: what WordPress can't do that the Sanity adapter currently assumes

| Sanity-side concept | Native WordPress equivalent | Gap / decision |
| --- | --- | --- |
| `Page.qualityScore` (Day 14) | None | Custom post meta (`_ai_cms_quality_score`, a plain number), `show_in_rest: true`. |
| `Page.faqItems[]` (Day 2, embedded array) | None (no native repeater/array meta type) | Custom post meta storing a JSON-encoded array, decoded/encoded at the adapter boundary — the same "translation is adapter-only" boundary Portable Text already crosses (§6), just JSON instead of Portable Text. |
| `Page.status` (draft/in-review/approved/published, §18) | `post_status` (draft/pending/private/publish/future/trash — a different enum) | Register two **custom post statuses** (`in_review`, `approved`) via WordPress's own `register_post_status()`, used alongside native `draft`/`publish` — a first-class WP core mechanism, not a workaround meta field, and it means the mapping is a straight 1:1 rename rather than a parallel status-tracking system living outside `post_status` entirely. |
| `seo.metaTitle` / `seo.metaDescription` (Day 2 schema) | Neither exists in WordPress core | Two more custom post meta fields (`_ai_cms_seo_meta_title`, `_ai_cms_seo_meta_description`) rather than depending on Yoast/RankMath's own (incompatible-between-plugins) meta keys — same "don't require a plugin this adapter can't guarantee exists" reasoning as choosing Application Passwords over a bespoke plugin for auth. |
| `ImageAsset.altText` | `media` attachment's native `alt_text` field | Exists natively — the one piece of this gap analysis that's *not* a gap. |
| `ImageAsset.altTextStatus` (missing/ai-generated/reviewed, Day 2) | None | The real gap, and a deeper one than it first looks: WordPress's `alt_text` lives on the **attachment**, one value shared by every page that embeds it — but Sanity's own adapter already had to solve exactly this tension on Day 5 (§7, point 3) by addressing images per-*usage* (an inline block's own `_key`) rather than per-asset, because the same underlying image can carry different alt text on different pages. Live-checked whether Gutenberg has an equivalent escape hatch: `core/image` blocks *do* carry their own `alt` attribute independently in the block's own JSON attributes, which can diverge from the attachment's `alt_text` — so per-usage alt text is representable in WordPress too, just not through the media endpoint alone; the adapter will need to read/write it from the parsed block attributes inside `content.raw`, the same place block-level `ContentBlock` data already comes from. The *status* value itself (missing/ai-generated/reviewed) still has nowhere to live natively either way — planned as a post meta field on the **page**, not the attachment (matching the per-usage principle), storing a small JSON map of block `_key` → status, parallel to how `faqItems` will be stored as JSON. |

### Delivery mechanism for the custom fields: a small mu-plugin, not ACF

Task item 2 raised ACF by name as one way custom fields commonly get exposed in WordPress. Decided against depending on it: a real client site (or a reviewer standing up their own test WordPress) can't be assumed to have ACF installed, and requiring it would make the adapter's own portability worse than the problem it's solving. The plan instead is a small, versioned **must-use plugin** — a single PHP file living at `wp-content/mu-plugins/`, using only WordPress core's own `register_post_type()`, `register_post_status()`, and `register_post_meta()` APIs (all REST-exposable via `show_in_rest`, no third-party dependency) — the WordPress-side equivalent of how `studio/schemaTypes/` already keeps Sanity's own schema-as-code checked into this repo rather than configured by hand in a UI.

### What's deliberately not done today

No `WordPressAdapter.ts`. No mu-plugin PHP file. No custom post type or custom post statuses actually registered on the staging site yet (today's sample content uses WordPress's native `page` post type and native `draft`/`publish` statuses only, since the custom ones don't exist yet). All of that is tomorrow's implementation work, designed together with its own consumer rather than locked in today before the adapter code that will actually use it exists — the same sequencing Day 4's interface design kept relative to Day 5's implementation.

### Staging environment

A dedicated local WordPress 7.1.1 install, kept completely separate from this machine's many other unrelated WordPress projects already under `laragon/www/`:

- **Location:** `c:\laragon\www\ai-cms-assistant-wp` — a clean core extraction (not a copy of any existing install on this machine, several of which turned out to have non-standard hardened folder names like `wp-admin-latest`).
- **Database:** a dedicated `ai_cms_assistant_wp_db` MySQL database (Laragon's existing MySQL 8.0.30 instance, already running) — no existing database on this machine was touched or reused.
- **Served via** `wp server --host=localhost --port=8890` (WP-CLI's own thin wrapper around PHP's built-in server, with a router that correctly emulates pretty-permalink rewriting) rather than through Laragon's Apache. Laragon auto-generates a `<foldername>.test` virtual host per project folder, but only via its own GUI's file-watcher/reload action — not purely from a new folder appearing on disk while it runs in the background (confirmed: no vhost or hosts-file entry was auto-created for the new folder). Editing Apache's `sites-enabled` config or the Windows hosts file directly, outside Laragon's own tooling, was deliberately avoided as a system-level change with more blast radius than this task warranted; `wp server` needed no such changes and is just as real a "local staging install" for the REST API work tomorrow actually needs.
- **Application Passwords:** enabled (`WP_ENVIRONMENT_TYPE=local`, see above) and one generated for the `admin` user, verified live against `/wp-json/wp/v2/users/me`. Credentials live in `.env.local` (`WORDPRESS_STAGING_URL`/`WORDPRESS_STAGING_USERNAME`/`WORDPRESS_STAGING_APPLICATION_PASSWORD`) — never committed; `.env.example` documents the variable names with no real values, same convention every other credential in this project already follows.
- **Sample content:** three pages mirroring the same three demo pages already seeded in the Sanity project (a rich flagship page, a mid-content blog-style page, and a deliberately thin draft placeholder) — created with real Gutenberg block markup (headings + paragraphs) via `wp post create`, so tomorrow's block-parsing code has real `content.raw` to parse rather than a hand-written fixture. Two media items attached, one with `alt_text` set and one deliberately without, to exercise the alt-text gap above once the adapter exists.

Tomorrow starts the actual implementation: read operations (list/get pages and media) through the mapped interface, against this exact staging site.

## 23. WordPress Adapter: Read Path (Day 27)

Implemented `WordPressAdapter` (`src/lib/cms/wordpressAdapter.ts`) against the real staging site, plus everything yesterday's scoping deferred: the `ai_cms_page` custom post type, `in_review`/`approved` custom statuses, and custom meta fields, all delivered as a versioned mu-plugin (`wordpress/mu-plugins/ai-cms-assistant-fields.php`) deployed to the staging install's `wp-content/mu-plugins/`. Read-only today (`getPages`, `getPage`, `listImages`); `createPage`/`updatePage`/`updateImage` all throw a clear "not implemented yet" error, same shape as any interface method a CMS genuinely can't do yet.

### Three gaps yesterday's mapping didn't anticipate

Implementing against the real interface — not just designing against it — surfaced three things Day 26's gap table missed, the same pattern Day 5 (§7) set for this project: fix and document, don't silently work around.

1. **Quality score's empty state needed a type change on the WordPress side.** A `register_post_meta()` field typed `'integer'` returns `0` — its type's empty value — when never set, indistinguishable from a real score of zero. Changed `_ai_cms_quality_score` to a `'string'` meta field storing a numeric string; empty string means "never scored," parsed to `null` in the adapter. Confirmed live: an unscored page's `meta._ai_cms_quality_score` comes back as `""`, mapped to `qualityScore: null`, not `0`.

2. **`pageType` and `targetKeyword` had no custom field at all in yesterday's gap table** — only quality score, FAQs, status, and SEO meta were listed. `pageType` is a *required* field on the domain `Page` type with no WordPress-native equivalent (WordPress's own type/taxonomy system models a different axis entirely). Added `_ai_cms_page_type` and `_ai_cms_target_keyword` custom meta fields; an unset or unrecognized `pageType` value defaults to `"other"` rather than throwing.

3. **Alt-text status is a harder gap than "needs a bridging field" — it has no real WordPress equivalent, full stop.** Yesterday's notes speculated a per-block JSON map (mirroring Sanity's per-usage `_key` model) stored on the page, since Gutenberg's `core/image` block *can* carry its own `alt` attribute independent of the attachment's `alt_text`. Implementing `listImages()` against the plain `/wp/v2/media` endpoint (task item 3's explicit framing — "against WordPress's media library endpoint") made clear that building and maintaining that per-usage map is real scope with no read-path payoff yet, since nothing has written to it. Simplified instead: `listImages()` reads the native attachment-level `alt_text` directly, and `altTextStatus` is *derived* — non-empty `alt_text` maps to `"reviewed"` (a human wrote it directly in wp-admin, which is a real review, just one this app didn't perform), empty maps to `"missing"`. A genuine `"ai-generated, not yet reviewed"` state can't be represented until write support gives that workflow its own field — deferred, not attempted, and called out explicitly in code (`wordpressAdapter.ts`'s file-header comment) rather than silently approximated. `usedOnPageIds` has the same shape of limitation as Sanity's own (§7, point 3), for a different underlying reason: WordPress's media `post` field is the attachment's *upload-time parent*, not a real "every page this appears on" index — confirmed live that a media item referenced inside an `ai_cms_page`'s body can still report its `post` field pointing at a completely different (and differently-typed) post it happened to be uploaded through.

### Two more live-verified WordPress quirks

- **Gutenberg core blocks serialize without their `core/` namespace prefix.** The block comment is `<!-- wp:paragraph -->`, not `<!-- wp:core/paragraph -->` — WordPress's own `serialize_block()` elides the `core` namespace specifically. The block parser strips a leading `core/` defensively anyway (harmless, and correct for any future non-core block that *does* carry a namespace), but this is why block-name matching in `wordpressAdapter.ts` works against bare names like `"heading"`/`"paragraph"`/`"buttons"`/`"button"`/`"quote"`/`"image"`.
- **A custom post type's slug can collide with an unrelated post type's slug.** Creating an `ai_cms_page` with the same slug as an existing native `page` (both public post types sharing one rewrite namespace) got silently suffixed (`-2`) by WordPress's own `wp_unique_post_slug()`, rather than erroring. Not a bug in this adapter — a real WordPress behavor worth knowing before it looks like a slug wasn't saved correctly.

### Content-shape translation

`ContentBlock[] ↔ Gutenberg` is implemented as a small, deliberately non-spec-compliant regex-based block parser — enough to round-trip this app's own vocabulary (heading, paragraph, quote→paragraph-with-blockquote-style, buttons→button as `cta`, image), with everything else (galleries, embeds, columns, third-party blocks) silently skipped rather than crashing the read. Block ids are synthesized from read-time position (`wp-block-N`) since WordPress has no per-block persistent identity like Sanity's `_key`. This mirrors sanityAdapter.ts's own "lossy, on purpose" precedent (§7, point 1) rather than attempting a general Gutenberg parser this project doesn't need.

### Connect flow: WordPress as a second CMS option

`ConnectSiteForm.tsx` gained a CMS radio selector (Sanity/WordPress) that conditionally renders each CMS's own fields; `connectSiteAction.ts` now validates against a `z.discriminatedUnion("cms", [...])` schema and branches into `connectSanitySite`/`connectWordPressSite`, each still validating via one real throwaway-adapter call before persisting (unchanged principle from Day 6, just now with a `WordPressAdapter` on one branch). `resolveAdapter.ts`'s `buildSanityAdapter` became `buildAdapterForSite`, dispatching on `site.cms` to either `buildSanityAdapter` or the new `buildWordPressAdapter` — `withQualityScoring` wraps either result identically, unchanged, since it only ever depended on the generic `CmsAdapter` interface (Day 15, §11).

This required a real Prisma schema change, not just new code: `Site.sanityProjectId`/`sanityDataset` were previously **required** non-nullable columns — a WordPress-backed Site has neither, so they moved to nullable, with the "must be present for this cms value" check moved into `buildSanityAdapter`/`buildWordPressAdapter` themselves. Three new nullable columns (`wordpressUrl`, `wordpressUsername`, `wordpressAppPasswordCiphertext`) mirror the Sanity fields one-for-one, including reusing `encryptSiteToken`/`decryptSiteToken` unchanged — that function was already generic AES-256-GCM, never actually Sanity-specific despite having exactly one prior caller. `next.config.ts` also needed the staging site's own host added to `images.remotePatterns`, the same way any new externally-hosted image source would.

### What "the screens didn't need to change" actually meant

`/pages`, `/pages/[slug]`, and `/media` render `WordPressAdapter`'s output with zero component changes — verified by reading `ContentBlocks.tsx` and `MediaLibraryCard.tsx` field-by-field against the adapter's actual mapped output (`metadata.url`/`level`/`style`/`href`/`altTextStatus`, `ImageAsset.usedOnPageIds`) rather than assuming compatibility. **What was verified live end-to-end:** `WordPressAdapter.getPages()`/`getPage()`/`listImages()` running for real against the staging site (not mocked) — confirmed correct Gutenberg parsing, custom meta decoding, status mapping, and FAQ JSON decoding on real seeded content. **What was not driven end-to-end:** an actual authenticated browser session hitting `/pages` through this app's real NextAuth login — reconstructing that would have meant putting this project's real database connection string into a script file, which a credential-safety check in this environment correctly declined to run. The screens' compatibility is therefore verified by direct data-shape inspection plus a real (non-mocked) adapter run, not by a rendered screenshot — noted here rather than silently claimed as more thoroughly checked than it was.

### Tests

`src/lib/cms/wordpressAdapter.test.ts` mirrors `sanityAdapter.test.ts`'s injectable-client pattern (`WordPressApiClient` in place of `SanityQueryClient`) — status mapping (including the unrecognized-status-falls-back-to-draft case), quality-score empty-string-means-null, pageType defaulting, Gutenberg block parsing (including the unsupported-block-is-skipped case), FAQ JSON decoding (including malformed-JSON-means-empty-list), and alt-text-status derivation. `connectSiteAction.test.ts` gained WordPress-branch coverage (validate-then-persist, validation failure, malformed URL) alongside the existing Sanity-branch tests, all updated to include the new `cms` discriminator field the form now sends.

Tomorrow implements the write side: create/update page, update image alt text.

## 24. WordPress Adapter: Write Path (Day 28) — completes the interface

Implemented `createPage`/`updatePage`/`updateImage` in `WordPressAdapter`, the inverse of Day 27's read mapping, and pointed the existing AI features at it unmodified. The adapter now implements every `CmsAdapter` method against WordPress, same as Sanity's.

### The alt-text-status decision, made concrete

Day 27 deferred alt-text-status to a pure derivation (non-empty `alt_text` → "reviewed", empty → "missing") since no write path existed to need more. Implementing `updateImage` forced a real decision, because `saveAltTextAction.ts` — unmodified, not something this phase gets to redesign — actively persists **two different** outcomes for the same non-empty `alt_text`: accepting an AI suggestion as-is writes `"ai-generated"`; accepting an edited version writes `"reviewed"`. Presence-based derivation cannot represent that distinction; the moment a write path exists, "deferred" becomes "wrong," not just "incomplete."

Resolved with a real custom field: `_ai_cms_alt_text_status`, registered on WordPress's `attachment` post type via `register_post_meta()` (mu-plugin, same mechanism as every `ai_cms_page` field). Scoped to the **attachment**, not per-usage/per-block — a deliberate departure from Day 26's original per-block JSON-map idea (which mirrored Sanity's own per-usage model). The reason: this adapter's `listImages()`/`updateImage()` already address images by WordPress media ID, attachment-centric from Day 27's read-path decision onward; adding per-usage tracking now would mean maintaining two different addressing schemes for the same images, for a distinction (same image, different alt text on two different pages) this app's own WordPress integration doesn't otherwise model. `toImageAsset()` reads the real field when present and only falls back to presence-based derivation for attachments this app never wrote to — pre-existing media, or alt text set by hand in wp-admin, which have no stored status yet. Verified live: writing `altTextStatus: "ai-generated"` against a real attachment and reading it back via both `updateImage`'s own return value and a fresh `listImages()` call both correctly report `"ai-generated"`, not the `"reviewed"` the old derivation would have silently produced.

### Content serialization: the inverse of Day 27's parser

`contentBlocksToGutenberg()` mirrors the read-side parser's own scope exactly — heading, paragraph (plain or blockquote→`core/quote`), cta (buttons→button), image — and throws for `faq-schema` or anything unrecognized, matching `contentBlocksToPortableText`'s policy in `sanityAdapter.ts` of failing loudly on untranslatable content rather than silently dropping it. `createPage` always sends an explicit `slug` (Day 26's gotcha: WordPress only finalizes `post_name` on first publish otherwise). An image block's `src` is resolved from `metadata.url` when already present (the common case — editing a page whose image blocks were just read) or fetched once via `/media/{id}` when only `metadata.assetId` is available (a brand-new image block), since Gutenberg's own markup embeds a literal `<img src>`, not just a block attribute reference.

**A real round-trip bug, found by writing and then reading back real data — not by code review.** The first live write-path check created a page with a `cta` block (`openInNewTab: true`), and the re-fetched page reported `openInNewTab: false`. The writer was correct — real round-trip across the REST API. The Day 27 *parser* was the bug: `wpBlockToContentBlock`'s `"buttons"` case hardcoded `openInNewTab: false` unconditionally, never reading it back from the button's own `linkTarget` attribute or the anchor's `target="_blank"`. Silent and total — every CTA ever read from WordPress would have reported "opens in the same tab" regardless of how it was actually authored, in both directions. Fixed to read `attrs.linkTarget === "_blank"` (the authoritative source for content this app wrote) with a fallback to scanning the anchor's own `target="_blank"` (for button markup authored directly in the block editor). A regression test (`wordpressAdapter.test.ts`) pins the fix; re-running the live check confirmed `openInNewTab: true` now survives create → read intact. Documented here rather than quietly fixed, because it's a direct demonstration of why task item 3 ("confirm they work... this is the real validation of the whole adapter pattern") asked for live verification instead of trusting the unit tests alone — the mocked tests for `getPage` never exercised a button block with `openInNewTab: true` at all, so nothing in the existing suite could have caught this.

`updatePage` only sends the WordPress fields a given `UpdatePageInput` actually touches — critical because `withQualityScoring`'s `autoScore.ts` calls `updatePage(id, { qualityScore })` alone after **every** create/update, and WordPress's meta-update semantics only touch submitted keys (confirmed live), so this never needed special-casing to avoid blanking out `content` on a score-only save.

### AI features against the real adapter, unmodified

Verified live, through the real unmodified action code (not just the raw adapter), with the DB/auth layer mocked the same way `connectSiteAction.test.ts` already does and a real `WordPressAdapter` wired in via `getAdapterForCurrentUser`:

- **`saveDraftPageAction.ts`** (Generate Page's save path, Day 11) — `createPage` with no `cmsDocumentId`, then a second call with one — created and updated a real WordPress page, `withQualityScoring` auto-scoring both as designed (no code in this file or its Sanity-era callers changed).
- **Block regeneration (Day 12)** — `regenerateBlockAction.ts` never persists directly (SPEC.md §17); its accepted output flows through the same `saveDraftPageAction.ts` call above with the regenerated block merged into `contentBlocks`, so this is the same verification, not a separate one — exactly as designed.
- **`saveAltTextAction.ts`** (single-image alt text, Day 17) — `updateImage` correctly set both `alt_text` and the new `_ai_cms_alt_text_status` field, with `edited: false` correctly producing `"ai-generated"`.

No screen or Server Action needed a single WordPress-specific line — the adapter pattern held under real write traffic, not just reads.

### Tests

`wordpressAdapter.test.ts` grew from 13 to 26 tests: `createPage` (payload shape, explicit slug, status mapping, validation-before-network, error propagation, a cta-without-href failure), `updatePage` (only-changed-fields including the score-only case, full content re-serialization, null-score-means-empty-string, invalid-status rejection), `updateImage` (writes both fields, the ai-generated-vs-reviewed distinction, invalid-status rejection), and the `openInNewTab` regression above.

Tomorrow runs the full feature set against the staging WordPress site end to end and fixes whatever gaps show up.
