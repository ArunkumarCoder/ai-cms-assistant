import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderMock = vi.fn();
vi.mock("../providers/registry", () => ({ getProvider: getProviderMock }));
vi.mock("../logging", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

const { aiClient } = await import("../client");
const { altTextJsonSchema, altTextSchema } = await import("./altText");

function mockStructuredProvider(data: unknown) {
  const generateWithVision = vi.fn().mockResolvedValue({
    data,
    usage: { inputTokens: 300, outputTokens: 40 },
    provider: "openai",
    model: "gpt-4o-mini",
  });
  getProviderMock.mockReturnValue({ name: "openai", generateWithVision });
  return generateWithVision;
}

beforeEach(() => {
  getProviderMock.mockReset();
});

describe("altTextSchema", () => {
  it("validates a well-formed alt-text-single response returned through generateWithVision", async () => {
    const validAltText = {
      altText: "A licensed plumber repairing a leaking pipe under a sink.",
      confidence: "high",
      needsReview: false,
    };
    const generateWithVision = mockStructuredProvider(validAltText);

    const result = await aiClient.generateWithVision(
      "alt-text-single",
      "Describe this image for accessibility.",
      "https://example.com/plumber.jpg",
      altTextJsonSchema,
    );

    expect(generateWithVision).toHaveBeenCalledWith(
      "Describe this image for accessibility.",
      "https://example.com/plumber.jpg",
      altTextJsonSchema,
      undefined,
    );
    expect(altTextSchema.safeParse(result.data).success).toBe(true);
  });

  it("rejects a malformed response (confidence outside the enum) instead of passing it through silently", async () => {
    const malformed = {
      altText: "A person working on a pipe.",
      confidence: "very high",
      needsReview: false,
    };
    mockStructuredProvider(malformed);

    const result = await aiClient.generateWithVision(
      "alt-text-single",
      "Describe this image for accessibility.",
      "https://example.com/plumber.jpg",
      altTextJsonSchema,
    );

    expect(altTextSchema.safeParse(result.data).success).toBe(false);
  });
});
