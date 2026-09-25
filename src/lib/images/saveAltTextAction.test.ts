import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUserMock() }));

const updateImageMock = vi.fn();
const getAdapterForCurrentUserMock = vi.fn();
vi.mock("@/lib/cms", () => ({
  getAdapterForCurrentUser: () => getAdapterForCurrentUserMock(),
}));

const { saveAltTextAction } = await import("./saveAltTextAction");

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  updateImageMock.mockReset();
  getAdapterForCurrentUserMock.mockReset().mockResolvedValue({ updateImage: updateImageMock });
});

describe("saveAltTextAction", () => {
  it("sets altTextStatus to ai-generated when the suggestion was accepted unedited", async () => {
    updateImageMock.mockResolvedValue({ id: "img-1", altText: "A red bike.", altTextStatus: "ai-generated" });

    const result = await saveAltTextAction({ cmsAssetId: "img-1", altText: "A red bike.", edited: false });

    expect(updateImageMock).toHaveBeenCalledWith("img-1", {
      altText: "A red bike.",
      altTextStatus: "ai-generated",
    });
    expect("image" in result).toBe(true);
  });

  it("sets altTextStatus to reviewed when the user edited the suggestion before accepting", async () => {
    updateImageMock.mockResolvedValue({ id: "img-1", altText: "A red mountain bike.", altTextStatus: "reviewed" });

    await saveAltTextAction({ cmsAssetId: "img-1", altText: "A red mountain bike.", edited: true });

    expect(updateImageMock).toHaveBeenCalledWith("img-1", {
      altText: "A red mountain bike.",
      altTextStatus: "reviewed",
    });
  });

  it("trims the alt text before saving", async () => {
    updateImageMock.mockResolvedValue({ id: "img-1" });

    await saveAltTextAction({ cmsAssetId: "img-1", altText: "  A red bike.  ", edited: false });

    expect(updateImageMock).toHaveBeenCalledWith("img-1", expect.objectContaining({ altText: "A red bike." }));
  });

  it("rejects an empty alt text before ever calling the adapter", async () => {
    const result = await saveAltTextAction({ cmsAssetId: "img-1", altText: "   ", edited: true });

    expect(result).toEqual({ error: "Alt text can't be empty." });
    expect(updateImageMock).not.toHaveBeenCalled();
  });

  it("returns an error instead of throwing when the adapter write fails", async () => {
    updateImageMock.mockRejectedValue(new Error("Sanity write failed"));

    const result = await saveAltTextAction({ cmsAssetId: "img-1", altText: "A red bike.", edited: false });

    expect(result).toEqual({ error: "Sanity write failed" });
  });
});
