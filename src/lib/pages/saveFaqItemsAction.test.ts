import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaqItem } from "@/types";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUserMock() }));

const updatePageMock = vi.fn();
const getAdapterForCurrentUserMock = vi.fn();
vi.mock("@/lib/cms", () => ({
  getAdapterForCurrentUser: () => getAdapterForCurrentUserMock(),
}));

const { saveFaqItemsAction } = await import("./saveFaqItemsAction");

function faq(overrides: Partial<FaqItem> = {}): FaqItem {
  return {
    id: overrides.id ?? "faq-1",
    pageId: overrides.pageId ?? "page-1",
    question: overrides.question ?? "Do you offer emergency service?",
    answer: overrides.answer ?? "Yes, 24/7.",
    order: overrides.order ?? 0,
    source: overrides.source ?? "ai-generated",
  };
}

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  updatePageMock.mockReset();
  getAdapterForCurrentUserMock.mockReset().mockResolvedValue({ updatePage: updatePageMock });
});

describe("saveFaqItemsAction", () => {
  it("persists the FAQ list through CmsAdapter.updatePage", async () => {
    const faqItems = [faq({ id: "faq-1" }), faq({ id: "faq-2", order: 1 })];
    updatePageMock.mockResolvedValue({ id: "page-1", faqItems });

    const result = await saveFaqItemsAction({ cmsDocumentId: "page-1", faqItems });

    expect(updatePageMock).toHaveBeenCalledWith("page-1", { faqItems });
    expect("page" in result).toBe(true);
  });

  it("persists an empty array — deleting every FAQ down to zero is a valid save, not an error", async () => {
    updatePageMock.mockResolvedValue({ id: "page-1", faqItems: [] });

    const result = await saveFaqItemsAction({ cmsDocumentId: "page-1", faqItems: [] });

    expect(updatePageMock).toHaveBeenCalledWith("page-1", { faqItems: [] });
    expect("page" in result).toBe(true);
  });

  it("rejects a FAQ with an empty question or answer before ever calling the adapter", async () => {
    const result = await saveFaqItemsAction({
      cmsDocumentId: "page-1",
      faqItems: [faq({ question: "   " })],
    });

    expect("error" in result).toBe(true);
    expect(updatePageMock).not.toHaveBeenCalled();
  });

  it("returns an error instead of throwing when the adapter write fails", async () => {
    updatePageMock.mockRejectedValue(new Error("Sanity write failed"));

    const result = await saveFaqItemsAction({ cmsDocumentId: "page-1", faqItems: [faq()] });

    expect(result).toEqual({ error: "Sanity write failed" });
  });
});
