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

const getActiveSiteForCurrentUserMock = vi.fn();
vi.mock("@/lib/cms", () => ({
  getActiveSiteForCurrentUser: () => getActiveSiteForCurrentUserMock(),
}));

const { generateSeoSuggestionsAction } = await import("./generateSeoSuggestionsAction");

const VALID_SUGGESTIONS = {
  score: 72,
  breakdown: {
    keywordUsage: 80,
    metaTags: 60,
    readability: 75,
    headingStructure: 70,
    internalLinking: 50,
  },
  suggestions: [{ category: "metaTags", message: "Expand the meta description." }],
  suggestedMetaTitle: "Local Plumbing Services in Austin, TX",
  suggestedMetaDescription: "Fast, licensed plumbing repair across Austin, TX — book online today.",
  keywordGaps: ["emergency plumber"],
};

const INPUT = {
  title: "Local Plumbing Services",
  metaDescription: "Fast plumbing repair.",
  targetKeyword: "plumber austin",
  pageType: "landing" as const,
  contentBlocks: [
    { id: "1", type: "heading" as const, order: 0, content: "Trusted Plumbers", metadata: { level: 2 } },
    { id: "2", type: "paragraph" as const, order: 1, content: "We fix leaks and clogs." },
  ],
};

beforeEach(() => {
  generateStructuredMock.mockReset();
  requireUserMock.mockReset();
  requireUserMock.mockResolvedValue({ id: "user-1", email: "owner@example.com" });
  getActiveSiteForCurrentUserMock.mockReset().mockResolvedValue(null);
});

describe("generateSeoSuggestionsAction", () => {
  it("calls generateStructured with the seo-scoring call type and a prompt built from the input", async () => {
    generateStructuredMock.mockResolvedValue({
      data: VALID_SUGGESTIONS,
      usage: { inputTokens: 10, outputTokens: 20 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    const result = await generateSeoSuggestionsAction(INPUT);

    expect("suggestions" in result).toBe(true);
    if ("suggestions" in result) {
      expect(result.suggestions).toEqual(VALID_SUGGESTIONS);
    }

    const [callType, prompt, , options] = generateStructuredMock.mock.calls[0];
    expect(callType).toBe("seo-scoring");
    expect(prompt).toContain(INPUT.title);
    expect(options).toEqual({ context: { userId: "user-1" } });
  });

  it("threads the active site's brand voice into the prompt when one is set", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue({ brandVoice: "Warm and plain-spoken." });
    generateStructuredMock.mockResolvedValue({
      data: VALID_SUGGESTIONS,
      usage: { inputTokens: 10, outputTokens: 20 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    await generateSeoSuggestionsAction(INPUT);

    const [, prompt] = generateStructuredMock.mock.calls[0];
    expect(prompt).toContain("Warm and plain-spoken.");
  });

  it("attributes the AI call's cost log to the active site (SPEC.md §20 — this was missing before today)", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue({ id: "site-1", brandVoice: null });
    generateStructuredMock.mockResolvedValue({
      data: VALID_SUGGESTIONS,
      usage: { inputTokens: 10, outputTokens: 20 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    await generateSeoSuggestionsAction(INPUT);

    const [, , , options] = generateStructuredMock.mock.calls[0];
    expect(options).toEqual({ context: { userId: "user-1", siteId: "site-1" } });
  });

  it("omits the brand voice line when no site is connected", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue(null);
    generateStructuredMock.mockResolvedValue({
      data: VALID_SUGGESTIONS,
      usage: { inputTokens: 10, outputTokens: 20 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    await generateSeoSuggestionsAction(INPUT);

    const [, prompt] = generateStructuredMock.mock.calls[0];
    expect(prompt).not.toContain("Brand voice");
  });

  it("returns an error instead of throwing when the provider call fails", async () => {
    generateStructuredMock.mockRejectedValue(new Error("Groq is down"));

    const result = await generateSeoSuggestionsAction(INPUT);

    expect(result).toEqual({ error: "Groq is down" });
  });

  it("returns an error when the provider's response fails schema validation even after aiClient's own retries", async () => {
    // Schema validation + retry now live inside aiClient.generateStructured
    // itself (SPEC.md's Day 31 task) — this mock stands in for what it does
    // once every retry is exhausted: throw AiValidationError, never resolve
    // with the still-malformed data.
    const { AiValidationError } = await import("@/lib/ai");
    generateStructuredMock.mockRejectedValue(
      new AiValidationError("seo-scoring", "groq", [
        { code: "too_big", path: ["score"], message: "Too large" } as never,
      ]),
    );

    const result = await generateSeoSuggestionsAction(INPUT);

    expect("error" in result).toBe(true);
  });
});
