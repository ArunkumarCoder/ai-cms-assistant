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
