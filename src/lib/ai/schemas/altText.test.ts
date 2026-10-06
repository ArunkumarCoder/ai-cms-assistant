import { describe, expect, it } from "vitest";
import { altTextSchema } from "./altText";

// Pure schema tests — see pageDraft.test.ts's top comment for why these
// don't go through aiClient.
const validAltText = {
  altText: "A licensed plumber repairing a leaking pipe under a sink.",
  confidence: "high",
  needsReview: false,
};

describe("altTextSchema", () => {
  it("accepts a well-formed response", () => {
    expect(altTextSchema.safeParse(validAltText).success).toBe(true);
  });

  it("accepts (and ignores) an extra, unexpected field", () => {
    expect(altTextSchema.safeParse({ ...validAltText, source: "vision-model" }).success).toBe(true);
  });

  it("rejects a missing required field (needsReview)", () => {
    const { needsReview, ...rest } = validAltText;
    void needsReview;
    expect(altTextSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a confidence value outside the enum", () => {
    expect(altTextSchema.safeParse({ ...validAltText, confidence: "very high" }).success).toBe(
      false,
    );
  });

  it("rejects a wrong type (needsReview as a string instead of a boolean)", () => {
    expect(altTextSchema.safeParse({ ...validAltText, needsReview: "false" }).success).toBe(false);
  });

  it("rejects an empty altText", () => {
    expect(altTextSchema.safeParse({ ...validAltText, altText: "" }).success).toBe(false);
  });

  it("rejects a response that is valid JSON but an entirely different shape", () => {
    expect(altTextSchema.safeParse({ description: validAltText.altText }).success).toBe(false);
    expect(altTextSchema.safeParse(validAltText.altText).success).toBe(false);
  });
});
