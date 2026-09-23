import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUserMock() }));

const generateStructuredMock = vi.fn();
vi.mock("@/lib/ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai")>("@/lib/ai");
  return {
    ...actual,
    aiClient: { generateStructured: (...args: unknown[]) => generateStructuredMock(...args) },
  };
});

const updatePageMock = vi.fn();
const getAdapterForCurrentUserMock = vi.fn();
const getActiveSiteForCurrentUserMock = vi.fn();
vi.mock("@/lib/cms", () => ({
  getAdapterForCurrentUser: () => getAdapterForCurrentUserMock(),
  getActiveSiteForCurrentUser: () => getActiveSiteForCurrentUserMock(),
}));

const { regenerateBlockAction } = await import("./regenerateBlockAction");

const CONTENT_BLOCKS = [
  { id: "b1", type: "heading" as const, order: 0, content: "Old heading", metadata: { level: 2 } },
  { id: "b2", type: "paragraph" as const, order: 1, content: "Old paragraph" },
  { id: "b3", type: "cta" as const, order: 2, content: "Old CTA", metadata: { href: "/x", openInNewTab: false } },
];

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    pageTitle: "My Page",
    metaDescription: "desc",
    targetKeyword: null,
    pageType: "landing" as const,
    contentBlocks: CONTENT_BLOCKS,
    targetBlockId: "b2",
    ...overrides,
  };
}

function mockRegenerated(block: unknown) {
  generateStructuredMock.mockResolvedValue({
    data: { block },
    usage: { inputTokens: 5, outputTokens: 5 },
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  });
}

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  generateStructuredMock.mockReset();
  updatePageMock.mockReset();
  getAdapterForCurrentUserMock.mockReset().mockResolvedValue({ updatePage: updatePageMock });
  getActiveSiteForCurrentUserMock.mockReset().mockResolvedValue(null);
});

describe("regenerateBlockAction", () => {
  it("returns the regenerated block without persisting when there is no cmsDocumentId yet", async () => {
    mockRegenerated({ type: "paragraph", content: "New paragraph" });

    const result = await regenerateBlockAction(baseInput());

    expect(result).toEqual({ block: { type: "paragraph", content: "New paragraph" } });
    expect(updatePageMock).not.toHaveBeenCalled();
  });

  it("persists through the adapter, changing only the target block, when a cmsDocumentId exists", async () => {
    mockRegenerated({ type: "paragraph", content: "New paragraph" });
    updatePageMock.mockResolvedValue({});

    await regenerateBlockAction(baseInput({ cmsDocumentId: "page-1" }));

    expect(updatePageMock).toHaveBeenCalledTimes(1);
    const [id, patch] = updatePageMock.mock.calls[0];
    expect(id).toBe("page-1");
    expect(patch.contentBlocks).toHaveLength(3);
    expect(patch.contentBlocks[0]).toEqual(CONTENT_BLOCKS[0]); // untouched
    expect(patch.contentBlocks[1]).toEqual({
      id: "b2",
      type: "paragraph",
      order: 1,
      content: "New paragraph",
    });
    expect(patch.contentBlocks[2]).toEqual(CONTENT_BLOCKS[2]); // untouched
  });

  it("returns an error and never calls updatePage when the AI call fails", async () => {
    generateStructuredMock.mockRejectedValue(new Error("Groq is down"));

    const result = await regenerateBlockAction(baseInput({ cmsDocumentId: "page-1" }));

    expect(result).toEqual({ error: "Groq is down" });
    expect(updatePageMock).not.toHaveBeenCalled();
  });

  it("rejects a response that swapped the block's type, and never calls updatePage", async () => {
    mockRegenerated({ type: "cta", content: "Surprise", href: "/x", openInNewTab: false });

    const result = await regenerateBlockAction(baseInput({ cmsDocumentId: "page-1" }));

    expect("error" in result).toBe(true);
    expect(updatePageMock).not.toHaveBeenCalled();
  });

  it("surfaces a persistence failure as an error even though the AI regeneration itself succeeded", async () => {
    mockRegenerated({ type: "paragraph", content: "New paragraph" });
    updatePageMock.mockRejectedValue(new Error("Sanity write failed"));

    const result = await regenerateBlockAction(baseInput({ cmsDocumentId: "page-1" }));

    expect(result).toEqual({ error: "Sanity write failed" });
  });

  it("short-circuits before any AI call when the target block id no longer exists", async () => {
    const result = await regenerateBlockAction(baseInput({ targetBlockId: "missing" }));

    expect("error" in result).toBe(true);
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("threads the active site's brand voice into the regeneration prompt", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue({ brandVoice: "Warm and plain-spoken." });
    mockRegenerated({ type: "paragraph", content: "New paragraph" });

    await regenerateBlockAction(baseInput());

    const [, prompt] = generateStructuredMock.mock.calls[0];
    expect(prompt).toContain("Warm and plain-spoken.");
  });
});
