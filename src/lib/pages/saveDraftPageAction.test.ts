import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUserMock() }));

const createPageMock = vi.fn();
const updatePageMock = vi.fn();
const getAdapterForCurrentUserMock = vi.fn();
vi.mock("@/lib/cms", () => ({
  getAdapterForCurrentUser: () => getAdapterForCurrentUserMock(),
}));

const { saveDraftPageAction } = await import("./saveDraftPageAction");

const CONTENT_BLOCKS = [
  { id: "b1", type: "paragraph" as const, order: 0, content: "Hello." },
];

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  createPageMock.mockReset();
  updatePageMock.mockReset();
  getAdapterForCurrentUserMock.mockReset().mockResolvedValue({
    createPage: createPageMock,
    updatePage: updatePageMock,
  });
});

describe("saveDraftPageAction", () => {
  it("creates a new page (via the adapter, not a direct Sanity call) when there is no cmsDocumentId", async () => {
    createPageMock.mockResolvedValue({ id: "page-1", cmsDocumentId: "page-1", slug: "my-page" });

    const result = await saveDraftPageAction({
      title: "My Page",
      slug: "My Page!!",
      metaDescription: "desc",
      targetKeyword: null,
      pageType: "landing",
      contentBlocks: CONTENT_BLOCKS,
    });

    expect(createPageMock).toHaveBeenCalledTimes(1);
    expect(updatePageMock).not.toHaveBeenCalled();
    const input = createPageMock.mock.calls[0][0];
    expect(input.slug).toBe("my-page");
    expect(input.status).toBeUndefined(); // adapter's own default applies
    expect(input.targetKeyword).toBeUndefined(); // null -> undefined at the boundary
    expect("page" in result && result.page.slug).toBe("my-page");
  });

  it("updates an existing page when a cmsDocumentId is present", async () => {
    updatePageMock.mockResolvedValue({ id: "page-1", cmsDocumentId: "page-1", slug: "my-page" });

    await saveDraftPageAction({
      cmsDocumentId: "page-1",
      title: "My Page",
      slug: "my-page",
      metaDescription: "desc",
      targetKeyword: "keyword",
      pageType: "landing",
      contentBlocks: CONTENT_BLOCKS,
    });

    expect(updatePageMock).toHaveBeenCalledTimes(1);
    expect(createPageMock).not.toHaveBeenCalled();
    expect(updatePageMock).toHaveBeenCalledWith(
      "page-1",
      expect.objectContaining({ targetKeyword: "keyword" }),
    );
  });

  it("returns an error instead of throwing when the adapter rejects the write", async () => {
    createPageMock.mockRejectedValue(new Error("Sanity write failed"));

    const result = await saveDraftPageAction({
      title: "My Page",
      slug: "my-page",
      metaDescription: "desc",
      targetKeyword: null,
      pageType: "landing",
      contentBlocks: CONTENT_BLOCKS,
    });

    expect(result).toEqual({ error: "Sanity write failed" });
  });

  it("returns an error (does not throw) when there is no connected site", async () => {
    getAdapterForCurrentUserMock.mockRejectedValue(new Error("No Sanity project connected"));

    const result = await saveDraftPageAction({
      title: "My Page",
      slug: "my-page",
      metaDescription: "desc",
      targetKeyword: null,
      pageType: "landing",
      contentBlocks: CONTENT_BLOCKS,
    });

    expect("error" in result).toBe(true);
  });
});
