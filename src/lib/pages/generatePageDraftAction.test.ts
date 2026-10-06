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

const { generatePageDraftAction } = await import("./generatePageDraftAction");

const VALID_DRAFT = {
  title: "Local Plumbing Services in Austin",
  slug: "Local Plumbing Services!!",
  metaDescription: "Fast, licensed plumbing repair across Austin, TX.",
  targetKeyword: "plumber austin",
  contentBlocks: [
    { type: "heading", content: "Austin's Trusted Plumbers", level: 2 },
    { type: "paragraph", content: "We fix leaks, clogs, and installs, same day." },
    { type: "cta", content: "Book a repair", href: "/contact", openInNewTab: false },
  ],
};

const BRIEF = {
  title: "Local Plumbing Services",
  targetKeyword: "plumber austin",
  audience: "homeowners",
  keyPoints: "24/7 service",
  tone: "friendly",
  pageType: "landing" as const,
};

beforeEach(() => {
  generateStructuredMock.mockReset();
  requireUserMock.mockReset();
  requireUserMock.mockResolvedValue({ id: "user-1", email: "owner@example.com" });
  getActiveSiteForCurrentUserMock.mockReset().mockResolvedValue(null);
});

describe("generatePageDraftAction", () => {
  it("builds a prompt from the brief and sanitizes the returned slug", async () => {
    generateStructuredMock.mockResolvedValue({
      data: VALID_DRAFT,
      usage: { inputTokens: 10, outputTokens: 20 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    const result = await generatePageDraftAction(BRIEF);

    expect("draft" in result).toBe(true);
    if ("draft" in result) {
      expect(result.draft.slug).toBe("local-plumbing-services");
    }

    const [callType, prompt] = generateStructuredMock.mock.calls[0];
    expect(callType).toBe("page-generation");
    expect(prompt).toContain(BRIEF.title);

    const [, , , options] = generateStructuredMock.mock.calls[0];
    expect(options).toEqual({ context: { userId: "user-1" } });
  });

  it("threads the active site's brand voice into the prompt when one is set", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue({ brandVoice: "Warm and plain-spoken." });
    generateStructuredMock.mockResolvedValue({
      data: VALID_DRAFT,
      usage: { inputTokens: 10, outputTokens: 20 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    await generatePageDraftAction(BRIEF);

    const [, prompt] = generateStructuredMock.mock.calls[0];
    expect(prompt).toContain("Warm and plain-spoken.");
  });

  it("attributes the AI call's cost log to the active site (SPEC.md §20 — this was missing before today)", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue({ id: "site-1", brandVoice: null });
    generateStructuredMock.mockResolvedValue({
      data: VALID_DRAFT,
      usage: { inputTokens: 10, outputTokens: 20 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    await generatePageDraftAction(BRIEF);

    const [, , , options] = generateStructuredMock.mock.calls[0];
    expect(options).toEqual({ context: { userId: "user-1", siteId: "site-1" } });
  });

  it("omits the brand voice line when no site is connected", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue(null);
    generateStructuredMock.mockResolvedValue({
      data: VALID_DRAFT,
      usage: { inputTokens: 10, outputTokens: 20 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    await generatePageDraftAction(BRIEF);

    const [, prompt] = generateStructuredMock.mock.calls[0];
    expect(prompt).not.toContain("Brand voice");
  });

  it("returns an error instead of throwing when the provider call fails", async () => {
    generateStructuredMock.mockRejectedValue(new Error("Groq is down"));

    const result = await generatePageDraftAction(BRIEF);

    expect(result).toEqual({ error: "Groq is down" });
  });

  it("returns an error when the provider's response fails schema validation even after aiClient's own retries", async () => {
    // Schema validation + retry now live inside aiClient.generateStructured
    // itself (SPEC.md's Day 31 task) — this mock stands in for what it does
    // once every retry is exhausted: throw AiValidationError, never resolve
    // with the still-malformed data. The action's own job is just to turn
    // that into a clean user-facing error, which is what this test checks.
    const { AiValidationError } = await import("@/lib/ai");
    generateStructuredMock.mockRejectedValue(
      new AiValidationError("page-generation", "groq", [
        { code: "invalid_type", path: ["contentBlocks", 0, "type"], message: "Invalid type" } as never,
      ]),
    );

    const result = await generatePageDraftAction(BRIEF);

    expect("error" in result).toBe(true);
  });
});
