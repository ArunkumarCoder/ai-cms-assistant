import { describe, expect, it } from "vitest";
import { computeQualityScore } from "@/lib/quality/score";
import { analyzeSeoContent } from "@/lib/seo";
import { DEMO_PAGES, type DemoBlockDefinition } from "./demoContent";

// These assertions exist so the demo's own deliberate variety (task item 1)
// can't silently drift as the content gets edited later — if someone trims
// a page down and it accidentally stops scoring badly, this fails instead of
// the demo quietly losing the exact contrast it exists to show off.
function toContentBlocks(blocks: DemoBlockDefinition[]) {
  return blocks.map((block, order) => {
    const metadata: Record<string, unknown> = {};
    if (block.type === "heading") metadata.level = block.level;
    if (block.type === "paragraph" && block.style) metadata.style = block.style;
    if (block.type === "cta") metadata.href = block.href;
    if (block.type === "image") metadata.assetId = "0"; // placeholder for scoring only
    return {
      id: `${block.type}-${order}`,
      type: block.type,
      order,
      content: block.type === "image" ? (block.altText ?? "") : block.content,
      metadata,
    };
  });
}

describe("DEMO_PAGES", () => {
  it("has between 8 and 12 pages", () => {
    expect(DEMO_PAGES.length).toBeGreaterThanOrEqual(8);
    expect(DEMO_PAGES.length).toBeLessThanOrEqual(12);
  });

  it("every slug is unique and prefixed demo- (never collides with real content)", () => {
    const slugs = DEMO_PAGES.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug.startsWith("demo-")).toBe(true);
    }
  });

  it("covers every page status at least once", () => {
    const statuses = new Set(DEMO_PAGES.map((page) => page.status));
    expect(statuses).toEqual(
      new Set(["draft", "in-review", "approved", "published"]),
    );
  });

  it("has at least 2 images with deliberately missing alt text", () => {
    const missingAltCount = DEMO_PAGES.flatMap((page) => page.blocks)
      .filter((block) => block.type === "image")
      .filter((block) => block.altText === null).length;
    expect(missingAltCount).toBeGreaterThanOrEqual(2);
  });

  it("has at least 1-2 pages with no FAQs", () => {
    const noFaqCount = DEMO_PAGES.filter(
      (page) => !page.faqs || page.faqs.length === 0,
    ).length;
    expect(noFaqCount).toBeGreaterThanOrEqual(1);
  });

  it("has 2-3 pages that score well (>=80) and 3-4 with real SEO problems (<70) via the real scoring function", () => {
    const scores = DEMO_PAGES.map((page) => {
      const quality = computeQualityScore({
        title: page.title,
        metaDescription: page.metaDescription,
        targetKeyword: page.targetKeyword,
        contentBlocks: toContentBlocks(page.blocks),
        faqItems: (page.faqs ?? []).map((faq, i) => ({
          id: `faq-${i}`,
          pageId: "p",
          question: faq.question,
          answer: faq.answer,
          order: i,
          source: "manual" as const,
        })),
      });
      return { slug: page.slug, score: quality.score };
    });

    const goodPages = scores.filter((s) => s.score >= 80);
    const problemPages = scores.filter((s) => s.score < 70);

    expect(goodPages.length).toBeGreaterThanOrEqual(2);
    expect(goodPages.length).toBeLessThanOrEqual(3);
    expect(problemPages.length).toBeGreaterThanOrEqual(3);
  });

  it("flags the sourcing-story page's heading skip via the real SEO checker", () => {
    const page = DEMO_PAGES.find((p) => p.slug === "demo-sourcing-story")!;
    const analysis = analyzeSeoContent({
      title: page.title,
      metaDescription: page.metaDescription,
      targetKeyword: page.targetKeyword,
      contentBlocks: toContentBlocks(page.blocks),
    });
    const headingCheck = analysis.checks.find(
      (c) => c.id === "headingHierarchy",
    );
    expect(headingCheck?.status).toBe("fail");
    expect(headingCheck?.reason).toContain("skipping a level");
  });

  it("flags the wholesale page's missing meta description and target keyword", () => {
    const page = DEMO_PAGES.find((p) => p.slug === "demo-wholesale")!;
    expect(page.metaDescription).toBe("");
    expect(page.targetKeyword).toBeUndefined();
  });
});
