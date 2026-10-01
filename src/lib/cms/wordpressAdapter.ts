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
// Day 27 built the read path; Day 28 (today) adds createPage/updatePage/
// updateImage, completing the interface. This is the actual test of whether
// Day 4's interface boundary holds up against a second, very different CMS —
// things implementing both directions revealed that yesterday's mapping
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
// 3. Alt-text status genuinely has no WordPress-native equivalent, so Day 27
//    derived it from native `alt_text` presence alone (non-empty ->
//    "reviewed", empty -> "missing") and deferred a real field as a read-only
//    concern. Implementing the write side today made that derivation
//    provably insufficient, not just approximate: saveAltTextAction.ts
//    actively persists "ai-generated" and "reviewed" as two *different*
//    outcomes of the same non-empty alt_text (accepted as-is vs. accepted
//    after a human edit) — a distinction presence-alone can never represent,
//    and a real gap, not a hypothetical one, the moment a write path exists.
//    Resolved with a real custom field, `_ai_cms_alt_text_status`, registered
//    on the `attachment` post type (mu-plugin) — scoped to the attachment
//    itself, not per-usage/per-block, because `listImages()`/`updateImage()`
//    already address images by WordPress media ID. The old presence-based
//    derivation remains as a fallback for attachments this app never wrote
//    to (pre-existing media, or alt text set by hand in wp-admin) that
//    therefore have no stored status yet. See SPEC.md §24.
//
// Also inherits two already-known WordPress REST gotchas from Day 26's
// staging investigation (SPEC.md §22): every list/detail request passes
// `status=draft,in_review,approved,publish` explicitly (the API silently
// hides everything but `publish` otherwise), and every content read uses
// `context=edit` (the only way to get unprocessed block markup via
// `content.raw` instead of sanitized `content.rendered`). createPage also
// always sends an explicit `slug` — a draft page's slug otherwise comes back
// empty until first publish (same section).

const REST_PREFIX = "/wp-json/wp/v2";
const PAGE_ENDPOINT = "ai-cms-pages";
const ALL_STATUSES = "draft,in_review,approved,publish";
const PAGE_LIST_FIELDS = "id,slug,status,title,meta,date_gmt,modified_gmt";

// The narrow slice of "talk to a WordPress REST API" the adapter actually
// calls, so unit tests can inject a plain mock instead of real `fetch` — same
// reasoning as sanityAdapter.ts's SanityQueryClient. `post` covers both
// create (POST to the collection) and update (POST to a single resource) —
// WordPress's REST API accepts plain POST for both, no separate PATCH verb
// needed.
export interface WordPressApiClient {
  get<T>(path: string, searchParams?: Record<string, string>): Promise<T>;
  post<T>(path: string, body: Record<string, unknown>): Promise<T>;
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
    return this.request<T>(url);
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = new URL(`${REST_PREFIX}${path}`, this.baseUrl);
    return this.request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: URL, init: RequestInit = {}): Promise<T> {
    const credentials = Buffer.from(`${this.username}:${this.applicationPassword}`).toString(
      "base64",
    );
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Basic ${credentials}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `WordPress REST API request to "${url.pathname}" failed: ${response.status} ` +
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
  meta?: Record<string, string>;
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
    return row ? this.toPageResolved(row) : null;
  }

  async createPage(data: CreatePageInput): Promise<Page> {
    assertCreatePageInput(data);

    const meta: Record<string, string> = {
      _ai_cms_page_type: data.pageType,
      _ai_cms_target_keyword: data.targetKeyword ?? "",
      // No domain field distinguishes an SEO title from the page title
      // (CreatePageInput has no separate "seoMetaTitle" — sanityAdapter.ts's
      // own createPage doesn't write Sanity's seo.metaTitle either, for the
      // same reason), so the custom field defaults to the title itself
      // rather than staying empty for no reason.
      _ai_cms_seo_meta_title: data.title,
      _ai_cms_seo_meta_description: data.metaDescription,
      _ai_cms_quality_score: data.qualityScore != null ? String(data.qualityScore) : "",
      _ai_cms_faq_items: JSON.stringify(faqItemsToWp(data.faqItems ?? [])),
    };

    const created = await this.client.post<{ id: number }>(`/${PAGE_ENDPOINT}`, {
      title: data.title,
      slug: data.slug,
      status: toWpStatus(data.status ?? "draft"),
      content: await contentBlocksToGutenberg(data.contentBlocks ?? [], this.client),
      meta,
    });

    return this.fetchPageByIdOrThrow(created.id);
  }

  async updatePage(cmsDocumentId: string, data: UpdatePageInput): Promise<Page> {
    assertUpdatePageInput(data);

    const payload: Record<string, unknown> = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.slug !== undefined) payload.slug = data.slug;
    if (data.status !== undefined) payload.status = toWpStatus(data.status);
    if (data.contentBlocks !== undefined) {
      payload.content = await contentBlocksToGutenberg(data.contentBlocks, this.client);
    }

    // WordPress's meta update only touches the keys actually present in the
    // submitted `meta` object — omitted keys are left unchanged, not reset —
    // so only the fields this update actually touches are included, same
    // "only what changed" discipline as `payload` above.
    const meta: Record<string, string> = {};
    if (data.pageType !== undefined) meta._ai_cms_page_type = data.pageType;
    if (data.targetKeyword !== undefined) meta._ai_cms_target_keyword = data.targetKeyword ?? "";
    if (data.title !== undefined) meta._ai_cms_seo_meta_title = data.title;
    if (data.metaDescription !== undefined) meta._ai_cms_seo_meta_description = data.metaDescription;
    if (data.qualityScore !== undefined) {
      meta._ai_cms_quality_score = data.qualityScore != null ? String(data.qualityScore) : "";
    }
    if (data.faqItems !== undefined) meta._ai_cms_faq_items = JSON.stringify(faqItemsToWp(data.faqItems));
    if (Object.keys(meta).length > 0) payload.meta = meta;

    await this.client.post(`/${PAGE_ENDPOINT}/${cmsDocumentId}`, payload);

    return this.fetchPageByIdOrThrow(cmsDocumentId);
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

  async updateImage(cmsAssetId: string, data: UpdateImageInput): Promise<ImageAsset> {
    assertUpdateImageInput(data);

    const payload: Record<string, unknown> = {};
    if (data.altText !== undefined) payload.alt_text = data.altText ?? "";
    if (data.altTextStatus !== undefined) {
      payload.meta = { _ai_cms_alt_text_status: data.altTextStatus };
    }

    await this.client.post(`/media/${cmsAssetId}`, payload);

    const updated = await this.client.get<WpMedia>(`/media/${cmsAssetId}`);
    return toImageAsset(updated, this.site);
  }

  private async fetchPageByIdOrThrow(id: string | number): Promise<Page> {
    const row = await this.client.get<WpPage>(`/${PAGE_ENDPOINT}/${id}`, { context: "edit" });
    return this.toPageResolved(row);
  }

  // Resolves each image block's *real* per-attachment alt-text status
  // (same field `updateImage`/`listImages` read) instead of letting the
  // block parser's own presence-based guess stand unchallenged — found
  // during Day 29's integration walkthrough: an image accepted via
  // saveAltTextAction as "ai-generated" would otherwise read back as
  // "reviewed" the moment `getPage()` parsed its block (non-empty alt text
  // being the *only* signal the old per-block derivation had), silently
  // disagreeing with what Media Library and computeQualityScore's alt-text
  // sub-score should actually see. One batched `/media?include=...` request
  // per page read, not one per image — bounded by how many images are
  // actually on this one page.
  private async toPageResolved(row: WpPage): Promise<Page> {
    const blocks = parseGutenbergBlocks(row.content.raw ?? row.content.rendered);
    const altStatusByAssetId = await this.resolveImageAltStatuses(blocks);
    return toPage(row, this.site, blocks, altStatusByAssetId);
  }

  private async resolveImageAltStatuses(blocks: WpBlock[]): Promise<Map<string, AltTextStatus>> {
    const assetIds = [
      ...new Set(
        blocks
          .filter((block) => block.blockName === "image" && typeof block.attrs.id === "number")
          .map((block) => String(block.attrs.id)),
      ),
    ];
    if (assetIds.length === 0) return new Map();

    try {
      const rows = await this.client.get<WpMedia[]>("/media", {
        include: assetIds.join(","),
        per_page: String(assetIds.length),
      });
      return new Map(rows.map((mediaRow) => [String(mediaRow.id), toAltTextStatus(mediaRow)]));
    } catch {
      // A failed lookup degrades to the old presence-based guess for this
      // page's images rather than failing the whole page read over a
      // secondary, non-essential lookup.
      return new Map();
    }
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

const DOMAIN_TO_WP_STATUS: Record<PageStatus, string> = {
  draft: "draft",
  "in-review": "in_review",
  approved: "approved",
  published: "publish",
};

function toWpStatus(status: PageStatus): string {
  return DOMAIN_TO_WP_STATUS[status];
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

function toPage(
  row: WpPage,
  site: Site,
  blocks: WpBlock[],
  altStatusByAssetId: Map<string, AltTextStatus>,
): Page {
  const meta = row.meta ?? {};

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
      .map((block, order) => wpBlockToContentBlock(block, order, altStatusByAssetId))
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

function faqItemsToWp(items: FaqItem[]): StoredFaqItem[] {
  return items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      id: item.id || `faq-${index}`,
      question: item.question,
      answer: item.answer,
      order: index,
      source: item.source,
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

function wpBlockToContentBlock(
  block: WpBlock,
  order: number,
  altStatusByAssetId: Map<string, AltTextStatus>,
): ContentBlock | null {
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
      // Found via a live round-trip check (SPEC.md §24): this used to hardcode
      // `false` regardless of how the block was written, silently losing
      // openInNewTab on every single read. The button's own `linkTarget`
      // attribute is the authoritative source (set by contentBlockToGutenberg
      // below); the anchor's `target="_blank"` is a fallback for button
      // markup this app didn't write itself (authored directly in the block
      // editor, say).
      const openInNewTab =
        inner.attrs.linkTarget === "_blank" || /target="_blank"/i.test(inner.innerHTML);
      return {
        id,
        type: "cta",
        order,
        content: stripTags(inner.innerHTML),
        metadata: { href: hrefMatch?.[1] ?? "#", openInNewTab },
      };
    }
    case "image": {
      const srcMatch = block.innerHTML.match(/<img[^>]*\ssrc="([^"]+)"/i);
      if (!srcMatch) return null;
      const altMatch = block.innerHTML.match(/\salt="([^"]*)"/i);
      const alt = altMatch ? decodeHtmlEntities(altMatch[1]) : "";
      const assetId = typeof block.attrs.id === "number" ? String(block.attrs.id) : undefined;
      // Prefer the real per-attachment status (resolveImageAltStatuses,
      // same field listImages()/updateImage() read) over the old
      // presence-only guess — see this adapter's file-header gap #3 update
      // and the toPageResolved() comment for why the guess alone was wrong.
      const resolvedStatus = assetId ? altStatusByAssetId.get(assetId) : undefined;
      return {
        id,
        type: "image",
        order,
        content: alt,
        metadata: {
          url: srcMatch[1],
          assetId,
          altTextStatus: resolvedStatus ?? ((alt ? "reviewed" : "missing") as AltTextStatus),
        },
      };
    }
    default:
      // Unrecognized/unsupported block type — skip rather than fail the read.
      return null;
  }
}

// ---- Gutenberg block serialization (write-only, inverse of the parser) -----
//
// Same deliberately-narrow vocabulary as the parser above: heading,
// paragraph (plain or blockquote-styled), cta, image. `faq-schema` and
// anything else throws rather than silently dropping content a caller
// explicitly asked to save — same policy as sanityAdapter.ts's own
// contentBlocksToPortableText.

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

async function contentBlocksToGutenberg(
  blocks: ContentBlock[],
  client: WordPressApiClient,
): Promise<string> {
  const sorted = blocks.slice().sort((a, b) => a.order - b.order);
  const serialized = await Promise.all(sorted.map((block) => contentBlockToGutenberg(block, client)));
  return serialized.join("\n\n");
}

async function resolveImageSrc(block: ContentBlock, client: WordPressApiClient): Promise<string> {
  const url = block.metadata?.url;
  if (typeof url === "string" && url) return url;

  const assetId = block.metadata?.assetId;
  if (typeof assetId !== "string") {
    throw new Error(
      `Content block "${block.id}" has type "image" but no metadata.url or metadata.assetId — ` +
        "an image block needs an existing WordPress attachment id to reference.",
    );
  }
  const media = await client.get<{ source_url: string }>(`/media/${assetId}`);
  return media.source_url;
}

async function contentBlockToGutenberg(
  block: ContentBlock,
  client: WordPressApiClient,
): Promise<string> {
  switch (block.type) {
    case "heading": {
      const level = block.metadata?.level;
      const normalizedLevel = level === 3 || level === 4 ? level : 2;
      const text = escapeHtml(block.content);
      return (
        `<!-- wp:heading {"level":${normalizedLevel}} -->\n` +
        `<h${normalizedLevel} class="wp-block-heading">${text}</h${normalizedLevel}>\n` +
        "<!-- /wp:heading -->"
      );
    }
    case "paragraph": {
      const text = escapeHtml(block.content);
      if (block.metadata?.style === "blockquote") {
        return (
          "<!-- wp:quote -->\n" +
          `<blockquote class="wp-block-quote"><p>${text}</p></blockquote>\n` +
          "<!-- /wp:quote -->"
        );
      }
      return `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`;
    }
    case "cta": {
      const href = block.metadata?.href;
      if (typeof href !== "string") {
        throw new Error(`Content block "${block.id}" has type "cta" but no metadata.href.`);
      }
      const openInNewTab = block.metadata?.openInNewTab === true;
      const text = escapeHtml(block.content);
      const buttonAttrs = openInNewTab ? ' {"linkTarget":"_blank","rel":"noreferrer noopener"}' : "";
      const linkRel = openInNewTab ? ' target="_blank" rel="noreferrer noopener"' : "";
      return (
        "<!-- wp:buttons -->\n" +
        '<div class="wp-block-buttons"><!-- wp:button' +
        `${buttonAttrs} -->\n` +
        `<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" ` +
        `href="${escapeAttr(href)}"${linkRel}>${text}</a></div>\n` +
        "<!-- /wp:button --></div>\n" +
        "<!-- /wp:buttons -->"
      );
    }
    case "image": {
      const assetId = block.metadata?.assetId;
      if (typeof assetId !== "string") {
        throw new Error(
          `Content block "${block.id}" has type "image" but no metadata.assetId — an image ` +
            "block needs an existing WordPress attachment id to reference.",
        );
      }
      const src = await resolveImageSrc(block, client);
      const alt = escapeAttr(block.content);
      return (
        `<!-- wp:image {"id":${Number(assetId)}} -->\n` +
        `<figure class="wp-block-image size-large"><img src="${escapeAttr(src)}" alt="${alt}" ` +
        `class="wp-image-${escapeAttr(assetId)}"/></figure>\n` +
        "<!-- /wp:image -->"
      );
    }
    case "faq-schema":
      // SPEC.md §22: FAQ JSON-LD is generated by the app from faqItems at
      // render time — there is no WordPress content type to translate this
      // into, same decision sanityAdapter.ts already made for Portable Text.
      throw new Error(
        'Content block type "faq-schema" has no WordPress representation — FAQ schema is ' +
          "generated at render time from faqItems, not stored in content.",
      );
    default:
      throw new Error(`Unknown content block type: ${(block as ContentBlock).type}`);
  }
}

// ---- Images -----------------------------------------------------------------

const ALT_TEXT_STATUSES: AltTextStatus[] = ["missing", "ai-generated", "reviewed"];

function isAltTextStatus(value: unknown): value is AltTextStatus {
  return typeof value === "string" && (ALT_TEXT_STATUSES as string[]).includes(value);
}

// Prefer the real custom field (set by updateImage, see file header gap #3)
// when present; fall back to deriving from alt_text presence alone for
// attachments this app never wrote a status to — pre-existing media, or alt
// text set directly in wp-admin. Shared by toImageAsset (listImages'/
// updateImage's own per-asset status) and resolveImageAltStatuses (the
// per-page-block lookup below) so both read paths agree on one status for
// the same attachment, instead of two independently-derived answers.
function toAltTextStatus(row: Pick<WpMedia, "alt_text" | "meta">): AltTextStatus {
  const altText = row.alt_text && row.alt_text.length > 0 ? row.alt_text : null;
  const storedStatus = row.meta?._ai_cms_alt_text_status;
  if (isAltTextStatus(storedStatus)) return storedStatus;
  return altText ? "reviewed" : "missing";
}

function toImageAsset(row: WpMedia, site: Site): ImageAsset {
  const altText = row.alt_text && row.alt_text.length > 0 ? row.alt_text : null;
  const altTextStatus = toAltTextStatus(row);

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

// ---- Validation --------------------------------------------------------------

const PAGE_STATUSES: PageStatus[] = ["draft", "in-review", "approved", "published"];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertNonEmptyString(value: unknown, field: string, context: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: "${field}" must be a non-empty string.`);
  }
}

function assertValidSlug(value: string, context: string): void {
  if (!SLUG_PATTERN.test(value)) {
    throw new Error(
      `${context}: "slug" must be lowercase alphanumeric, hyphen-separated (got "${value}").`,
    );
  }
}

function assertQualityScore(value: number | null | undefined, context: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || value < 0 || value > 100) {
    throw new Error(`${context}: "qualityScore" must be a number between 0 and 100, or null.`);
  }
}

function assertCreatePageInput(data: CreatePageInput): void {
  assertNonEmptyString(data.title, "title", "CreatePageInput");
  assertNonEmptyString(data.slug, "slug", "CreatePageInput");
  assertValidSlug(data.slug, "CreatePageInput");
  if (typeof data.metaDescription !== "string") {
    throw new Error('CreatePageInput: "metaDescription" must be a string (use "" if none yet).');
  }
  if (!PAGE_TYPES.includes(data.pageType)) {
    throw new Error(
      `CreatePageInput: "pageType" must be one of ${PAGE_TYPES.join(", ")} (got "${data.pageType}").`,
    );
  }
  if (data.status !== undefined && !PAGE_STATUSES.includes(data.status)) {
    throw new Error(
      `CreatePageInput: "status" must be one of ${PAGE_STATUSES.join(", ")} (got "${data.status}").`,
    );
  }
  assertQualityScore(data.qualityScore, "CreatePageInput");
}

function assertUpdatePageInput(data: UpdatePageInput): void {
  if (data.title !== undefined) assertNonEmptyString(data.title, "title", "UpdatePageInput");
  if (data.slug !== undefined) {
    assertNonEmptyString(data.slug, "slug", "UpdatePageInput");
    assertValidSlug(data.slug, "UpdatePageInput");
  }
  if (data.metaDescription !== undefined && typeof data.metaDescription !== "string") {
    throw new Error('UpdatePageInput: "metaDescription" must be a string.');
  }
  if (data.pageType !== undefined && !PAGE_TYPES.includes(data.pageType)) {
    throw new Error(
      `UpdatePageInput: "pageType" must be one of ${PAGE_TYPES.join(", ")} (got "${data.pageType}").`,
    );
  }
  if (data.status !== undefined && !PAGE_STATUSES.includes(data.status)) {
    throw new Error(
      `UpdatePageInput: "status" must be one of ${PAGE_STATUSES.join(", ")} (got "${data.status}").`,
    );
  }
  assertQualityScore(data.qualityScore, "UpdatePageInput");
}

function assertUpdateImageInput(data: UpdateImageInput): void {
  if (data.altText !== undefined && data.altText !== null && typeof data.altText !== "string") {
    throw new Error('UpdateImageInput: "altText" must be a string or null.');
  }
  if (data.altTextStatus !== undefined && !ALT_TEXT_STATUSES.includes(data.altTextStatus)) {
    throw new Error(
      `UpdateImageInput: "altTextStatus" must be one of ${ALT_TEXT_STATUSES.join(", ")} ` +
        `(got "${data.altTextStatus}").`,
    );
  }
}
