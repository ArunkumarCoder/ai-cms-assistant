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

| #   | Call                                      | Purpose                                                    | Vision? | Est. input / output tokens | Default provider     | Est. cost/call     |
| --- | ----------------------------------------- | ---------------------------------------------------------- | ------- | -------------------------- | -------------------- | ------------------ |
| 1   | Page generation                           | Draft title, meta description, content blocks from a brief | No      | ~500 in / ~1,200 out       | Groq (Llama 3.3 70B) | ~$0.0006           |
| 2   | Single-block regeneration                 | Regenerate one block (heading/paragraph/CTA)               | No      | ~300 in / ~250 out         | Groq (Llama 3.3 70B) | ~$0.0001           |
| 3   | SEO scoring & suggestions                 | Analyze page text, produce score + suggestions             | No      | ~1,500 in / ~600 out       | Groq (Llama 3.3 70B) | ~$0.0005           |
| 4   | Alt text generation (single)              | Describe one image for accessibility/SEO                   | **Yes** | ~300 in (+image) / ~60 out | OpenAI (GPT-4o-mini) | ~$0.006            |
| 5   | Alt text generation (batch)               | Same as #4, looped per image                               | **Yes** | same per image as #4       | OpenAI (GPT-4o-mini) | ~$0.006 × N images |
| 6   | FAQ generation                            | Produce 3–8 Q&A pairs from page content                    | No      | ~1,200 in / ~700 out       | Groq (Llama 3.3 70B) | ~$0.0006           |
| 7   | FAQ schema (JSON-LD) formatting           | Convert FAQ items into valid FAQPage schema                | No      | ~500 in / ~400 out         | Groq (Llama 3.3 70B) | ~$0.0003           |
| 8   | Content quality scoring (optional/future) | Tone/readability check before publish                      | No      | ~1,200 in / ~300 out       | Groq (Llama 3.3 70B) | ~$0.0003           |

Notes:

- Groq pricing assumed at Llama 3.3 70B rates (~$0.59/M input, ~$0.79/M output as of late 2025 — **reverify**).
- OpenAI vision pricing assumed at GPT-4o-mini rates (image tokenization adds a fixed per-image overhead on top of text tokens — **reverify**, and consider Claude Haiku as a vision fallback if OpenAI is unavailable).
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

Even doubling every estimate for safety margin, a full 15-page demo site is well under $1 in AI spend under this routing — the alt-text vision calls dominate the cost, which is expected and is the reason the routing rule keeps vision on a paid frontier model while everything else runs on cheap/fast Groq. **Reverify all per-token rates before quoting this number in a case study.**

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
