import { describe, expect, it } from "vitest";
import { computeQualityScore, type QualityScoreInput } from "./score";
import { qualityScoreSchema } from "@/lib/ai/schemas/qualityScore";
import type { ContentBlock, FaqItem } from "@/types";

function block(overrides: Partial<ContentBlock>): ContentBlock {
  return {
    id: overrides.id ?? "block-1",
    type: overrides.type ?? "paragraph",
    order: overrides.order ?? 0,
    content: overrides.content ?? "",
    metadata: overrides.metadata,
  };
}

function faq(overrides: Partial<FaqItem> = {}): FaqItem {
  return {
    id: overrides.id ?? "faq-1",
    pageId: overrides.pageId ?? "page-1",
    question: overrides.question ?? "What is this?",
    answer: overrides.answer ?? "A good page.",
    order: overrides.order ?? 0,
    source: overrides.source ?? "manual",
  };
}

// Long enough, and with "web design" appearing just once in the title, that
// keyword density lands in the healthy 0.5-2.5% range rather than reading as
// stuffing — an earlier version of this fixture repeated the phrase in both
// the title and heading over a short body and ended up correctly penalized.
const GOOD_PARAGRAPH =
  "Our team builds fast, modern websites for small business owners. We start with a short call to learn " +
  "your goals. Then we handle the content, the layout, and the testing. You get clear updates at every " +
  "step, in plain language. The final site loads quickly on any device and looks great everywhere. Most " +
  "clients see more inquiries within the first month. We stick around after launch to help with small " +
  "updates. We also help with seasonal promotions and other requests that come up.";

function goodInput(overrides: Partial<QualityScoreInput> = {}): QualityScoreInput {
  return {
    title: "Affordable Web Design Services for Small Businesses",
    metaDescription:
      "We help small businesses build fast, modern websites that convert visitors into customers, backed by ongoing SEO support.",
    targetKeyword: "web design",
    contentBlocks: [
      block({ id: "h1", type: "heading", order: 0, content: "Grow Your Business With Us", metadata: { level: 2 } }),
      block({ id: "p1", type: "paragraph", order: 1, content: GOOD_PARAGRAPH }),
    ],
    faqItems: [faq()],
    ...overrides,
  };
}

describe("computeQualityScore", () => {
  it("produces output that validates against the Day 10 quality-score schema", () => {
    const quality = computeQualityScore(goodInput());
    expect(qualityScoreSchema.safeParse(quality).success).toBe(true);
  });

  it("scores a well-formed page with FAQs high across every sub-score", () => {
    const quality = computeQualityScore(goodInput());

    expect(quality.score).toBeGreaterThanOrEqual(70);
    expect(quality.subScores.seo.score).toBeGreaterThanOrEqual(70);
    expect(quality.subScores.readability.score).toBeGreaterThanOrEqual(60);
    expect(quality.subScores.structure.score).toBeGreaterThanOrEqual(70);
  });

  it("scores a completely empty page low across every sub-score", () => {
    const quality = computeQualityScore({
      title: "",
      metaDescription: "",
      targetKeyword: undefined,
      contentBlocks: [],
      faqItems: [],
    });

    expect(quality.score).toBeLessThan(40);
    expect(quality.subScores.readability.score).toBe(0);
    expect(quality.subScores.readability.reason).toMatch(/no body paragraphs/i);
  });

  it("excludes an unset target keyword from the seo sub-score rather than penalizing it", () => {
    const withMissingKeyword = computeQualityScore(
      goodInput({ targetKeyword: "a phrase that never appears anywhere" }),
    );
    const withNoKeywordSet = computeQualityScore(goodInput({ targetKeyword: undefined }));

    expect(withNoKeywordSet.subScores.seo.score).toBeGreaterThan(withMissingKeyword.subScores.seo.score);
  });

  it("rewards FAQ presence in the structure sub-score without treating absence as a hard failure", () => {
    const withFaqs = computeQualityScore(goodInput({ faqItems: [faq()] }));
    const withoutFaqs = computeQualityScore(goodInput({ faqItems: [] }));

    expect(withFaqs.subScores.structure.score).toBeGreaterThan(withoutFaqs.subScores.structure.score);
    expect(withoutFaqs.subScores.structure.score).toBeGreaterThan(40);
  });

  it("penalizes missing alt text on image blocks in the structure sub-score", () => {
    const withAlt = computeQualityScore(
      goodInput({
        contentBlocks: [
          ...goodInput().contentBlocks,
          block({ id: "img1", type: "image", order: 2, content: "A finished website mockup", metadata: { altTextStatus: "reviewed" } }),
        ],
      }),
    );
    const missingAlt = computeQualityScore(
      goodInput({
        contentBlocks: [
          ...goodInput().contentBlocks,
          block({ id: "img1", type: "image", order: 2, content: "", metadata: { altTextStatus: "missing" } }),
        ],
      }),
    );

    expect(withAlt.subScores.structure.score).toBeGreaterThan(missingAlt.subScores.structure.score);
  });

  it("does not penalize a page with no images at all for alt text", () => {
    const noImages = computeQualityScore(goodInput());
    const missingAlt = computeQualityScore(
      goodInput({
        contentBlocks: [
          ...goodInput().contentBlocks,
          block({ id: "img1", type: "image", order: 2, content: "", metadata: { altTextStatus: "missing" } }),
        ],
      }),
    );

    expect(noImages.subScores.structure.score).toBeGreaterThan(missingAlt.subScores.structure.score);
  });

  it("tells a clearly good page and a clearly bad page apart", () => {
    const good = computeQualityScore(goodInput());
    const bad = computeQualityScore({
      title: "x",
      metaDescription: "",
      targetKeyword: "web design",
      contentBlocks: [
        block({ id: "h1", type: "heading", order: 0, content: "stuff", metadata: { level: 4 } }),
      ],
      faqItems: [],
    });

    expect(good.score).toBeGreaterThan(bad.score + 30);
  });
});
