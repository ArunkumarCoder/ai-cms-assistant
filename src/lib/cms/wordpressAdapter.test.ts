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
    post: vi.fn().mockRejectedValue(new Error("post not mocked")),
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

  it("resolves an image block's real per-attachment alt-text status, overriding the presence-only guess", async () => {
    // Regression test: before this fix, a page's image block always derived
    // altTextStatus from whether its inline `alt` attribute was non-empty —
    // "reviewed" here, even though the real attachment (same one
    // listImages()/updateImage() address) was actually stored as
    // "ai-generated". The two call sites would silently disagree about the
    // same image's status. See this adapter's file-header gap #3 update.
    const get = vi.fn().mockImplementation(async (path: string) => {
      if (path === "/media") {
        return [{ id: 7, alt_text: "Dashboard screenshot", meta: { _ai_cms_alt_text_status: "ai-generated" } }];
      }
      return [richPageRow];
    });
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const page = await adapter.getPage("ai-powered-content-assistant");

    const imageBlock = page?.contentBlocks.find((b) => b.type === "image");
    expect(imageBlock?.metadata?.altTextStatus).toBe("ai-generated");
    expect(get).toHaveBeenCalledWith("/media", expect.objectContaining({ include: "7" }));
  });

  it("falls back to the presence-based guess when the attachment lookup fails, instead of failing the whole page read", async () => {
    const get = vi.fn().mockImplementation(async (path: string) => {
      if (path === "/media") throw new Error("503 Service Unavailable");
      return [richPageRow];
    });
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const page = await adapter.getPage("ai-powered-content-assistant");

    const imageBlock = page?.contentBlocks.find((b) => b.type === "image");
    expect(imageBlock?.metadata?.altTextStatus).toBe("reviewed");
  });

  it("reads openInNewTab back from a button's linkTarget attribute, not hardcoded false", async () => {
    // Regression test for a bug the write-path's live round-trip check
    // found: this used to always report `false` regardless of the actual
    // markup, silently losing a CTA's "open in new tab" setting on every
    // read. See the fix's comment in wpBlockToContentBlock (SPEC.md §24).
    const row = {
      ...richPageRow,
      content: {
        raw:
          '<!-- wp:buttons -->\n<div class="wp-block-buttons"><!-- wp:button {"linkTarget":"_blank","rel":"noreferrer noopener"} -->\n' +
          '<div class="wp-block-button"><a class="wp-block-button__link" href="/go" target="_blank" rel="noreferrer noopener">Go</a></div>\n' +
          "<!-- /wp:button --></div>\n<!-- /wp:buttons -->",
        rendered: "",
      },
    };
    const get = vi.fn().mockResolvedValue([row]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const page = await adapter.getPage("ai-powered-content-assistant");

    expect(page?.contentBlocks).toEqual([
      { id: "wp-block-0", type: "cta", order: 0, content: "Go", metadata: { href: "/go", openInNewTab: true } },
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

describe("WordPressAdapter.createPage", () => {
  const validInput = {
    slug: "new-page",
    title: "New page",
    metaDescription: "A new page.",
    pageType: "blog" as const,
    contentBlocks: [
      { id: "b1", type: "paragraph" as const, order: 0, content: "Hello world." },
    ],
  };

  it("sends a translated Gutenberg payload to WordPress, always with an explicit slug, and returns the re-fetched page", async () => {
    const post = vi.fn().mockResolvedValue({ id: 99 });
    const get = vi.fn().mockResolvedValue({ ...richPageRow, id: 99 });
    const adapter = new WordPressAdapter(site, makeClient({ post, get }));

    const page = await adapter.createPage(validInput);

    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/ai-cms-pages");
    expect(body.slug).toBe("new-page");
    expect(body.status).toBe("draft");
    expect(body.content).toContain("<!-- wp:paragraph -->");
    expect(body.content).toContain("Hello world.");
    expect(body.meta).toMatchObject({
      _ai_cms_page_type: "blog",
      _ai_cms_seo_meta_description: "A new page.",
    });
    expect(page.id).toBe("99");
  });

  it("maps the domain status to WordPress's own status slug", async () => {
    const post = vi.fn().mockResolvedValue({ id: 1 });
    const get = vi.fn().mockResolvedValue(richPageRow);
    const adapter = new WordPressAdapter(site, makeClient({ post, get }));

    await adapter.createPage({ ...validInput, status: "in-review" });

    expect(post.mock.calls[0][1].status).toBe("in_review");
  });

  it("serializes a cta block's openInNewTab into linkTarget/rel attrs AND the anchor's target", async () => {
    const post = vi.fn().mockResolvedValue({ id: 1 });
    const get = vi.fn().mockResolvedValue(richPageRow);
    const adapter = new WordPressAdapter(site, makeClient({ post, get }));

    await adapter.createPage({
      ...validInput,
      contentBlocks: [
        { id: "c1", type: "cta", order: 0, content: "Go", metadata: { href: "/go", openInNewTab: true } },
      ],
    });

    const content = post.mock.calls[0][1].content as string;
    expect(content).toContain('"linkTarget":"_blank"');
    expect(content).toContain('target="_blank"');
  });

  it("rejects invalid input before ever calling WordPress", async () => {
    const post = vi.fn();
    const adapter = new WordPressAdapter(site, makeClient({ post }));

    await expect(adapter.createPage({ ...validInput, title: "" })).rejects.toThrow(/title/i);
    expect(post).not.toHaveBeenCalled();
  });

  it("propagates a write rejected by WordPress instead of swallowing it", async () => {
    const post = vi.fn().mockRejectedValue(new Error("403 rest_cannot_create"));
    const adapter = new WordPressAdapter(site, makeClient({ post }));

    await expect(adapter.createPage(validInput)).rejects.toThrow("403 rest_cannot_create");
  });

  it("throws when a cta block has no metadata.href, before calling WordPress", async () => {
    const post = vi.fn();
    const adapter = new WordPressAdapter(site, makeClient({ post }));

    await expect(
      adapter.createPage({
        ...validInput,
        contentBlocks: [{ id: "c1", type: "cta", order: 0, content: "Go" }],
      }),
    ).rejects.toThrow(/href/i);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("WordPressAdapter.updatePage", () => {
  it("only sends the fields that changed, leaving content/meta alone when only qualityScore changes", async () => {
    // Mirrors withQualityScoring's own real call shape (autoScore.ts): every
    // create/update is immediately followed by `updatePage(id, {
    // qualityScore })` alone — if this ever sent `content`, it would blank
    // out a page's body on every single save.
    const post = vi.fn().mockResolvedValue({});
    const get = vi.fn().mockResolvedValue(richPageRow);
    const adapter = new WordPressAdapter(site, makeClient({ post, get }));

    await adapter.updatePage("10", { qualityScore: 91 });

    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/ai-cms-pages/10");
    expect(body).toEqual({ meta: { _ai_cms_quality_score: "91" } });
  });

  it("serializes a full contentBlocks replacement back into Gutenberg markup", async () => {
    const post = vi.fn().mockResolvedValue({});
    const get = vi.fn().mockResolvedValue(richPageRow);
    const adapter = new WordPressAdapter(site, makeClient({ post, get }));

    await adapter.updatePage("10", {
      contentBlocks: [{ id: "h1", type: "heading", order: 0, content: "New heading", metadata: { level: 3 } }],
    });

    const body = post.mock.calls[0][1];
    expect(body.content).toBe(
      '<!-- wp:heading {"level":3} -->\n<h3 class="wp-block-heading">New heading</h3>\n<!-- /wp:heading -->',
    );
  });

  it("maps a null quality score to an empty string, not the literal word 'null'", async () => {
    const post = vi.fn().mockResolvedValue({});
    const get = vi.fn().mockResolvedValue(richPageRow);
    const adapter = new WordPressAdapter(site, makeClient({ post, get }));

    await adapter.updatePage("10", { qualityScore: null });

    expect(post.mock.calls[0][1]).toEqual({ meta: { _ai_cms_quality_score: "" } });
  });

  it("rejects an invalid status transition value before calling WordPress", async () => {
    const post = vi.fn();
    const adapter = new WordPressAdapter(site, makeClient({ post }));

    await expect(
      adapter.updatePage("10", { status: "archived" as never }),
    ).rejects.toThrow(/status/i);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("WordPressAdapter.updateImage", () => {
  it("writes alt_text and the custom alt-text-status meta field, then re-fetches", async () => {
    const post = vi.fn().mockResolvedValue({});
    const get = vi.fn().mockResolvedValue({
      id: 7,
      source_url: "http://localhost:8890/a.png",
      alt_text: "A dashboard screenshot",
      post: 0,
      date_gmt: "2026-01-01T00:00:00",
      modified_gmt: "2026-01-01T00:00:00",
      meta: { _ai_cms_alt_text_status: "ai-generated" },
    });
    const adapter = new WordPressAdapter(site, makeClient({ post, get }));

    const image = await adapter.updateImage("7", {
      altText: "A dashboard screenshot",
      altTextStatus: "ai-generated",
    });

    expect(post).toHaveBeenCalledWith("/media/7", {
      alt_text: "A dashboard screenshot",
      meta: { _ai_cms_alt_text_status: "ai-generated" },
    });
    expect(image.altTextStatus).toBe("ai-generated");
  });

  it("distinguishes ai-generated from reviewed — the real gap presence-based derivation couldn't represent", async () => {
    // Accepting the AI's suggestion unedited (saveAltTextAction.ts) sets
    // "ai-generated"; reading that image back must not silently upgrade it
    // to "reviewed" just because alt_text is now non-empty.
    const get = vi.fn().mockResolvedValue([
      {
        id: 7,
        source_url: "http://x/a.png",
        alt_text: "AI wrote this",
        post: 0,
        date_gmt: "2026-01-01T00:00:00",
        modified_gmt: "2026-01-01T00:00:00",
        meta: { _ai_cms_alt_text_status: "ai-generated" },
      },
    ]);
    const adapter = new WordPressAdapter(site, makeClient({ get }));

    const images = await adapter.listImages();

    expect(images[0].altTextStatus).toBe("ai-generated");
  });

  it("rejects an invalid altTextStatus value before calling WordPress", async () => {
    const post = vi.fn();
    const adapter = new WordPressAdapter(site, makeClient({ post }));

    await expect(
      adapter.updateImage("7", { altTextStatus: "bogus" as never }),
    ).rejects.toThrow(/altTextStatus/i);
    expect(post).not.toHaveBeenCalled();
  });
});
