import { describe, expect, it } from "vitest";
import { qualityScoreSchema } from "./qualityScore";

// Pure schema tests — see pageDraft.test.ts's top comment for why these
// don't go through aiClient. (qualityScoreSchema has no live AI caller today
// — src/lib/quality/score.ts computes this shape deterministically instead,
// SPEC.md §10 — but the schema stays tested on its own merits in case a real
// "content-quality" call is ever wired up.)
const validScore = {
  score: 84,
  subScores: {
    seo: { score: 80, reason: "Target keyword appears in the H1." },
    readability: { score: 88, reason: "Short sentences, mostly active voice." },
    structure: { score: 84, reason: "Clear heading hierarchy with one CTA." },
  },
};

describe("qualityScoreSchema", () => {
  it("accepts a well-formed response", () => {
    expect(qualityScoreSchema.safeParse(validScore).success).toBe(true);
  });

  it("accepts (and ignores) an extra, unexpected field on a sub-score", () => {
    expect(
      qualityScoreSchema.safeParse({
        ...validScore,
        subScores: { ...validScore.subScores, seo: { ...validScore.subScores.seo, weight: 0.4 } },
      }).success,
    ).toBe(true);
  });

  it("rejects a missing required field (a sub-score's reason)", () => {
    expect(
      qualityScoreSchema.safeParse({
        ...validScore,
        subScores: { ...validScore.subScores, seo: { score: 80 } },
      }).success,
    ).toBe(false);
  });

  it("rejects a score out of the 0-100 range", () => {
    expect(qualityScoreSchema.safeParse({ ...validScore, score: 150 }).success).toBe(false);
  });

  it("rejects a wrong type (subScores as a number instead of an object)", () => {
    expect(qualityScoreSchema.safeParse({ ...validScore, subScores: 84 }).success).toBe(false);
  });

  it("rejects an empty reason", () => {
    expect(
      qualityScoreSchema.safeParse({
        ...validScore,
        subScores: { ...validScore.subScores, seo: { score: 80, reason: "" } },
      }).success,
    ).toBe(false);
  });

  it("rejects a response that is valid JSON but an entirely different shape", () => {
    expect(qualityScoreSchema.safeParse({ overallScore: 84 }).success).toBe(false);
    expect(qualityScoreSchema.safeParse(84).success).toBe(false);
  });
});
