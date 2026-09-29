import { describe, expect, it } from "vitest";
import {
  attentionReasonsFor,
  averageSubScores,
  buildAttentionQueue,
  summarizeSiteHealth,
  type PageHealthInput,
} from "./health";

function page(overrides: Partial<PageHealthInput> = {}): PageHealthInput {
  return {
    id: overrides.id ?? "page-1",
    slug: overrides.slug ?? "page-1",
    title: overrides.title ?? "A Page",
    status: overrides.status ?? "draft",
    // `??` would treat an explicitly-passed `null` the same as "not passed
    // at all" and fall back to 90 — `in` is what actually distinguishes them.
    qualityScore: "qualityScore" in overrides ? (overrides.qualityScore as number | null) : 90,
    faqCount: overrides.faqCount ?? 0,
    flaggedImageCount: overrides.flaggedImageCount ?? 0,
  };
}

describe("summarizeSiteHealth", () => {
  it("handles a zero-page Site gracefully — no NaN, no divide-by-zero", () => {
    const summary = summarizeSiteHealth([], 0, 0);
    expect(summary).toEqual({
      totalPages: 0,
      averageQualityScore: null,
      statusCounts: { draft: 0, "in-review": 0, approved: 0, published: 0 },
      totalImages: 0,
      flaggedImages: 0,
      pagesWithFaqs: 0,
    });
  });

  it("averages quality score only over pages that have one", () => {
    const summary = summarizeSiteHealth(
      [page({ qualityScore: 80 }), page({ qualityScore: 60 }), page({ qualityScore: null })],
      0,
      0,
    );
    expect(summary.averageQualityScore).toBe(70);
    expect(summary.totalPages).toBe(3);
  });

  it("returns null average when every page is unscored", () => {
    const summary = summarizeSiteHealth([page({ qualityScore: null })], 0, 0);
    expect(summary.averageQualityScore).toBeNull();
  });

  it("counts pages per status", () => {
    const summary = summarizeSiteHealth(
      [page({ status: "draft" }), page({ status: "draft" }), page({ status: "published" })],
      0,
      0,
    );
    expect(summary.statusCounts).toEqual({ draft: 2, "in-review": 0, approved: 0, published: 1 });
  });

  it("counts pages with at least one FAQ", () => {
    const summary = summarizeSiteHealth([page({ faqCount: 3 }), page({ faqCount: 0 })], 0, 0);
    expect(summary.pagesWithFaqs).toBe(1);
  });

  it("passes through the total/flagged image counts unchanged", () => {
    const summary = summarizeSiteHealth([], 12, 4);
    expect(summary.totalImages).toBe(12);
    expect(summary.flaggedImages).toBe(4);
  });
});

describe("averageSubScores", () => {
  it("returns null for an empty Site rather than NaN", () => {
    expect(averageSubScores([])).toBeNull();
  });

  it("averages each dimension independently", () => {
    const result = averageSubScores([
      { seo: 80, readability: 60, structure: 90 },
      { seo: 60, readability: 80, structure: 70 },
    ]);
    expect(result).toEqual({ seo: 70, readability: 70, structure: 80 });
  });
});

describe("attentionReasonsFor", () => {
  it("flags an unscored page", () => {
    const reasons = attentionReasonsFor(page({ qualityScore: null }));
    expect(reasons).toEqual([{ type: "unscored", label: "Not yet scored" }]);
  });

  it("flags a page below the good-score threshold, but not one at or above it", () => {
    expect(attentionReasonsFor(page({ qualityScore: 79 })).some((r) => r.type === "low-score")).toBe(true);
    expect(attentionReasonsFor(page({ qualityScore: 80 })).some((r) => r.type === "low-score")).toBe(false);
  });

  it("flags a page stuck in-review or approved", () => {
    expect(attentionReasonsFor(page({ status: "in-review", qualityScore: 90 })).map((r) => r.type)).toEqual([
      "in-review",
    ]);
    expect(attentionReasonsFor(page({ status: "approved", qualityScore: 90 })).map((r) => r.type)).toEqual([
      "approved",
    ]);
  });

  it("flags a page with images still needing alt text", () => {
    const reasons = attentionReasonsFor(page({ qualityScore: 90, flaggedImageCount: 2 }));
    expect(reasons).toEqual([{ type: "flagged-images", label: "2 images need alt text" }]);
  });

  it("returns multiple reasons together when more than one applies", () => {
    const reasons = attentionReasonsFor(
      page({ qualityScore: 40, status: "in-review", flaggedImageCount: 1 }),
    );
    expect(reasons.map((r) => r.type)).toEqual(["low-score", "in-review", "flagged-images"]);
  });

  it("returns no reasons for a healthy, published, fully-scored page with no flagged images", () => {
    expect(attentionReasonsFor(page({ qualityScore: 95, status: "published" }))).toEqual([]);
  });
});

describe("buildAttentionQueue", () => {
  it("includes only pages with at least one reason", () => {
    const queue = buildAttentionQueue([
      page({ id: "healthy", qualityScore: 95, status: "published" }),
      page({ id: "needs-work", qualityScore: 40 }),
    ]);
    expect(queue.map((item) => item.id)).toEqual(["needs-work"]);
    expect(queue[0].reasons.length).toBeGreaterThan(0);
  });

  it("returns an empty queue for a Site with no problems, not an error", () => {
    expect(buildAttentionQueue([page({ qualityScore: 95, status: "published" })])).toEqual([]);
  });
});
