import { describe, expect, it } from "vitest";
import { seoSuggestionsSchema } from "./seoSuggestions";

// Pure schema tests — see pageDraft.test.ts's top comment for why these
// don't go through aiClient; that retry/rejection behavior lives in
// client.test.ts instead.
const validAudit = {
  score: 78,
  breakdown: {
    keywordUsage: 70,
    metaTags: 90,
    readability: 82,
    headingStructure: 75,
    internalLinking: 60,
  },
  suggestions: [{ category: "meta-tags", message: "Meta description is too short." }],
  suggestedMetaTitle: "Austin Plumbers | 24/7 Emergency Repair",
  suggestedMetaDescription: "Licensed Austin plumbers for leaks, clogs, and installs.",
  keywordGaps: ["emergency plumber austin", "24 hour plumber"],
};

describe("seoSuggestionsSchema", () => {
  it("accepts a well-formed audit", () => {
    expect(seoSuggestionsSchema.safeParse(validAudit).success).toBe(true);
  });

  it("accepts null suggestedMetaTitle/suggestedMetaDescription and an empty keywordGaps array", () => {
    expect(
      seoSuggestionsSchema.safeParse({
        ...validAudit,
        suggestedMetaTitle: null,
        suggestedMetaDescription: null,
        keywordGaps: [],
      }).success,
    ).toBe(true);
  });

  it("accepts (and ignores) an extra, unexpected top-level field", () => {
    expect(seoSuggestionsSchema.safeParse({ ...validAudit, confidence: "high" }).success).toBe(true);
  });

  it("rejects a missing required field (breakdown)", () => {
    const { breakdown, ...rest } = validAudit;
    void breakdown;
    expect(seoSuggestionsSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a score out of the 0-100 range", () => {
    expect(seoSuggestionsSchema.safeParse({ ...validAudit, score: 150 }).success).toBe(false);
  });

  it("rejects a wrong type (suggestions as a string instead of an array)", () => {
    expect(
      seoSuggestionsSchema.safeParse({ ...validAudit, suggestions: "shorten the meta description" })
        .success,
    ).toBe(false);
  });

  it("rejects an empty suggestion message", () => {
    expect(
      seoSuggestionsSchema.safeParse({
        ...validAudit,
        suggestions: [{ category: "meta-tags", message: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty-string suggestedMetaTitle (must be a real title or null, not a blank stand-in)", () => {
    expect(seoSuggestionsSchema.safeParse({ ...validAudit, suggestedMetaTitle: "" }).success).toBe(
      false,
    );
  });

  it("rejects a response that is valid JSON but an entirely different shape", () => {
    expect(seoSuggestionsSchema.safeParse({ audits: [validAudit] }).success).toBe(false);
    expect(seoSuggestionsSchema.safeParse([validAudit]).success).toBe(false);
  });
});
