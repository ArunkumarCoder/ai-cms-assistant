import { describe, expect, it, vi } from "vitest";
import type { Site } from "@/types";
import type { PageDetail, PageListItem, PageWithImageBlocks } from "@/sanity/types";
import {
  contentBlocksToPortableText,
  portableTextToContentBlocks,
  SanityAdapter,
  type SanityQueryClient,
} from "./sanityAdapter";
import type { CreatePageInput, UpdatePageInput } from "./types";

const site: Site = {
  id: "site-1",
  name: "Test Site",
  cms: "sanity",
  sanityProjectId: "proj",
  sanityDataset: "production",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeClient(overrides: Partial<SanityQueryClient> = {}): SanityQueryClient {
  return {
    fetch: vi.fn().mockRejectedValue(new Error("fetch not mocked")),
    create: vi.fn().mockRejectedValue(new Error("create not mocked")),
    patch: vi.fn(() => ({
      set: vi.fn(() => ({ commit: vi.fn().mockResolvedValue(undefined) })),
    })),
    ...overrides,
  };
}

const samplePageDetail: PageDetail = {
  _id: "page-1",
  title: "Landing page",
  slug: "landing-page",
  pageType: "landing",
  status: "published",
  targetKeyword: "widgets",
  qualityScore: 88,
  seo: { metaTitle: "Widgets", metaDescription: "Buy widgets here." },
  faqItems: [{ _key: "faq-1", question: "Q1?", answer: "A1.", source: "manual" }],
  body: [
    {
      _type: "block",
      _key: "block-1",
      style: "h2",
      markDefs: [],
      children: [{ _type: "span", _key: "span-1", text: "Welcome", marks: [] }],
    },
  ],
  _createdAt: "2026-01-01T00:00:00.000Z",
  _updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("SanityAdapter.getPages", () => {
  it("maps Sanity list rows to PageSummary[]", async () => {
    const rows: PageListItem[] = [
      {
        _id: "page-1",
        title: "Landing page",
        slug: "landing-page",
        pageType: "landing",
        status: "published",
        targetKeyword: "widgets",
        qualityScore: 88,
        metaDescription: "Buy widgets here.",
        faqCount: 1,
        _createdAt: "2026-01-01T00:00:00.000Z",
        _updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const client = makeClient({ fetch: vi.fn().mockResolvedValue(rows) });
    const adapter = new SanityAdapter(site, client);

    const pages = await adapter.getPages();

    expect(pages).toEqual([
      {
        id: "page-1",
        siteId: "site-1",
        cmsDocumentId: "page-1",
        slug: "landing-page",
        title: "Landing page",
        metaDescription: "Buy widgets here.",
        targetKeyword: "widgets",
        pageType: "landing",
        status: "published",
        latestSeoAuditId: undefined,
        qualityScore: 88,
        faqCount: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });
});

describe("SanityAdapter.getPage", () => {
  it("returns null when Sanity finds no matching document", async () => {
    const client = makeClient({ fetch: vi.fn().mockResolvedValue(null) });
    const adapter = new SanityAdapter(site, client);

    await expect(adapter.getPage("missing")).resolves.toBeNull();
  });

  it("translates Portable Text body into ContentBlock[]", async () => {
    const client = makeClient({ fetch: vi.fn().mockResolvedValue(samplePageDetail) });
    const adapter = new SanityAdapter(site, client);

    const page = await adapter.getPage("landing-page");

    expect(page?.contentBlocks).toEqual([
      { id: "block-1", type: "heading", order: 0, content: "Welcome", metadata: { level: 2 } },
    ]);
    expect(page?.faqItems).toEqual([
      { id: "faq-1", pageId: "page-1", question: "Q1?", answer: "A1.", order: 0, source: "manual" },
    ]);
    expect(page?.qualityScore).toBe(88);
  });
});

describe("SanityAdapter.createPage", () => {
  const validInput: CreatePageInput = {
    slug: "new-page",
    title: "New page",
    metaDescription: "A new page.",
    pageType: "blog",
    contentBlocks: [
      { id: "b1", type: "paragraph", order: 0, content: "Hello world." },
    ],
  };

  it("sends a translated document to Sanity and returns the re-fetched page", async () => {
    const create = vi.fn().mockResolvedValue({ _id: "page-2" });
    const fetch = vi.fn().mockResolvedValue({ ...samplePageDetail, _id: "page-2" });
    const adapter = new SanityAdapter(site, makeClient({ create, fetch }));

    const page = await adapter.createPage(validInput);

    expect(create).toHaveBeenCalledTimes(1);
    const doc = create.mock.calls[0][0];
    expect(doc._type).toBe("page");
    expect(doc.slug).toEqual({ _type: "slug", current: "new-page" });
    expect(doc.status).toBe("draft");
    expect(doc.seo).toEqual({ metaDescription: "A new page." });
    expect(doc.body).toHaveLength(1);
    expect(doc.body[0]).toMatchObject({ _type: "block", style: "normal" });
    expect(page.id).toBe("page-2");
  });

  it("rejects invalid input before ever calling Sanity", async () => {
    const create = vi.fn();
    const adapter = new SanityAdapter(site, makeClient({ create }));

    await expect(
      adapter.createPage({ ...validInput, title: "" }),
    ).rejects.toThrow(/title/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates a mutation rejected by Sanity instead of swallowing it", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Insufficient permissions"));
    const adapter = new SanityAdapter(site, makeClient({ create }));

    await expect(adapter.createPage(validInput)).rejects.toThrow("Insufficient permissions");
  });
});

describe("SanityAdapter.updatePage", () => {
  it("patches only the provided fields and returns the re-fetched page", async () => {
    const setMock = vi.fn(() => ({ commit: vi.fn().mockResolvedValue(undefined) }));
    const patch = vi.fn(() => ({ set: setMock }));
    const fetch = vi.fn().mockResolvedValue(samplePageDetail);
    const adapter = new SanityAdapter(site, makeClient({ patch, fetch }));

    const input: UpdatePageInput = { title: "Updated title" };
    const page = await adapter.updatePage("page-1", input);

    expect(patch).toHaveBeenCalledWith("page-1");
    expect(setMock).toHaveBeenCalledWith({ title: "Updated title" });
    expect(page.id).toBe("page-1");
  });
});

describe("SanityAdapter.listImages / updateImage", () => {
  const imageRows: PageWithImageBlocks[] = [
    {
      _id: "page-1",
      _createdAt: "2026-01-01T00:00:00.000Z",
      _updatedAt: "2026-01-02T00:00:00.000Z",
      images: [
        {
          _key: "img-1",
          alt: "",
          altTextStatus: "missing",
          asset: { _id: "asset-1", url: "https://cdn.sanity.io/images/proj/production/asset-1.jpg" },
        },
      ],
    },
  ];

  it("flattens imageBlocks across pages into ImageAsset[]", async () => {
    const client = makeClient({ fetch: vi.fn().mockResolvedValue(imageRows) });
    const adapter = new SanityAdapter(site, client);

    const images = await adapter.listImages({ altTextStatus: "missing" });

    expect(images).toEqual([
      {
        id: "img-1",
        siteId: "site-1",
        cmsAssetId: "img-1",
        url: "https://cdn.sanity.io/images/proj/production/asset-1.jpg",
        altText: null,
        altTextStatus: "missing",
        usedOnPageIds: ["page-1"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("throws when updateImage is called with an unknown cmsAssetId", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    const adapter = new SanityAdapter(site, makeClient({ fetch }));

    await expect(
      adapter.updateImage("does-not-exist", { altTextStatus: "reviewed" }),
    ).rejects.toThrow(/no image found/i);
  });
});

describe("content block <-> Portable Text translation", () => {
  it("round-trips a paragraph, cta, and image block", () => {
    const blocks = portableTextToContentBlocks([
      {
        _type: "block",
        _key: "p1",
        style: "normal",
        markDefs: [],
        children: [{ _type: "span", _key: "s1", text: "Hello.", marks: [] }],
      },
      {
        _type: "ctaBlock",
        _key: "c1",
        text: "Buy now",
        href: "https://example.com",
        openInNewTab: true,
      },
      {
        _type: "imageBlock",
        _key: "i1",
        alt: "A widget",
        altTextStatus: "reviewed",
        asset: { _id: "asset-9", url: "https://cdn.sanity.io/i.jpg" },
      },
    ]);

    expect(blocks).toEqual([
      { id: "p1", type: "paragraph", order: 0, content: "Hello.", metadata: undefined },
      {
        id: "c1",
        type: "cta",
        order: 1,
        content: "Buy now",
        metadata: { href: "https://example.com", openInNewTab: true },
      },
      {
        id: "i1",
        type: "image",
        order: 2,
        content: "A widget",
        metadata: {
          altTextStatus: "reviewed",
          caption: undefined,
          assetId: "asset-9",
          url: "https://cdn.sanity.io/i.jpg",
          dimensions: undefined,
          lqip: undefined,
        },
      },
    ]);

    const back = contentBlocksToPortableText(blocks);
    expect(back[0]).toMatchObject({ _type: "block", style: "normal", _key: "p1" });
    expect(back[1]).toMatchObject({ _type: "ctaBlock", href: "https://example.com", _key: "c1" });
    expect(back[2]).toMatchObject({
      _type: "imageBlock",
      _key: "i1",
      asset: { _type: "reference", _ref: "asset-9" },
    });
  });

  it("throws translating a faq-schema block, which has no Sanity representation", () => {
    expect(() =>
      contentBlocksToPortableText([
        { id: "f1", type: "faq-schema", order: 0, content: "" },
      ]),
    ).toThrow(/faq-schema/);
  });
});
