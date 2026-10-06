import { describe, expect, it } from "vitest";
import { blockRegenerationSchema } from "./blockRegeneration";

// Pure schema tests — see pageDraft.test.ts's top comment for why these
// don't go through aiClient.
describe("blockRegenerationSchema", () => {
  it("accepts a well-formed response", () => {
    const valid = {
      block: { type: "paragraph", content: "We fix leaks, clogs, and installs." },
    };
    expect(blockRegenerationSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts (and ignores) an extra, unexpected field", () => {
    const valid = {
      block: { type: "paragraph", content: "We fix leaks, clogs, and installs." },
      confidence: "high",
    };
    expect(blockRegenerationSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing required field (block)", () => {
    expect(blockRegenerationSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a response whose block isn't one of the known variants", () => {
    const malformed = { block: { type: "video", content: "not a real block type" } };
    expect(blockRegenerationSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects a wrong type (block as a string instead of an object)", () => {
    expect(blockRegenerationSchema.safeParse({ block: "We fix leaks." }).success).toBe(false);
  });

  it("rejects an empty content string inside the block", () => {
    expect(
      blockRegenerationSchema.safeParse({ block: { type: "paragraph", content: "" } }).success,
    ).toBe(false);
  });

  it("rejects a response that is valid JSON but an entirely different shape", () => {
    expect(
      blockRegenerationSchema.safeParse({ type: "paragraph", content: "We fix leaks." }).success,
    ).toBe(false);
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
