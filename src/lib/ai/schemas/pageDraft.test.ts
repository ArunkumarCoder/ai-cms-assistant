import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderMock = vi.fn();
vi.mock("../providers/registry", () => ({ getProvider: getProviderMock }));
vi.mock("../logging", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

const { aiClient } = await import("../client");
const { pageDraftJsonSchema, pageDraftSchema } = await import("./pageDraft");

function mockStructuredProvider(data: unknown) {
  const generateStructured = vi.fn().mockResolvedValue({
    data,
    usage: { inputTokens: 40, outputTokens: 120 },
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  });
  getProviderMock.mockReturnValue({ name: "groq", generateStructured });
  return generateStructured;
}

beforeEach(() => {
  getProviderMock.mockReset();
});

describe("pageDraftSchema", () => {
  it("validates a well-formed page-generation response returned through generateStructured", async () => {
    const validDraft = {
      title: "Local Plumbing Services in Austin",
      slug: "local-plumbing-services-austin",
      metaDescription: "Fast, licensed plumbing repair across Austin, TX.",
      targetKeyword: "plumber austin",
      contentBlocks: [
        { type: "heading", content: "Austin's Trusted Plumbers", level: 2 },
        {
          type: "paragraph",
          content: "We fix leaks, clogs, and installs, same day.",
        },
        {
          type: "cta",
          content: "Book a repair",
          href: "/contact",
          openInNewTab: false,
        },
      ],
    };
    const generateStructured = mockStructuredProvider(validDraft);

    const result = await aiClient.generateStructured(
      "page-generation",
      "Write a page about Austin plumbing.",
      pageDraftJsonSchema,
    );

    expect(generateStructured).toHaveBeenCalledWith(
      "Write a page about Austin plumbing.",
      pageDraftJsonSchema,
      undefined,
    );
    expect(pageDraftSchema.safeParse(result.data).success).toBe(true);
  });

  it("rejects a malformed response (unknown block type, missing metaDescription) instead of passing it through silently", async () => {
    const malformed = {
      title: "Local Plumbing Services in Austin",
      slug: "local-plumbing-services-austin",
      targetKeyword: null,
      contentBlocks: [{ type: "video", content: "not a real block type" }],
    };
    mockStructuredProvider(malformed);

    const result = await aiClient.generateStructured(
      "page-generation",
      "Write a page about Austin plumbing.",
      pageDraftJsonSchema,
    );

    expect(pageDraftSchema.safeParse(result.data).success).toBe(false);
  });
});
