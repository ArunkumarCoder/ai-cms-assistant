import { vi } from "vitest";
import type { PageStatus } from "@/types";
import type { WordPressApiClient } from "../wordpressAdapter";
import type { CanonicalBlock, CanonicalImage, CanonicalPage } from "./canonical";

// WordPress ids are always numbers, unlike Sanity's free-form `_id` strings
// — a fixed lookup table lets every fixture converter and test assertion
// agree on "page X's WordPress id" without either guessing or hardcoding a
// number that would mean nothing paired with a different CanonicalPage.
const WP_PAGE_ID_BY_KEY: Record<string, number> = {
  "full-page": 101,
  "minimal-page": 102,
  "updated-page": 103,
};
const WP_MEDIA_ID_BY_KEY: Record<string, number> = {
  "image-1": 201,
  "image-2": 202,
  "image-3": 203,
};

export function wpPageIdFor(key: string): number {
  const id = WP_PAGE_ID_BY_KEY[key];
  if (!id) throw new Error(`wordpressFixtures: no WordPress page id mapped for key "${key}"`);
  return id;
}

export function wpMediaIdFor(key: string): number {
  const id = WP_MEDIA_ID_BY_KEY[key];
  if (!id) throw new Error(`wordpressFixtures: no WordPress media id mapped for key "${key}"`);
  return id;
}

const DOMAIN_TO_WP_STATUS: Record<PageStatus, string> = {
  draft: "draft",
  "in-review": "in_review",
  approved: "approved",
  published: "publish",
};

function blockToGutenberg(block: CanonicalBlock): string {
  if (block.type === "heading") {
    return (
      `<!-- wp:heading {"level":${block.level}} -->\n` +
      `<h${block.level} class="wp-block-heading">${block.content}</h${block.level}>\n` +
      "<!-- /wp:heading -->"
    );
  }
  return `<!-- wp:paragraph -->\n<p>${block.content}</p>\n<!-- /wp:paragraph -->`;
}

// WordPress's `_gmt` fields have no trailing "Z" even though they're UTC —
// matches the real REST API's own quirk (see wordpressAdapter.ts's
// toGmtIso), not just a fixture simplification.
function toWpGmt(isoWithZ: string): string {
  return isoWithZ.replace(/Z$/, "");
}

// `omitMeta`, when true, produces a page fixture with NO `meta` key at all —
// a real WordPress response shape distinct from "meta present but every
// value empty" (MINIMAL_PAGE's usual rendering): e.g. a REST response
// fetched without `context=edit`, or a site whose mu-plugin version predates
// some of these fields. Exercises wordpressAdapter.ts's `row.meta ?? {}`
// fallback explicitly rather than only ever feeding it an empty object.
export function toWpPage(page: CanonicalPage, options: { omitMeta?: boolean } = {}) {
  const base = {
    id: wpPageIdFor(page.key),
    slug: page.slug,
    status: DOMAIN_TO_WP_STATUS[page.status],
    title: { raw: page.title, rendered: page.title },
    content: {
      raw: page.contentBlocks.map(blockToGutenberg).join("\n\n"),
      rendered: "",
    },
    date_gmt: toWpGmt(page.createdAt),
    modified_gmt: toWpGmt(page.updatedAt),
  };
  if (options.omitMeta) return base;
  return {
    ...base,
    meta: {
      _ai_cms_page_type: page.pageType,
      _ai_cms_target_keyword: page.targetKeyword ?? "",
      _ai_cms_seo_meta_title: page.title,
      _ai_cms_seo_meta_description: page.metaDescription,
      _ai_cms_quality_score: page.qualityScore != null ? String(page.qualityScore) : "",
      _ai_cms_faq_items: JSON.stringify(
        page.faqItems.map((item, i) => ({
          id: `faq-${i}`,
          question: item.question,
          answer: item.answer,
          order: i,
          source: "manual",
        })),
      ),
    },
  };
}

export function toWpMedia(image: CanonicalImage) {
  return {
    id: wpMediaIdFor(image.key),
    source_url: image.url,
    alt_text: image.altText ?? "",
    post: 0,
    date_gmt: "2026-01-01T00:00:00",
    modified_gmt: "2026-01-01T00:00:00",
    meta: { _ai_cms_alt_text_status: image.altTextStatus },
  };
}

export function makeWordPressClient(overrides: Partial<WordPressApiClient> = {}): WordPressApiClient {
  return {
    get: vi.fn().mockRejectedValue(new Error("get not mocked")),
    post: vi.fn().mockRejectedValue(new Error("post not mocked")),
    ...overrides,
  };
}
