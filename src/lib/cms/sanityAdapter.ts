import { randomUUID } from "node:crypto";
import type {
  AltTextStatus,
  ContentBlock,
  FaqItem,
  ImageAsset,
  Page,
  PageStatus,
  PageType,
  Site,
} from "@/types";
import {
  PAGES_LIST_QUERY,
  PAGES_WITH_IMAGE_BLOCKS_QUERY,
  PAGE_BY_ID_QUERY,
  PAGE_BY_SLUG_QUERY,
  PAGE_CONTAINING_IMAGE_KEY_QUERY,
} from "@/sanity/queries";
import type {
  PageBodyBlock,
  PageDetail,
  PageFaqItem,
  PageListItem,
  PageWithImageBlocks,
} from "@/sanity/types";
import { getWriteClient } from "@/sanity/writeClient";
import type { CmsAdapter } from "./adapter";
import type {
  CreatePageInput,
  ImageListFilter,
  PageSummary,
  UpdateImageInput,
  UpdatePageInput,
} from "./types";

// Sanity implementation of CmsAdapter (see ./adapter.ts for the interface
// contract this satisfies). Day 5 — first real Sanity write traffic in this
// project. Three things implementing this for real revealed that the
// interface design (Day 4) didn't anticipate; fixed here, noted in SPEC.md
// §7 rather than silently worked around:
//
// 1. Body translation is lossy, on purpose. `ContentBlock.content` is one
//    plain string; Sanity's Portable Text `block` type carries multiple
//    spans with marks (bold/italic/links). Reading a page strips marks down
//    to plain concatenated text; writing a page always produces single,
//    mark-free spans. Round-tripping through this adapter loses inline
//    formatting. A real fix (serializing marks to/from some markup in
//    `content`) is future work, not attempted here — see SPEC.md §7.
//
// 2. `Page.id`/`ImageAsset.id` ("our own DB id" per SPEC.md §2) have no
//    source: there's no app datastore yet, only Sanity. Design note 2 on
//    CmsAdapter only anticipated this for *write* parameters
//    (cmsDocumentId/cmsAssetId); reads need an `id` too. Stopgap: `id` is set
//    equal to the Sanity-native id (`_id` for pages, imageBlock `_key` for
//    images) until a real app datastore exists to assign an independent one.
//
// 3. Images have no single owning identity. There's no standalone
//    `ImageAsset` document (SPEC.md §4) — `alt`/`altTextStatus` live per
//    *usage* (per imageBlock instance in a page's body), so the same
//    underlying Sanity asset reused on two pages can carry two different alt
//    texts. `cmsAssetId` here is therefore the imageBlock's own `_key`
//    (one row per usage), not the underlying asset document's `_id` as the
//    interface's own comment on `updateImage` speculated (`asset._ref`
//    matching) — that guess didn't survive contact with the schema.
//    `usedOnPageIds` is consequently always a single page for now; deduping
//    reused assets across pages into one logical ImageAsset is not attempted.

// The narrow slice of `SanityClient` the adapter actually calls, so unit
// tests can inject a plain mock object instead of the real client.
export interface SanityQueryClient {
  fetch<T>(
    query: string,
    params?: Record<string, unknown>,
    options?: { cache?: RequestCache },
  ): Promise<T>;
  create(doc: Record<string, unknown>): Promise<{ _id: string }>;
  patch(id: string): {
    set(fields: Record<string, unknown>): { commit(): Promise<unknown> };
  };
}

const NO_STORE = { cache: "no-store" as const };

const PAGE_TYPES: PageType[] = ["landing", "blog", "service", "other"];
const PAGE_STATUSES: PageStatus[] = ["draft", "in-review", "published"];
const ALT_TEXT_STATUSES: AltTextStatus[] = ["missing", "ai-generated", "reviewed"];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class SanityAdapter implements CmsAdapter {
  constructor(
    private readonly site: Site,
    private readonly client: SanityQueryClient = getWriteClient(),
  ) {}

  async getPages(): Promise<PageSummary[]> {
    const rows = await this.client.fetch<PageListItem[]>(PAGES_LIST_QUERY, {}, NO_STORE);
    return rows.map((row) => toPageSummary(row, this.site));
  }

  async getPage(slug: string): Promise<Page | null> {
    const raw = await this.client.fetch<PageDetail | null>(
      PAGE_BY_SLUG_QUERY,
      { slug },
      NO_STORE,
    );
    return raw ? toPage(raw, this.site) : null;
  }

  async createPage(data: CreatePageInput): Promise<Page> {
    assertCreatePageInput(data);

    const created = await this.client.create({
      _type: "page",
      title: data.title,
      slug: { _type: "slug", current: data.slug },
      pageType: data.pageType,
      status: data.status ?? "draft",
      targetKeyword: data.targetKeyword,
      seo: { metaDescription: data.metaDescription },
      qualityScore: null,
      body: contentBlocksToPortableText(data.contentBlocks ?? []),
      faqItems: faqItemsToSanity(data.faqItems ?? []),
    });

    return this.fetchPageByIdOrThrow(created._id);
  }

  async updatePage(cmsDocumentId: string, data: UpdatePageInput): Promise<Page> {
    assertUpdatePageInput(data);

    const fields: Record<string, unknown> = {};
    if (data.title !== undefined) fields.title = data.title;
    if (data.slug !== undefined) fields.slug = { _type: "slug", current: data.slug };
    if (data.pageType !== undefined) fields.pageType = data.pageType;
    if (data.status !== undefined) fields.status = data.status;
    if (data.targetKeyword !== undefined) fields.targetKeyword = data.targetKeyword;
    if (data.metaDescription !== undefined) fields["seo.metaDescription"] = data.metaDescription;
    if (data.contentBlocks !== undefined) {
      fields.body = contentBlocksToPortableText(data.contentBlocks);
    }
    if (data.faqItems !== undefined) fields.faqItems = faqItemsToSanity(data.faqItems);

    await this.client.patch(cmsDocumentId).set(fields).commit();

    return this.fetchPageByIdOrThrow(cmsDocumentId);
  }

  async listImages(filter?: ImageListFilter): Promise<ImageAsset[]> {
    const images = await this.fetchAllImages();
    if (!filter?.altTextStatus) return images;
    return images.filter((image) => image.altTextStatus === filter.altTextStatus);
  }

  async updateImage(cmsAssetId: string, data: UpdateImageInput): Promise<ImageAsset> {
    assertUpdateImageInput(data);

    const owner = await this.client.fetch<{ _id: string } | null>(
      PAGE_CONTAINING_IMAGE_KEY_QUERY,
      { key: cmsAssetId },
      NO_STORE,
    );
    if (!owner) {
      throw new Error(
        `No image found with cmsAssetId "${cmsAssetId}" — no page body contains an ` +
          "imageBlock with that key.",
      );
    }

    const fields: Record<string, unknown> = {};
    if (data.altText !== undefined) {
      fields[`body[_key=="${cmsAssetId}"].alt`] = data.altText ?? "";
    }
    if (data.altTextStatus !== undefined) {
      fields[`body[_key=="${cmsAssetId}"].altTextStatus`] = data.altTextStatus;
    }

    await this.client.patch(owner._id).set(fields).commit();

    const images = await this.fetchAllImages();
    const updated = images.find((image) => image.cmsAssetId === cmsAssetId);
    if (!updated) {
      throw new Error(`Image "${cmsAssetId}" was updated but could not be re-fetched.`);
    }
    return updated;
  }

  private async fetchPageByIdOrThrow(id: string): Promise<Page> {
    const raw = await this.client.fetch<PageDetail | null>(PAGE_BY_ID_QUERY, { id }, NO_STORE);
    if (!raw) {
      throw new Error(`Page "${id}" was written but could not be re-fetched.`);
    }
    return toPage(raw, this.site);
  }

  private async fetchAllImages(): Promise<ImageAsset[]> {
    const rows = await this.client.fetch<PageWithImageBlocks[]>(
      PAGES_WITH_IMAGE_BLOCKS_QUERY,
      {},
      NO_STORE,
    );
    return rows.flatMap((page) =>
      page.images
        .filter((image) => image.asset)
        .map((image) => toImageAsset(image, page, this.site)),
    );
  }
}

// ---- Page / PageSummary mapping -------------------------------------------

function toPage(raw: PageDetail, site: Site): Page {
  return {
    id: raw._id,
    siteId: site.id,
    cmsDocumentId: raw._id,
    slug: raw.slug,
    title: raw.title,
    metaDescription: raw.seo?.metaDescription ?? "",
    targetKeyword: raw.targetKeyword ?? undefined,
    pageType: raw.pageType,
    status: raw.status,
    contentBlocks: portableTextToContentBlocks(raw.body),
    latestSeoAuditId: undefined,
    faqItems: sanityFaqItemsToDomain(raw.faqItems, raw._id),
    qualityScore: raw.qualityScore,
    createdAt: raw._createdAt,
    updatedAt: raw._updatedAt,
  };
}

function toPageSummary(raw: PageListItem, site: Site): PageSummary {
  return {
    id: raw._id,
    siteId: site.id,
    cmsDocumentId: raw._id,
    slug: raw.slug,
    title: raw.title,
    metaDescription: raw.metaDescription ?? "",
    targetKeyword: raw.targetKeyword ?? undefined,
    pageType: raw.pageType,
    status: raw.status,
    latestSeoAuditId: undefined,
    qualityScore: raw.qualityScore,
    faqCount: raw.faqCount,
    createdAt: raw._createdAt,
    updatedAt: raw._updatedAt,
  };
}

// ---- Content block <-> Portable Text ---------------------------------------

function generateKey(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function isAltTextStatus(value: unknown): value is AltTextStatus {
  return value === "missing" || value === "ai-generated" || value === "reviewed";
}

function textBlock(key: string, style: string, text: string): Record<string, unknown> {
  return {
    _type: "block",
    _key: key,
    style,
    markDefs: [],
    children: [{ _type: "span", _key: generateKey(), text, marks: [] }],
  };
}

export function contentBlocksToPortableText(blocks: ContentBlock[]): Record<string, unknown>[] {
  return blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((block) => {
      const key = block.id || generateKey();
      switch (block.type) {
        case "heading": {
          const level = block.metadata?.level;
          const style = level === 3 ? "h3" : level === 4 ? "h4" : "h2";
          return textBlock(key, style, block.content);
        }
        case "paragraph": {
          const style = block.metadata?.style === "blockquote" ? "blockquote" : "normal";
          return textBlock(key, style, block.content);
        }
        case "cta": {
          const href = block.metadata?.href;
          if (typeof href !== "string") {
            throw new Error(`Content block "${block.id}" has type "cta" but no metadata.href.`);
          }
          return {
            _type: "ctaBlock",
            _key: key,
            text: block.content,
            href,
            openInNewTab: block.metadata?.openInNewTab === true,
          };
        }
        case "image": {
          const assetId = block.metadata?.assetId;
          if (typeof assetId !== "string") {
            throw new Error(
              `Content block "${block.id}" has type "image" but no metadata.assetId — an ` +
                "image block needs an existing Sanity asset id to reference.",
            );
          }
          const altTextStatus = isAltTextStatus(block.metadata?.altTextStatus)
            ? block.metadata.altTextStatus
            : "missing";
          const caption = block.metadata?.caption;
          return {
            _type: "imageBlock",
            _key: key,
            alt: block.content,
            altTextStatus,
            caption: typeof caption === "string" ? caption : undefined,
            asset: { _type: "reference", _ref: assetId },
          };
        }
        case "faq-schema":
          // SPEC.md §4: FAQ JSON-LD is generated by the app from faqItems at
          // render time — there is no Sanity content type for it, so a
          // ContentBlock of this type can't be translated, not just isn't.
          throw new Error(
            'Content block type "faq-schema" has no Sanity representation — FAQ schema is ' +
              "generated at render time from faqItems, not stored in body.",
          );
        default:
          throw new Error(`Unknown content block type: ${(block as ContentBlock).type}`);
      }
    });
}

export function portableTextToContentBlocks(
  body: PageBodyBlock[] | null | undefined,
): ContentBlock[] {
  if (!body) return [];
  return body.map((raw, order) => {
    if (raw._type === "block") {
      const content = raw.children.map((span) => span.text).join("");
      if (raw.style === "h2" || raw.style === "h3" || raw.style === "h4") {
        return {
          id: raw._key,
          type: "heading",
          order,
          content,
          metadata: { level: Number(raw.style.slice(1)) },
        };
      }
      return {
        id: raw._key,
        type: "paragraph",
        order,
        content,
        metadata: raw.style === "blockquote" ? { style: "blockquote" } : undefined,
      };
    }
    if (raw._type === "ctaBlock") {
      return {
        id: raw._key,
        type: "cta",
        order,
        content: raw.text,
        metadata: { href: raw.href, openInNewTab: raw.openInNewTab ?? false },
      };
    }
    // imageBlock
    return {
      id: raw._key,
      type: "image",
      order,
      content: raw.alt ?? "",
      metadata: {
        altTextStatus: raw.altTextStatus,
        caption: raw.caption,
        assetId: raw.asset?._id,
        url: raw.asset?.url,
        dimensions: raw.asset?.metadata?.dimensions,
        lqip: raw.asset?.metadata?.lqip,
      },
    };
  });
}

// ---- FAQ items --------------------------------------------------------------

function faqItemsToSanity(items: FaqItem[]): Record<string, unknown>[] {
  return items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      _key: item.id || generateKey(),
      question: item.question,
      answer: item.answer,
      source: item.source,
    }));
}

function sanityFaqItemsToDomain(
  items: PageFaqItem[] | null | undefined,
  pageId: string,
): FaqItem[] {
  if (!items) return [];
  return items.map((item, order) => ({
    id: item._key,
    pageId,
    question: item.question,
    answer: item.answer,
    order,
    source: item.source,
  }));
}

// ---- Images -----------------------------------------------------------------

function toImageAsset(
  image: PageWithImageBlocks["images"][number],
  page: Pick<PageWithImageBlocks, "_id" | "_createdAt" | "_updatedAt">,
  site: Site,
): ImageAsset {
  return {
    id: image._key,
    siteId: site.id,
    cmsAssetId: image._key,
    url: image.asset!.url,
    altText: image.alt && image.alt.length > 0 ? image.alt : null,
    altTextStatus: image.altTextStatus,
    usedOnPageIds: [page._id],
    // No per-image timestamps exist (images aren't standalone documents,
    // SPEC.md §4) — the containing page's timestamps stand in.
    createdAt: page._createdAt,
    updatedAt: page._updatedAt,
  };
}

// ---- Validation ---------------------------------------------------------------

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
