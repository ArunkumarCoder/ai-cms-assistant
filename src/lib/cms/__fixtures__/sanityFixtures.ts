import { vi } from "vitest";
import type { PageBodyBlock, PageDetail, PageListItem, PageWithImageBlocks } from "@/sanity/types";
import type { SanityQueryClient } from "../sanityAdapter";
import type { CanonicalBlock, CanonicalImage, CanonicalPage } from "./canonical";

function toPortableTextBlock(block: CanonicalBlock, index: number): PageBodyBlock {
  const style = block.type === "heading" ? (`h${block.level}` as const) : "normal";
  return {
    _type: "block",
    _key: `block-${index}`,
    style,
    markDefs: [],
    children: [{ _type: "span", _key: `span-${index}`, text: block.content, marks: [] }],
  };
}

// `PageDetail` always has these keys (GROQ returns the key with a `null`
// value, never omits it) — MINIMAL_PAGE exercises that explicitly, rather
// than an `undefined`/absent-key shape Sanity's own projection never
// actually produces.
export function toSanityPageDetail(page: CanonicalPage): PageDetail {
  return {
    _id: page.key,
    title: page.title,
    slug: page.slug,
    pageType: page.pageType,
    status: page.status,
    targetKeyword: page.targetKeyword ?? null,
    qualityScore: page.qualityScore,
    seo: page.metaDescription ? { metaDescription: page.metaDescription } : null,
    faqItems: page.faqItems.length
      ? page.faqItems.map((item, i) => ({
          _key: `faq-${i}`,
          question: item.question,
          answer: item.answer,
          source: "manual" as const,
        }))
      : null,
    body: page.contentBlocks.length ? page.contentBlocks.map(toPortableTextBlock) : null,
    _createdAt: page.createdAt,
    _updatedAt: page.updatedAt,
  };
}

export function toSanityPageListItem(page: CanonicalPage): PageListItem {
  return {
    _id: page.key,
    title: page.title,
    slug: page.slug,
    pageType: page.pageType,
    status: page.status,
    targetKeyword: page.targetKeyword ?? null,
    qualityScore: page.qualityScore,
    metaDescription: page.metaDescription || null,
    faqCount: page.faqItems.length,
    _createdAt: page.createdAt,
    _updatedAt: page.updatedAt,
  };
}

// One row per page per PAGES_WITH_IMAGE_BLOCKS_QUERY's own shape (see
// sanityAdapter.ts's fetchAllImages) — `page` is whichever CanonicalPage
// fixture is standing in for "the page these images live inside," since
// Sanity's images are inline in a page's body, not a standalone library.
export function toSanityImagesRow(page: CanonicalPage, images: CanonicalImage[]): PageWithImageBlocks {
  return {
    _id: page.key,
    _createdAt: page.createdAt,
    _updatedAt: page.updatedAt,
    images: images.map((image) => ({
      _key: image.key,
      alt: image.altText,
      altTextStatus: image.altTextStatus,
      asset: { _id: `${image.key}-asset`, url: image.url },
    })),
  };
}

export function makeSanityClient(overrides: Partial<SanityQueryClient> = {}): SanityQueryClient {
  return {
    fetch: vi.fn().mockRejectedValue(new Error("fetch not mocked")),
    create: vi.fn().mockRejectedValue(new Error("create not mocked")),
    patch: vi.fn(() => ({
      set: vi.fn(() => ({ commit: vi.fn().mockResolvedValue(undefined) })),
    })),
    ...overrides,
  };
}
