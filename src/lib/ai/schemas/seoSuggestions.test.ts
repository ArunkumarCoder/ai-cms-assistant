import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderMock = vi.fn();
vi.mock("../providers/registry", () => ({ getProvider: getProviderMock }));
vi.mock("../logging", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

const { aiClient } = await import("../client");
const { seoSuggestionsJsonSchema, seoSuggestionsSchema } =
  await import("./seoSuggestions");

function mockStructuredProvider(data: unknown) {
  const generateStructured = vi.fn().mockResolvedValue({
    data,
    usage: { inputTokens: 200, outputTokens: 80 },
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  });
  getProviderMock.mockReturnValue({ name: "groq", generateStructured });
  return generateStructured;
}

beforeEach(() => {
  getProviderMock.mockReset();
});

describe("seoSuggestionsSchema", () => {
  it("validates a well-formed seo-scoring response returned through generateStructured", async () => {
    const validAudit = {
      score: 78,
      breakdown: {
        keywordUsage: 70,
        metaTags: 90,
        readability: 82,
        headingStructure: 75,
        internalLinking: 60,
      },
      suggestions: [
        { category: "meta-tags", message: "Meta description is too short." },
      ],
      suggestedMetaTitle: "Austin Plumbers | 24/7 Emergency Repair",
      suggestedMetaDescription:
        "Licensed Austin plumbers for leaks, clogs, and installs.",
      keywordGaps: ["emergency plumber austin", "24 hour plumber"],
    };
    mockStructuredProvider(validAudit);

    const result = await aiClient.generateStructured(
      "seo-scoring",
      "Score this page.",
      seoSuggestionsJsonSchema,
    );

    expect(seoSuggestionsSchema.safeParse(result.data).success).toBe(true);
  });

  it("rejects a malformed response (score out of range, non-array suggestions) instead of passing it through silently", async () => {
    const malformed = {
      score: 150,
      breakdown: {
        keywordUsage: 70,
        metaTags: 90,
        readability: 82,
        headingStructure: 75,
        internalLinking: 60,
      },
      suggestions: "shorten the meta description",
      suggestedMetaTitle: null,
      suggestedMetaDescription: null,
      keywordGaps: [],
    };
    mockStructuredProvider(malformed);

    const result = await aiClient.generateStructured(
      "seo-scoring",
      "Score this page.",
      seoSuggestionsJsonSchema,
    );

    expect(seoSuggestionsSchema.safeParse(result.data).success).toBe(false);
  });
});
