import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderMock = vi.fn();
vi.mock("../providers/registry", () => ({ getProvider: getProviderMock }));
vi.mock("../logging", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

const { aiClient } = await import("../client");
const { blockRegenerationJsonSchema, blockRegenerationSchema } = await import(
  "./blockRegeneration"
);

function mockStructuredProvider(data: unknown) {
  const generateStructured = vi.fn().mockResolvedValue({
    data,
    usage: { inputTokens: 30, outputTokens: 60 },
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  });
  getProviderMock.mockReturnValue({ name: "groq", generateStructured });
  return generateStructured;
}

beforeEach(() => {
  getProviderMock.mockReset();
});

describe("blockRegenerationSchema", () => {
  it("validates a well-formed block-regeneration response", async () => {
    const valid = {
      block: { type: "paragraph", content: "We fix leaks, clogs, and installs." },
    };
    mockStructuredProvider(valid);

    const result = await aiClient.generateStructured(
      "block-regeneration",
      "Rewrite this paragraph.",
      blockRegenerationJsonSchema,
    );

    expect(blockRegenerationSchema.safeParse(result.data).success).toBe(true);
  });

  it("rejects a response whose block isn't one of the known variants", async () => {
    const malformed = { block: { type: "video", content: "not a real block type" } };
    mockStructuredProvider(malformed);

    const result = await aiClient.generateStructured(
      "block-regeneration",
      "Rewrite this block.",
      blockRegenerationJsonSchema,
    );

    expect(blockRegenerationSchema.safeParse(result.data).success).toBe(false);
  });

  it("does not itself reject a type swap between two otherwise-valid block variants", () => {
    // Documents the limitation called out in blockRegeneration.ts's top
    // comment: schema validation only confirms "some valid block," not "the
    // same kind of block the caller asked to regenerate." The type-match
    // check lives in regenerateBlockAction.ts, not here.
    const swapped = { block: { type: "cta", content: "Book now", href: "/x", openInNewTab: false } };
    expect(blockRegenerationSchema.safeParse(swapped).success).toBe(true);
  });
});
