import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUserMock() }));

const generateWithVisionMock = vi.fn();
vi.mock("@/lib/ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai")>("@/lib/ai");
  return {
    ...actual,
    aiClient: { generateWithVision: (...args: unknown[]) => generateWithVisionMock(...args) },
  };
});

const getActiveSiteForCurrentUserMock = vi.fn();
vi.mock("@/lib/cms", () => ({
  getActiveSiteForCurrentUser: () => getActiveSiteForCurrentUserMock(),
}));

const { generateAltTextAction } = await import("./generateAltTextAction");

const VALID_ALT_TEXT = {
  altText: "A red mountain bike leaning against a brick wall.",
  confidence: "high" as const,
  needsReview: false,
};

const INPUT = {
  imageUrl: "https://cdn.sanity.io/images/proj/production/bike.jpg",
  pageTitle: "Our Bikes",
};

beforeEach(() => {
  generateWithVisionMock.mockReset();
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1", email: "owner@example.com" });
  getActiveSiteForCurrentUserMock.mockReset().mockResolvedValue({ id: "site-1" });
});

describe("generateAltTextAction", () => {
  it("calls generateWithVision with the alt-text-single call type, the image URL, and a built prompt", async () => {
    generateWithVisionMock.mockResolvedValue({
      data: VALID_ALT_TEXT,
      usage: { inputTokens: 300, outputTokens: 40 },
      provider: "openai",
      model: "gpt-4o-mini",
    });

    const result = await generateAltTextAction(INPUT);

    expect("altText" in result).toBe(true);
    if ("altText" in result) {
      expect(result.altText).toEqual(VALID_ALT_TEXT);
    }

    const [callType, prompt, imageUrl, , options] = generateWithVisionMock.mock.calls[0];
    expect(callType).toBe("alt-text-single");
    expect(prompt).toContain(INPUT.pageTitle);
    expect(imageUrl).toBe(INPUT.imageUrl);
    expect(options).toEqual({ context: { userId: "user-1", siteId: "site-1" } });
  });

  it("still works with no connected site (no siteId attribution, generation isn't blocked)", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue(null);
    generateWithVisionMock.mockResolvedValue({
      data: VALID_ALT_TEXT,
      usage: { inputTokens: 300, outputTokens: 40 },
      provider: "openai",
      model: "gpt-4o-mini",
    });

    const result = await generateAltTextAction({ imageUrl: INPUT.imageUrl });

    expect("altText" in result).toBe(true);
    const [, , , , options] = generateWithVisionMock.mock.calls[0];
    expect(options).toEqual({ context: { userId: "user-1", siteId: undefined } });
  });

  it("returns an error instead of throwing when the vision call fails", async () => {
    generateWithVisionMock.mockRejectedValue(new Error("OpenAI request timed out"));

    const result = await generateAltTextAction(INPUT);

    expect(result).toEqual({ error: "OpenAI request timed out" });
  });

  it("returns an error when the provider's response fails schema validation even after aiClient's own retries", async () => {
    // Schema validation + retry now live inside aiClient.generateWithVision
    // itself (SPEC.md's Day 31 task) — this mock stands in for what it does
    // once every retry is exhausted: throw AiValidationError, never resolve
    // with a confidence value outside the enum.
    const { AiValidationError } = await import("@/lib/ai");
    generateWithVisionMock.mockRejectedValue(
      new AiValidationError("alt-text-single", "openai", [
        { code: "invalid_value", path: ["confidence"], message: "Invalid enum value" } as never,
      ]),
    );

    const result = await generateAltTextAction(INPUT);

    expect("error" in result).toBe(true);
  });
});
