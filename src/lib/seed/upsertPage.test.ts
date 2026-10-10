import { describe, expect, it, vi } from "vitest";
import type { CmsAdapter } from "@/lib/cms/adapter";
import type { Page } from "@/types";
import { upsertDemoFaqs, upsertDemoPage } from "./upsertPage";

function fakePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "page-1",
    siteId: "site-1",
    cmsDocumentId: "page-1",
    slug: "demo-home",
    title: "Home",
    metaDescription: "desc",
    pageType: "landing",
    status: "draft",
    contentBlocks: [],
    faqItems: [],
    qualityScore: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function fakeAdapter(getPageResult: Page | null): CmsAdapter & {
  getPage: ReturnType<typeof vi.fn>;
  createPage: ReturnType<typeof vi.fn>;
  updatePage: ReturnType<typeof vi.fn>;
} {
  return {
    getPages: vi.fn(),
    getPage: vi.fn().mockResolvedValue(getPageResult),
    createPage: vi
      .fn()
      .mockImplementation((data) => Promise.resolve(fakePage(data))),
    updatePage: vi
      .fn()
      .mockImplementation((id, data) =>
        Promise.resolve(fakePage({ cmsDocumentId: id, ...data })),
      ),
    listImages: vi.fn(),
    updateImage: vi.fn(),
  };
}

const INPUT = {
  slug: "demo-home",
  title: "Larkspur Coffee Roasters",
  metaDescription: "desc",
  targetKeyword: "coffee",
  pageType: "landing" as const,
  contentBlocks: [],
};

describe("upsertDemoPage", () => {
  it("creates a new page when none exists at that slug yet", async () => {
    const adapter = fakeAdapter(null);
    const result = await upsertDemoPage(adapter, INPUT);

    expect(adapter.createPage).toHaveBeenCalledTimes(1);
    expect(adapter.updatePage).not.toHaveBeenCalled();
    expect(result.created).toBe(true);
  });

  it("updates in place, never creates a second time, when a page already exists at that slug", async () => {
    const existing = fakePage({
      slug: "demo-home",
      cmsDocumentId: "existing-id",
    });
    const adapter = fakeAdapter(existing);
    const result = await upsertDemoPage(adapter, INPUT);

    expect(adapter.createPage).not.toHaveBeenCalled();
    expect(adapter.updatePage).toHaveBeenCalledWith(
      "existing-id",
      expect.objectContaining({ title: INPUT.title }),
    );
    expect(result.created).toBe(false);
  });

  it("running the same upsert twice in a row never creates more than one page", async () => {
    // Simulates the real re-run scenario: the second call's `getPage` sees
    // what the first call's `createPage` produced.
    let stored: Page | null = null;
    const adapter: CmsAdapter = {
      getPages: vi.fn(),
      getPage: vi.fn().mockImplementation(() => Promise.resolve(stored)),
      createPage: vi.fn().mockImplementation((data) => {
        stored = fakePage(data);
        return Promise.resolve(stored);
      }),
      updatePage: vi.fn().mockImplementation((id, data) => {
        stored = fakePage({ ...stored, cmsDocumentId: id, ...data });
        return Promise.resolve(stored);
      }),
      listImages: vi.fn(),
      updateImage: vi.fn(),
    };

    const first = await upsertDemoPage(adapter, INPUT);
    const second = await upsertDemoPage(adapter, INPUT);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(adapter.createPage).toHaveBeenCalledTimes(1);
    expect(adapter.updatePage).toHaveBeenCalledTimes(1);
  });

  it("never touches status — leaves that to the real transition workflow", async () => {
    const adapter = fakeAdapter(null);
    await upsertDemoPage(adapter, INPUT);

    const createCall = adapter.createPage.mock.calls[0][0];
    expect(createCall).not.toHaveProperty("status");
  });
});

describe("upsertDemoFaqs", () => {
  it("replaces the whole faqItems array with pageId filled in", async () => {
    const adapter = fakeAdapter(null);
    await upsertDemoFaqs(
      adapter,
      "doc-1",
      [
        {
          id: "faq-1",
          question: "Q?",
          answer: "A.",
          order: 0,
          source: "manual",
        },
      ],
      "page-1",
    );

    expect(adapter.updatePage).toHaveBeenCalledWith("doc-1", {
      faqItems: [
        {
          id: "faq-1",
          question: "Q?",
          answer: "A.",
          order: 0,
          source: "manual",
          pageId: "page-1",
        },
      ],
    });
  });
});
