import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderMock = vi.fn();
vi.mock("../providers/registry", () => ({ getProvider: getProviderMock }));
vi.mock("../logging", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

const { aiClient } = await import("../client");
const { qualityScoreJsonSchema, qualityScoreSchema } =
  await import("./qualityScore");

function mockStructuredProvider(data: unknown) {
  const generateStructured = vi.fn().mockResolvedValue({
    data,
    usage: { inputTokens: 250, outputTokens: 60 },
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  });
  getProviderMock.mockReturnValue({ name: "groq", generateStructured });
  return generateStructured;
}

beforeEach(() => {
  getProviderMock.mockReset();
});

describe("qualityScoreSchema", () => {
  it("validates a well-formed content-quality response returned through generateStructured", async () => {
    const validScore = {
      score: 84,
      subScores: {
        seo: { score: 80, reason: "Target keyword appears in the H1." },
        readability: {
          score: 88,
          reason: "Short sentences, mostly active voice.",
        },
        structure: {
          score: 84,
          reason: "Clear heading hierarchy with one CTA.",
        },
      },
    };
    mockStructuredProvider(validScore);

    const result = await aiClient.generateStructured(
      "content-quality",
      "Score this draft before publish.",
      qualityScoreJsonSchema,
    );

    expect(qualityScoreSchema.safeParse(result.data).success).toBe(true);
  });

  it("rejects a malformed response (sub-score missing its reason) instead of passing it through silently", async () => {
    const malformed = {
      score: 84,
      subScores: {
        seo: { score: 80 },
        readability: { score: 88, reason: "Short sentences." },
        structure: { score: 84, reason: "Clear heading hierarchy." },
      },
    };
    mockStructuredProvider(malformed);

    const result = await aiClient.generateStructured(
      "content-quality",
      "Score this draft before publish.",
      qualityScoreJsonSchema,
    );

    expect(qualityScoreSchema.safeParse(result.data).success).toBe(false);
  });
});
