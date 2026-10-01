import { describe, expect, it, vi } from "vitest";
import type { Site } from "@/types";
import {
  WordPressAdapter,
  type WordPressApiClient,
} from "./wordpressAdapter";

const site: Site = {
  id: "site-1",
  userId: "user-1",
  name: "Test WP Site",
  cms: "wordpress",
  wordpressUrl: "http://localhost:8890",
  wordpressUsername: "admin",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeClient(overrides: Partial<WordPressApiClient> = {}): WordPressApiClient {
  return {
    get: vi.fn().mockRejectedValue(new Error("get not mocked")),
    ...overrides,
  };
}

const richPageRow = {
  id: 10,
  slug: "ai-powered-content-assistant",
  status: "publish",
  title: { raw: "AI-Powered Content Assistant", rendered: "AI-Powered Content Assistant" },
  content: {
    raw:
      '<!-- wp:heading {"level":2} -->\n<h2>Write better pages</h2>\n<!-- /wp:heading -->\n\n' +
      "<!-- wp:paragraph -->\n<p>Analyzes your content in real time.</p>\n<!-- /wp:paragraph -->\n\n" +
      '<!-- wp:image {"id":7} -->\n<figure><img src="http://localhost:8890/img.png" alt="Dashboard screenshot" class="wp-image-7"/></figure>\n<!-- /wp:image -->\n\n' +
      '<!-- wp:quote -->\n<blockquote><p>Write for the searcher.</p></blockquote>\n<!-- /wp:quote -->\n\n' +
      '<!-- wp:buttons -->\n<div class="wp-block-buttons"><!-- wp:button -->\n<div class="wp-block-button"><a class="wp-block-button__link" href="/signup">Get started</a></div>\n<!-- /wp:button --></div>\n<!-- /wp:buttons -->\n\n' +
      "<!-- wp:gallery -->\n<figure>unsupported block</figure>\n<!-- /wp:gallery -->",
    rendered: "<p>rendered fallback</p>",
  },
  date_gmt: "2026-01-01T00:00:00",
  modified_gmt: "2026-01-02T00:00:00",
  meta: {
    _ai_cms_page_type: "landing",
    _ai_cms_target_keyword: "ai content assistant",
    _ai_cms_quality_score: "82",
    _ai_cms_seo_meta_title: "AI-Powered Content Assistant",
    _ai_cms_seo_meta_description: "Analyze and improve your content with AI.",
    _ai_cms_faq_items: '[{"id":"faq-1","question":"Does this work?","answer":"Yes.","order":0,"source":"ai-generated"}]',
  },
};

describe("WordPressAdapter.getPages", () => {
  it("maps WordPress list rows to PageSummary[], requesting every workflow status", async () => {
    const get = vi.fn().mockResolvedValue([
      {
        id: 10,
        slug: "ai-powered-content-assistant",
        status: "publish",
        title: { raw: "AI-Powered Content Assistant", rendered: "AI-Powered Content Assistant" },
        date_gmt: "2026-01-01T00:00:00",
        modified_gmt: "2026-01-02T00:00:00",
        meta: {
          _ai_cms_page_type: "landing",
          _ai_cms_quality_score: "82",
          _ai_cms_faq_items: '[{"id":"faq-1","question":"Q","answer":"A","order":0,"source":"manual"}]',
        },
      },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const pages = await adapter.getPages();

    expect(get).toHaveBeenCalledWith(
      "/ai-cms-pages",
      expect.objectContaining({ status: "draft,in_review,approved,publish", context: "edit" }),
    );
    expect(pages).toEqual([
      {
        id: "10",
        siteId: "site-1",
        cmsDocumentId: "10",
        slug: "ai-powered-content-assistant",
        title: "AI-Powered Content Assistant",
        metaDescription: "",
        targetKeyword: undefined,
        pageType: "landing",
        status: "published",
        latestSeoAuditId: undefined,
        qualityScore: 82,
        faqCount: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ]);
  });

  it("maps WordPress's in_review/approved statuses to the domain's hyphenated names", async () => {
    const get = vi.fn().mockResolvedValue([
      { id: 1, slug: "a", status: "in_review", title: { rendered: "A" }, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00", meta: {} },
      { id: 2, slug: "b", status: "approved", title: { rendered: "B" }, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00", meta: {} },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const pages = await adapter.getPages();

    expect(pages.map((p) => p.status)).toEqual(["in-review", "approved"]);
  });

  it("falls back an unrecognized WordPress status (e.g. pending) to draft rather than throwing", async () => {
    const get = vi.fn().mockResolvedValue([
      { id: 1, slug: "a", status: "pending", title: { rendered: "A" }, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00", meta: {} },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const pages = await adapter.getPages();

    expect(pages[0].status).toBe("draft");
  });

  it("treats an empty quality-score meta string as never-scored (null), not zero", async () => {
    const get = vi.fn().mockResolvedValue([
      { id: 1, slug: "a", status: "draft", title: { rendered: "A" }, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00", meta: { _ai_cms_quality_score: "" } },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const pages = await adapter.getPages();

    expect(pages[0].qualityScore).toBeNull();
  });

  it("defaults an unset/unknown pageType to 'other'", async () => {
    const get = vi.fn().mockResolvedValue([
      { id: 1, slug: "a", status: "draft", title: { rendered: "A" }, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00", meta: {} },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const pages = await adapter.getPages();

    expect(pages[0].pageType).toBe("other");
  });
});

describe("WordPressAdapter.getPage", () => {
  it("returns null when no post matches the slug", async () => {
    const get = vi.fn().mockResolvedValue([]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    await expect(adapter.getPage("missing")).resolves.toBeNull();
  });

  it("parses Gutenberg block markup into ContentBlock[], skipping unsupported block types", async () => {
    const get = vi.fn().mockResolvedValue([richPageRow]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const page = await adapter.getPage("ai-powered-content-assistant");

    expect(page?.contentBlocks).toEqual([
      { id: "wp-block-0", type: "heading", order: 0, content: "Write better pages", metadata: { level: 2 } },
      { id: "wp-block-1", type: "paragraph", order: 1, content: "Analyzes your content in real time." },
      {
        id: "wp-block-2",
        type: "image",
        order: 2,
        content: "Dashboard screenshot",
        metadata: { url: "http://localhost:8890/img.png", assetId: "7", altTextStatus: "reviewed" },
      },
      {
        id: "wp-block-3",
        type: "paragraph",
        order: 3,
        content: "Write for the searcher.",
        metadata: { style: "blockquote" },
      },
      {
        id: "wp-block-4",
        type: "cta",
        order: 4,
        content: "Get started",
        metadata: { href: "/signup", openInNewTab: false },
      },
      // The gallery block (order 5) is intentionally absent — unsupported
      // block types are skipped, not translated into a broken ContentBlock.
    ]);
  });

  it("reads custom meta into pageType/targetKeyword/qualityScore/metaDescription", async () => {
    const get = vi.fn().mockResolvedValue([richPageRow]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const page = await adapter.getPage("ai-powered-content-assistant");

    expect(page?.pageType).toBe("landing");
    expect(page?.targetKeyword).toBe("ai content assistant");
    expect(page?.qualityScore).toBe(82);
    expect(page?.metaDescription).toBe("Analyze and improve your content with AI.");
  });

  it("parses the FAQ items JSON meta field into FaqItem[]", async () => {
    const get = vi.fn().mockResolvedValue([richPageRow]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const page = await adapter.getPage("ai-powered-content-assistant");

    expect(page?.faqItems).toEqual([
      { id: "faq-1", pageId: "10", question: "Does this work?", answer: "Yes.", order: 0, source: "ai-generated" },
    ]);
  });

  it("treats malformed FAQ JSON as an empty list rather than throwing", async () => {
    const get = vi.fn().mockResolvedValue([
      { ...richPageRow, meta: { ...richPageRow.meta, _ai_cms_faq_items: "{not valid json" } },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const page = await adapter.getPage("ai-powered-content-assistant");

    expect(page?.faqItems).toEqual([]);
  });
});

describe("WordPressAdapter.listImages", () => {
  it("maps native alt_text presence to reviewed/missing, since WordPress has no review-status field", async () => {
    const get = vi.fn().mockResolvedValue([
      { id: 7, source_url: "http://localhost:8890/a.png", alt_text: "A dashboard screenshot", post: 10, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00" },
      { id: 8, source_url: "http://localhost:8890/b.png", alt_text: "", post: 0, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00" },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const images = await adapter.listImages();

    expect(images).toEqual([
      {
        id: "7",
        siteId: "site-1",
        cmsAssetId: "7",
        url: "http://localhost:8890/a.png",
        altText: "A dashboard screenshot",
        altTextStatus: "reviewed",
        usedOnPageIds: ["10"],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "8",
        siteId: "site-1",
        cmsAssetId: "8",
        url: "http://localhost:8890/b.png",
        altText: null,
        altTextStatus: "missing",
        usedOnPageIds: [],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("filters by altTextStatus when asked", async () => {
    const get = vi.fn().mockResolvedValue([
      { id: 7, source_url: "http://x/a.png", alt_text: "has one", post: 0, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00" },
      { id: 8, source_url: "http://x/b.png", alt_text: "", post: 0, date_gmt: "2026-01-01T00:00:00", modified_gmt: "2026-01-01T00:00:00" },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const images = await adapter.listImages({ altTextStatus: "missing" });

    expect(images).toHaveLength(1);
    expect(images[0].id).toBe("8");
  });
});

describe("WordPressAdapter write methods (not yet implemented)", () => {
  it("createPage/updatePage/updateImage all throw — write support lands separately", async () => {
    const adapter = new WordPressAdapter(site, makeClient());

    await expect(
      adapter.createPage({
        slug: "x",
        title: "X",
        metaDescription: "",
        pageType: "other",
      }),
    ).rejects.toThrow(/not implemented/i);
    await expect(adapter.updatePage("1", {})).rejects.toThrow(/not implemented/i);
    await expect(adapter.updateImage("1", {})).rejects.toThrow(/not implemented/i);
  });
});
