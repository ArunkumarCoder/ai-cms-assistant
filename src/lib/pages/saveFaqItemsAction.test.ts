import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaqItem } from "@/types";

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
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1", email: "owner@example.com" });
  updatePageMock.mockReset();
  getAdapterForCurrentUserMock.mockReset().mockResolvedValue({ updatePage: updatePageMock });
  getActiveSiteForCurrentUserMock.mockReset().mockResolvedValue({ id: "site-1" });
  logPageActivityMock.mockReset().mockResolvedValue(undefined);
});

describe("saveFaqItemsAction", () => {
  it("persists the FAQ list through CmsAdapter.updatePage", async () => {
    const faqItems = [faq({ id: "faq-1" }), faq({ id: "faq-2", order: 1 })];
    updatePageMock.mockResolvedValue({ id: "page-1", faqItems });

    const result = await saveFaqItemsAction({ cmsDocumentId: "page-1", faqItems, previousFaqItems: [] });

    expect(updatePageMock).toHaveBeenCalledWith("page-1", { faqItems });
    expect("page" in result).toBe(true);
  });

  it("persists an empty array — deleting every FAQ down to zero is a valid save, not an error", async () => {
    updatePageMock.mockResolvedValue({ id: "page-1", faqItems: [] });

    const result = await saveFaqItemsAction({
      cmsDocumentId: "page-1",
      faqItems: [],
      previousFaqItems: [faq()],
    });

    expect(updatePageMock).toHaveBeenCalledWith("page-1", { faqItems: [] });
    expect("page" in result).toBe(true);
  });

  it("rejects a FAQ with an empty question or answer before ever calling the adapter", async () => {
    const result = await saveFaqItemsAction({
      cmsDocumentId: "page-1",
      faqItems: [faq({ question: "   " })],
      previousFaqItems: [],
    });

    expect("error" in result).toBe(true);
    expect(updatePageMock).not.toHaveBeenCalled();
  });

  it("returns an error instead of throwing when the adapter write fails", async () => {
    updatePageMock.mockRejectedValue(new Error("Sanity write failed"));

    const result = await saveFaqItemsAction({
      cmsDocumentId: "page-1",
      faqItems: [faq()],
      previousFaqItems: [],
    });

    expect(result).toEqual({ error: "Sanity write failed" });
  });

  it("logs an audit entry noting AI-generated FAQs when any saved item has that source", async () => {
    const faqItems = [faq({ id: "faq-1", source: "ai-generated" })];
    updatePageMock.mockResolvedValue({ id: "page-1", faqItems });

    await saveFaqItemsAction({ cmsDocumentId: "page-1", faqItems, previousFaqItems: [] });

    expect(logPageActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-1",
        siteId: "site-1",
        action: "faqs-updated",
        summary: expect.stringContaining("AI-generated"),
      }),
    );
  });

  it("does not log an audit entry when the FAQ list didn't actually change", async () => {
    const faqItems = [faq({ id: "faq-1" })];
    updatePageMock.mockResolvedValue({ id: "page-1", faqItems });

    await saveFaqItemsAction({ cmsDocumentId: "page-1", faqItems, previousFaqItems: faqItems });

    expect(logPageActivityMock).not.toHaveBeenCalled();
  });
});
