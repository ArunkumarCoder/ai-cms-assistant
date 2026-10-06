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

const { generateFaqListAction } = await import("./generateFaqListAction");

const VALID_FAQ_ITEMS = [
  { question: "Do you offer 24/7 emergency service?", answer: "Yes, our licensed plumbers are on call around the clock." },
  { question: "What areas do you serve?", answer: "We serve the greater Austin metro area." },
  { question: "Are you licensed and insured?", answer: "Yes, fully licensed and insured in Texas." },
];

const LONG_BODY_CONTENT_BLOCKS = [
  {
    id: "1",
    type: "paragraph" as const,
    order: 0,
    content:
      "Our licensed plumbers handle everything from leaky faucets to full repipes across the Austin " +
      "metro area. We offer same-day emergency service, upfront pricing, and a full workmanship " +
      "warranty on every job. Whether it is a burst pipe at midnight or a routine water heater " +
      "install, our team shows up on time and leaves the job site clean.",
  },
];

const INPUT = {
  title: "Local Plumbing Services",
  pageType: "landing" as const,
  contentBlocks: LONG_BODY_CONTENT_BLOCKS,
};

beforeEach(() => {
  generateStructuredMock.mockReset();
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1", email: "owner@example.com" });
  getActiveSiteForCurrentUserMock.mockReset().mockResolvedValue(null);
});

describe("generateFaqListAction", () => {
  it("calls generateStructured with the faq-generation call type and a prompt built from the input", async () => {
    generateStructuredMock.mockResolvedValue({
      data: { faqItems: VALID_FAQ_ITEMS },
      usage: { inputTokens: 200, outputTokens: 150 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    const result = await generateFaqListAction(INPUT);

    expect("faqItems" in result).toBe(true);
    if ("faqItems" in result) {
      expect(result.faqItems).toEqual(VALID_FAQ_ITEMS);
    }

    const [callType, prompt, , options] = generateStructuredMock.mock.calls[0];
    expect(callType).toBe("faq-generation");
    expect(prompt).toContain(INPUT.title);
    expect(options).toEqual({ context: { userId: "user-1", siteId: undefined } });
  });

  it("threads the active site's brand voice into the prompt when one is set", async () => {
    getActiveSiteForCurrentUserMock.mockResolvedValue({ id: "site-1", brandVoice: "Warm and plain-spoken." });
    generateStructuredMock.mockResolvedValue({
      data: { faqItems: VALID_FAQ_ITEMS },
      usage: { inputTokens: 200, outputTokens: 150 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    await generateFaqListAction(INPUT);

    const [, prompt, , options] = generateStructuredMock.mock.calls[0];
    expect(prompt).toContain("Warm and plain-spoken.");
    expect(options).toEqual({ context: { userId: "user-1", siteId: "site-1" } });
  });

  it("refuses to call the AI when the page has too little body content", async () => {
    const result = await generateFaqListAction({
      title: "New Page",
      pageType: "other",
      contentBlocks: [{ id: "1", type: "paragraph", order: 0, content: "Coming soon." }],
    });

    expect(generateStructuredMock).not.toHaveBeenCalled();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/enough body content/i);
    }
  });

  it("returns an error instead of throwing when the provider call fails", async () => {
    generateStructuredMock.mockRejectedValue(new Error("Groq is down"));

    const result = await generateFaqListAction(INPUT);

    expect(result).toEqual({ error: "Groq is down" });
  });

  it("returns an error when the provider's response fails schema validation even after aiClient's own retries", async () => {
    // Schema validation + retry now live inside aiClient.generateStructured
    // itself (SPEC.md's Day 31 task) — this mock stands in for what it does
    // once every retry is exhausted: throw AiValidationError, never resolve
    // with a too-short faqItems array.
    const { AiValidationError } = await import("@/lib/ai");
    generateStructuredMock.mockRejectedValue(
      new AiValidationError("faq-generation", "groq", [
        { code: "too_small", path: ["faqItems"], message: "Too few items" } as never,
      ]),
    );

    const result = await generateFaqListAction(INPUT);

    expect("error" in result).toBe(true);
  });
});
