import type {
  AltTextStatus,
  ContentBlock,
  FaqItem,
  FaqItemSource,
  ImageAsset,
  Page,
  PageStatus,
  PageType,
  Site,
} from "@/types";
import type { CmsAdapter } from "./adapter";
import type {
  CreatePageInput,
  ImageListFilter,
  PageSummary,
  UpdateImageInput,
  UpdatePageInput,
} from "./types";

// WordPress implementation of CmsAdapter (see ./adapter.ts for the contract).
// Day 27 — the read path only; createPage/updatePage/updateImage all throw
// (write support is tomorrow's task). This is the actual test of whether Day
// 4's interface boundary holds up against a second, very different CMS —
// three things implementing the read side revealed that yesterday's mapping
// notes (SPEC.md §22) didn't quite anticipate, fixed here rather than
// silently worked around:
//
// 1. Quality score needed a type change on the WordPress side. A registered
//    integer meta field returns `0` (its type's empty value) when never set,
//    indistinguishable from a real score of zero. The mu-plugin
//    (wordpress/mu-plugins/ai-cms-assistant-fields.php) stores
//    `_ai_cms_quality_score` as a numeric STRING instead — empty string means
//    "never scored," parsed to `null` here — so this adapter never has to
//    guess.
//
// 2. `pageType` (required on `Page`, no WordPress-native equivalent) and
//    `targetKeyword` needed their own custom meta fields
//    (`_ai_cms_page_type`, `_ai_cms_target_keyword`) that yesterday's gap
//    table didn't call out — only quality score, FAQs, status, and SEO meta
//    were listed. An unset/unrecognized pageType defaults to "other".
//
// 3. Alt-text status has no real WordPress equivalent, full stop — not just
//    "needs a bridging field," as yesterday's notes speculated for a
//    per-block JSON map. WordPress's media library tracks alt text per
//    *attachment*, not per *usage* (unlike Sanity's per-imageBlock model),
//    and has no workflow-state concept at all. This adapter approximates:
//    non-empty native `alt_text` -> "reviewed" (a human wrote it directly in
//    wp-admin, which is a real review), empty -> "missing". A genuine
//    "ai-generated, not yet reviewed" state can't be represented until
//    write support adds a status field of its own — deferred, not attempted
//    here. See SPEC.md §23.
//
// Also inherits two already-known WordPress REST gotchas from yesterday's
// staging investigation (SPEC.md §22): every list/detail request passes
// `status=draft,in_review,approved,publish` explicitly (the API silently
// hides everything but `publish` otherwise), and every content read uses
// `context=edit` (the only way to get unprocessed block markup via
// `content.raw` instead of sanitized `content.rendered`).

const REST_PREFIX = "/wp-json/wp/v2";
const PAGE_ENDPOINT = "ai-cms-pages";
const ALL_STATUSES = "draft,in_review,approved,publish";
const PAGE_LIST_FIELDS = "id,slug,status,title,meta,date_gmt,modified_gmt";

// The narrow slice of "talk to a WordPress REST API" the adapter actually
// calls, so unit tests can inject a plain mock instead of real `fetch` — same
// reasoning as sanityAdapter.ts's SanityQueryClient.
export interface WordPressApiClient {
  get<T>(path: string, searchParams?: Record<string, string>): Promise<T>;
}

export class FetchWordPressApiClient implements WordPressApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly applicationPassword: string,
  ) {}

  async get<T>(path: string, searchParams: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${REST_PREFIX}${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }

    const credentials = Buffer.from(`${this.username}:${this.applicationPassword}`).toString(
      "base64",
    );
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `WordPress REST API request to "${path}" failed: ${response.status} ` +
          `${response.statusText}${body ? ` — ${body}` : ""}`,
      );
    }

    return response.json() as Promise<T>;
  }
}

// ---- Raw WordPress REST shapes (only the fields this adapter reads) -------

interface WpRenderedField {
  raw?: string;
  rendered: string;
}

interface WpPage {
  id: number;
  slug: string;
  status: string;
  title: WpRenderedField;
  content: WpRenderedField;
  date_gmt: string;
  modified_gmt: string;
  meta?: Record<string, string>;
}

interface WpMedia {
  id: number;
  source_url: string;
  alt_text: string;
  // The attachment's upload-time parent post id, or 0/omitted if none — see
  // gap #3 in the file header for why this can't mean "used on this page."
  post: number;
  date_gmt: string;
  modified_gmt: string;
}

export class WordPressAdapter implements CmsAdapter {
  constructor(
    private readonly site: Site,
    private readonly client: WordPressApiClient,
  ) {}

  async getPages(): Promise<PageSummary[]> {
    const rows = await this.client.get<WpPage[]>(`/${PAGE_ENDPOINT}`, {
      status: ALL_STATUSES,
      context: "edit",
      per_page: "100",
      orderby: "modified",
      order: "desc",
      _fields: PAGE_LIST_FIELDS,
    });
    return rows.map((row) => toPageSummary(row, this.site));
  }

  async getPage(slug: string): Promise<Page | null> {
    const rows = await this.client.get<WpPage[]>(`/${PAGE_ENDPOINT}`, {
      slug,
      status: ALL_STATUSES,
      context: "edit",
    });
    const row = rows[0];
    return row ? toPage(row, this.site) : null;
  }

  async createPage(_data: CreatePageInput): Promise<Page> {
    throw new Error(
      "WordPressAdapter.createPage is not implemented yet — write support is Phase 6's next day.",
    );
  }

  async updatePage(_cmsDocumentId: string, _data: UpdatePageInput): Promise<Page> {
    throw new Error(
      "WordPressAdapter.updatePage is not implemented yet — write support is Phase 6's next day.",
    );
  }

  async listImages(filter?: ImageListFilter): Promise<ImageAsset[]> {
    const rows = await this.client.get<WpMedia[]>("/media", {
      media_type: "image",
      per_page: "100",
    });
    const images = rows.map((row) => toImageAsset(row, this.site));
    if (!filter?.altTextStatus) return images;
    return images.filter((image) => image.altTextStatus === filter.altTextStatus);
  }

  async updateImage(_cmsAssetId: string, _data: UpdateImageInput): Promise<ImageAsset> {
    throw new Error(
      "WordPressAdapter.updateImage is not implemented yet — write support is Phase 6's next day.",
    );
  }
}

// ---- Page / PageSummary mapping -------------------------------------------

const WP_TO_DOMAIN_STATUS: Record<string, PageStatus> = {
  draft: "draft",
  in_review: "in-review",
  approved: "approved",
  publish: "published",
};

// Anything outside our four registered statuses (WordPress's own pending/
// private/future/trash) has no place in this app's workflow — fall back to
// "draft" rather than throwing, so an unexpected status on a page edited
// directly in wp-admin doesn't take down the whole list view.
function toDomainStatus(wpStatus: string): PageStatus {
  return WP_TO_DOMAIN_STATUS[wpStatus] ?? "draft";
}

const PAGE_TYPES: PageType[] = ["landing", "blog", "service", "other"];

function toPageType(value: string | undefined): PageType {
  return value && (PAGE_TYPES as string[]).includes(value) ? (value as PageType) : "other";
}

// See file header, gap #1: empty string means "never scored," not zero.
function toQualityScore(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function toGmtIso(gmtDate: string | undefined): string {
  // WordPress's `_gmt` fields come back as "2026-09-29T10:15:00" — no "Z" —
  // even though they're already UTC. Appending it is required for
  // `new Date(...)`/ISO consumers elsewhere in the app to parse it as UTC
  // instead of the server's local time.
  if (!gmtDate) return new Date(0).toISOString();
  return gmtDate.endsWith("Z") ? gmtDate : `${gmtDate}Z`;
}

function toPage(row: WpPage, site: Site): Page {
  const meta = row.meta ?? {};
  const blocks = parseGutenbergBlocks(row.content.raw ?? row.content.rendered);

  return {
    id: String(row.id),
    siteId: site.id,
    cmsDocumentId: String(row.id),
    slug: row.slug,
    title: decodeHtmlEntities(row.title.raw ?? row.title.rendered),
    metaDescription: meta._ai_cms_seo_meta_description || "",
    targetKeyword: meta._ai_cms_target_keyword || undefined,
    pageType: toPageType(meta._ai_cms_page_type),
    status: toDomainStatus(row.status),
    contentBlocks: blocks
      .map((block, order) => wpBlockToContentBlock(block, order))
      .filter((block): block is ContentBlock => block !== null),
    latestSeoAuditId: undefined,
    faqItems: toFaqItems(meta._ai_cms_faq_items, String(row.id)),
    qualityScore: toQualityScore(meta._ai_cms_quality_score),
    createdAt: toGmtIso(row.date_gmt),
    updatedAt: toGmtIso(row.modified_gmt),
  };
}

function toPageSummary(row: WpPage, site: Site): PageSummary {
  const meta = row.meta ?? {};
  const faqItems = toFaqItems(meta._ai_cms_faq_items, String(row.id));

  return {
    id: String(row.id),
    siteId: site.id,
    cmsDocumentId: String(row.id),
    slug: row.slug,
    title: decodeHtmlEntities(row.title.raw ?? row.title.rendered),
    metaDescription: meta._ai_cms_seo_meta_description || "",
    targetKeyword: meta._ai_cms_target_keyword || undefined,
    pageType: toPageType(meta._ai_cms_page_type),
    status: toDomainStatus(row.status),
    latestSeoAuditId: undefined,
    qualityScore: toQualityScore(meta._ai_cms_quality_score),
    faqCount: faqItems.length,
    createdAt: toGmtIso(row.date_gmt),
    updatedAt: toGmtIso(row.modified_gmt),
  };
}

// ---- FAQ items --------------------------------------------------------------

interface StoredFaqItem {
  id?: string;
  question?: string;
  answer?: string;
  order?: number;
  source?: string;
}

function toFaqItems(raw: string | undefined, pageId: string): FaqItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON in the meta field (hand-edited in wp-admin, say)
    // shouldn't take down the whole page read — treat it as "no FAQs yet."
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as StoredFaqItem[]).map((item, index) => ({
    id: item.id ?? `faq-${index}`,
    pageId,
    question: item.question ?? "",
    answer: item.answer ?? "",
    order: typeof item.order === "number" ? item.order : index,
    source: (item.source === "manual" ? "manual" : "ai-generated") as FaqItemSource,
  }));
}

// ---- Gutenberg block parsing (read-only) ------------------------------------
//
// Deliberately not a spec-compliant Gutenberg parser — just enough to
// round-trip the small block vocabulary this app's own content uses
// (heading, paragraph, quote, buttons>button, image). Anything else
// (galleries, embeds, third-party blocks, columns) is silently skipped, same
// "lossy, on purpose" tradeoff sanityAdapter.ts already documents for
// Portable Text marks. Block ids are synthesized from read-time position
// (`wp-block-N`), not a stable identity — WordPress has no per-block key
// like Sanity's `_key` to reuse.

interface WpBlock {
  blockName: string;
  attrs: Record<string, unknown>;
  innerHTML: string;
}

const BLOCK_PATTERN = /<!--\s*wp:(\S+?)(\s+\{.*?\})?\s*-->([\s\S]*?)<!--\s*\/wp:\1\s*-->/g;

function parseGutenbergBlocks(raw: string): WpBlock[] {
  const blocks: WpBlock[] = [];
  for (const match of raw.matchAll(BLOCK_PATTERN)) {
    const [, blockName, attrsJson, innerHTML] = match;
    let attrs: Record<string, unknown> = {};
    if (attrsJson) {
      try {
        attrs = JSON.parse(attrsJson.trim());
      } catch {
        // Malformed attrs JSON — treat as no attrs rather than failing the
        // whole page's content read.
      }
    }
    blocks.push({ blockName: blockName.replace(/^core\//, ""), attrs, innerHTML: innerHTML.trim() });
  }
  return blocks;
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function wpBlockToContentBlock(block: WpBlock, order: number): ContentBlock | null {
  const id = `wp-block-${order}`;

  switch (block.blockName) {
    case "heading": {
      const level = block.attrs.level;
      const normalizedLevel = level === 3 || level === 4 ? level : 2;
      return {
        id,
        type: "heading",
        order,
        content: stripTags(block.innerHTML),
        metadata: { level: normalizedLevel },
      };
    }
    case "paragraph": {
      return {
        id,
        type: "paragraph",
        order,
        content: stripTags(block.innerHTML),
      };
    }
    case "quote": {
      // WordPress models a blockquote as its own block type; this app models
      // it as a paragraph-with-a-style-flag (ContentBlocks.tsx renders
      // exactly this shape already) rather than a fifth ContentBlockType.
      return {
        id,
        type: "paragraph",
        order,
        content: stripTags(block.innerHTML),
        metadata: { style: "blockquote" },
      };
    }
    case "buttons": {
      const inner = parseGutenbergBlocks(block.innerHTML).find((b) => b.blockName === "button");
      if (!inner) return null;
      const hrefMatch = inner.innerHTML.match(/<a[^>]*\shref="([^"]*)"/i);
      return {
        id,
        type: "cta",
        order,
        content: stripTags(inner.innerHTML),
        metadata: { href: hrefMatch?.[1] ?? "#", openInNewTab: false },
      };
    }
    case "image": {
      const srcMatch = block.innerHTML.match(/<img[^>]*\ssrc="([^"]+)"/i);
      if (!srcMatch) return null;
      const altMatch = block.innerHTML.match(/\salt="([^"]*)"/i);
      const alt = altMatch ? decodeHtmlEntities(altMatch[1]) : "";
      const assetId = typeof block.attrs.id === "number" ? String(block.attrs.id) : undefined;
      return {
        id,
        type: "image",
        order,
        content: alt,
        metadata: {
          url: srcMatch[1],
          assetId,
          altTextStatus: (alt ? "reviewed" : "missing") as AltTextStatus,
        },
      };
    }
    default:
      // Unrecognized/unsupported block type — skip rather than fail the read.
      return null;
  }
}

// ---- Images -----------------------------------------------------------------

function toImageAsset(row: WpMedia, site: Site): ImageAsset {
  const altText = row.alt_text && row.alt_text.length > 0 ? row.alt_text : null;
  // See file header, gap #3: WordPress has no per-usage review-status
  // concept, so this is a best-effort approximation from the one signal
  // WordPress does have — a non-empty native alt_text was written by a human
  // directly in wp-admin, which is a real review, just not one this app
  // performed.
  const altTextStatus: AltTextStatus = altText ? "reviewed" : "missing";

  return {
    id: String(row.id),
    siteId: site.id,
    cmsAssetId: String(row.id),
    url: row.source_url,
    altText,
    altTextStatus,
    // `post` is the attachment's upload-time parent, not a real usage index
    // — see file header, gap #3.
    usedOnPageIds: row.post ? [String(row.post)] : [],
    createdAt: toGmtIso(row.date_gmt),
    updatedAt: toGmtIso(row.modified_gmt),
  };
}
