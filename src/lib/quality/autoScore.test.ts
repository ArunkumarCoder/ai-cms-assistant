import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CmsAdapter } from "@/lib/cms/adapter";
import type { Page } from "@/types";

const qualityScoreHistoryCreateMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { qualityScoreHistory: { create: (...args: unknown[]) => qualityScoreHistoryCreateMock(...args) } },
}));

const { withQualityScoring } = await import("./autoScore");

function page(overrides: Partial<Page> = {}): Page {
  return {
    id: "page-1",
    siteId: "site-1",
    cmsDocumentId: "page-1",
    slug: "my-page",
    title: "A well-explained landing page for widgets",
    metaDescription:
      "Buy the best widgets on the market, backed by a lifetime warranty and free shipping worldwide.",
    targetKeyword: undefined,
    pageType: "landing",
    status: "draft",
    contentBlocks: [],
    latestSeoAuditId: undefined,
    faqItems: [],
    qualityScore: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeInnerAdapter(overrides: Partial<CmsAdapter> = {}): CmsAdapter {
  return {
    getPages: vi.fn(),
    getPage: vi.fn(),
    createPage: vi.fn(),
    updatePage: vi.fn(),
    listImages: vi.fn(),
    updateImage: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  qualityScoreHistoryCreateMock.mockReset().mockResolvedValue(undefined);
});

describe("withQualityScoring", () => {
  it("scores a page immediately after createPage, patching qualityScore via a second updatePage call", async () => {
    const created = page({ qualityScore: null });
    const rescored = page({ qualityScore: 55 });
    const createPage = vi.fn().mockResolvedValue(created);
    const updatePage = vi.fn().mockResolvedValue(rescored);
    const inner = makeInnerAdapter({ createPage, updatePage });
    const adapter = withQualityScoring(inner, { siteId: "site-1" });

    const result = await adapter.createPage({
      title: created.title,
      metaDescription: created.metaDescription,
      pageType: created.pageType,
      slug: created.slug,
    });

    expect(createPage).toHaveBeenCalledTimes(1);
    expect(updatePage).toHaveBeenCalledTimes(1);
    const [patchedId, patchData] = updatePage.mock.calls[0];
    expect(patchedId).toBe("page-1");
    expect(typeof patchData.qualityScore).toBe("number");
    expect(result).toBe(rescored);
  });

  it("scores a page again after updatePage, using the freshly-returned page rather than the caller's input", async () => {
    const updated = page({ title: "Updated Title", qualityScore: null });
    const rescored = page({ title: "Updated Title", qualityScore: 62 });
    const updatePage = vi.fn().mockResolvedValueOnce(updated).mockResolvedValueOnce(rescored);
    const inner = makeInnerAdapter({ updatePage });
    const adapter = withQualityScoring(inner, { siteId: "site-1" });

    await adapter.updatePage("page-1", { title: "Updated Title" });

    // Once for the caller's own content patch, once more for the score patch.
    expect(updatePage).toHaveBeenCalledTimes(2);
    expect(updatePage).toHaveBeenNthCalledWith(1, "page-1", { title: "Updated Title" });
    const [, secondPatchData] = updatePage.mock.calls[1];
    expect(typeof secondPatchData.qualityScore).toBe("number");
  });

  it("records a timestamped history row alongside the persisted score", async () => {
    const created = page();
    const updatePage = vi.fn().mockResolvedValue(page({ qualityScore: 70 }));
    const inner = makeInnerAdapter({ createPage: vi.fn().mockResolvedValue(created), updatePage });
    const adapter = withQualityScoring(inner, { siteId: "site-42" });

    await adapter.createPage({
      title: created.title,
      metaDescription: created.metaDescription,
      pageType: created.pageType,
      slug: created.slug,
    });

    expect(qualityScoreHistoryCreateMock).toHaveBeenCalledTimes(1);
    const [{ data }] = qualityScoreHistoryCreateMock.mock.calls[0];
    expect(data.pageId).toBe("page-1");
    expect(data.siteId).toBe("site-42");
    expect(typeof data.score).toBe("number");
    expect(data.subScores).toHaveProperty("seo");
    expect(data.subScores).toHaveProperty("readability");
    expect(data.subScores).toHaveProperty("structure");
  });

  it("still persists and returns the current score even when history recording fails", async () => {
    qualityScoreHistoryCreateMock.mockRejectedValue(new Error("db unreachable"));
    const created = page();
    const rescored = page({ qualityScore: 40 });
    const inner = makeInnerAdapter({
      createPage: vi.fn().mockResolvedValue(created),
      updatePage: vi.fn().mockResolvedValue(rescored),
    });
    const adapter = withQualityScoring(inner, { siteId: "site-1" });

    await expect(
      adapter.createPage({
        title: created.title,
        metaDescription: created.metaDescription,
        pageType: created.pageType,
        slug: created.slug,
      }),
    ).resolves.toBe(rescored);
  });

  it("propagates a failure from the score-patching updatePage call instead of swallowing it", async () => {
    const created = page();
    const inner = makeInnerAdapter({
      createPage: vi.fn().mockResolvedValue(created),
      updatePage: vi.fn().mockRejectedValue(new Error("Sanity write failed")),
    });
    const adapter = withQualityScoring(inner, { siteId: "site-1" });

    await expect(
      adapter.createPage({
        title: created.title,
        metaDescription: created.metaDescription,
        pageType: created.pageType,
        slug: created.slug,
      }),
    ).rejects.toThrow("Sanity write failed");
  });

  it("leaves every other CmsAdapter method untouched", async () => {
    const getPages = vi.fn().mockResolvedValue([]);
    const getPage = vi.fn().mockResolvedValue(null);
    const listImages = vi.fn().mockResolvedValue([]);
    const updateImage = vi.fn();
    const inner = makeInnerAdapter({ getPages, getPage, listImages, updateImage });
    const adapter = withQualityScoring(inner, { siteId: "site-1" });

    await adapter.getPages();
    await adapter.getPage("some-slug");
    await adapter.listImages();

    expect(getPages).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledWith("some-slug");
    expect(listImages).toHaveBeenCalledTimes(1);
    expect(updateImage).not.toHaveBeenCalled();
  });
});
