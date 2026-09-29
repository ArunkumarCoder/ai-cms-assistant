import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUserMock() }));

const updatePageMock = vi.fn();
const getAdapterForCurrentUserMock = vi.fn();
const getActiveSiteForCurrentUserMock = vi.fn();
vi.mock("@/lib/cms", () => ({
  getAdapterForCurrentUser: () => getAdapterForCurrentUserMock(),
  getActiveSiteForCurrentUser: () => getActiveSiteForCurrentUserMock(),
}));

const logPageActivityMock = vi.fn();
vi.mock("@/lib/audit", () => ({
  logPageActivity: (...args: unknown[]) => logPageActivityMock(...args),
}));

const { transitionPageStatusAction } = await import("./transitionPageStatusAction");

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1", email: "owner@example.com" });
  updatePageMock.mockReset();
  getAdapterForCurrentUserMock.mockReset().mockResolvedValue({ updatePage: updatePageMock });
  getActiveSiteForCurrentUserMock.mockReset().mockResolvedValue({ id: "site-1" });
  logPageActivityMock.mockReset().mockResolvedValue(undefined);
});

describe("transitionPageStatusAction", () => {
  it("applies a legal transition and logs it", async () => {
    updatePageMock.mockResolvedValue({ id: "page-1", cmsDocumentId: "page-1", status: "in-review" });

    const result = await transitionPageStatusAction({
      cmsDocumentId: "page-1",
      currentStatus: "draft",
      action: "submit",
    });

    expect(updatePageMock).toHaveBeenCalledWith("page-1", { status: "in-review" });
    expect("page" in result).toBe(true);
    expect(logPageActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-1",
        siteId: "site-1",
        userId: "user-1",
        userEmail: "owner@example.com",
        action: "status-changed",
        summary: "Status changed: draft → in-review.",
      }),
    );
  });

  it("rejects an illegal transition before ever calling the adapter", async () => {
    const result = await transitionPageStatusAction({
      cmsDocumentId: "page-1",
      currentStatus: "draft",
      action: "publish",
    });

    expect("error" in result).toBe(true);
    expect(updatePageMock).not.toHaveBeenCalled();
    expect(logPageActivityMock).not.toHaveBeenCalled();
  });

  it("allows reject from approved back to draft", async () => {
    updatePageMock.mockResolvedValue({ id: "page-1", cmsDocumentId: "page-1", status: "draft" });

    const result = await transitionPageStatusAction({
      cmsDocumentId: "page-1",
      currentStatus: "approved",
      action: "reject",
    });

    expect(updatePageMock).toHaveBeenCalledWith("page-1", { status: "draft" });
    expect("page" in result).toBe(true);
  });

  it("returns an error instead of throwing when the adapter write fails", async () => {
    updatePageMock.mockRejectedValue(new Error("Sanity write failed"));

    const result = await transitionPageStatusAction({
      cmsDocumentId: "page-1",
      currentStatus: "draft",
      action: "submit",
    });

    expect(result).toEqual({ error: "Sanity write failed" });
  });

  it("still applies the transition even when there is no active site to attribute the log to", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue(null);
    updatePageMock.mockResolvedValue({ id: "page-1", cmsDocumentId: "page-1", status: "in-review" });

    const result = await transitionPageStatusAction({
      cmsDocumentId: "page-1",
      currentStatus: "draft",
      action: "submit",
    });

    expect("page" in result).toBe(true);
    expect(logPageActivityMock).not.toHaveBeenCalled();
  });
});
