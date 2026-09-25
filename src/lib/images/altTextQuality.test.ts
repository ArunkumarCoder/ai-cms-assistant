import { describe, expect, it } from "vitest";
import { assessAltText } from "./altTextQuality";

const URL = "https://cdn.sanity.io/images/proj/production/a1b2c3-1200x800.jpg";

describe("assessAltText", () => {
  it("flags an image whose status is missing, regardless of altText", () => {
    expect(assessAltText({ altText: null, altTextStatus: "missing", url: URL })).toEqual({
      flagged: true,
      reason: "Missing alt text.",
    });
  });

  it("flags empty/whitespace-only alt text even if the status isn't missing", () => {
    expect(assessAltText({ altText: "   ", altTextStatus: "reviewed", url: URL }).flagged).toBe(true);
  });

  it("flags very short alt text", () => {
    const result = assessAltText({ altText: "pic", altTextStatus: "ai-generated", url: URL });
    expect(result.flagged).toBe(true);
    expect(result.reason).toMatch(/very short/i);
  });

  it("flags generic placeholder words", () => {
    for (const word of ["image", "Photo", "PICTURE", "screenshot", "untitled"]) {
      const result = assessAltText({ altText: word, altTextStatus: "reviewed", url: URL });
      expect(result.flagged, `expected "${word}" to be flagged`).toBe(true);
      expect(result.reason).toMatch(/generic/i);
    }
  });

  it("flags alt text that just repeats the filename", () => {
    const result = assessAltText({
      altText: "a1b2c3 1200x800",
      altTextStatus: "reviewed",
      url: URL,
    });
    expect(result.flagged).toBe(true);
    expect(result.reason).toMatch(/filename/i);
  });

  it("does not flag a real, descriptive alt text", () => {
    const result = assessAltText({
      altText: "A customer support agent smiling while on a headset call",
      altTextStatus: "reviewed",
      url: URL,
    });
    expect(result).toEqual({ flagged: false, reason: null });
  });

  it("does not flag descriptive text just because a generic word appears inside it", () => {
    const result = assessAltText({
      altText: "Product photo of the blue widget on a white background",
      altTextStatus: "ai-generated",
      url: URL,
    });
    expect(result.flagged).toBe(false);
  });
});
