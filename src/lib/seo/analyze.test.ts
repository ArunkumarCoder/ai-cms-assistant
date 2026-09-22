import { describe, expect, it } from "vitest";
import { analyzeSeoContent } from "./analyze";
import type { ContentBlock } from "@/types";
import type { SeoAnalysisInput } from "./types";

function block(overrides: Partial<ContentBlock>): ContentBlock {
  return {
    id: overrides.id ?? "block-1",
    type: overrides.type ?? "paragraph",
    order: overrides.order ?? 0,
    content: overrides.content ?? "",
    metadata: overrides.metadata,
  };
}

describe("analyzeSeoContent", () => {
  it("returns one result per check, plus an overall 0-100 score", () => {
    const input: SeoAnalysisInput = {
      title: "Affordable Web Design Services for Small Businesses",
      metaDescription:
        "We help small businesses build fast, modern websites that convert visitors into customers, backed by ongoing SEO support.",
      targetKeyword: "web design",
      contentBlocks: [
        block({ id: "h1", type: "heading", order: 0, content: "Web Design That Grows Your Business", metadata: { level: 2 } }),
        block({
          id: "p1",
          type: "paragraph",
          order: 1,
          content:
            "Our web design team builds fast sites. We keep it simple. Your customers will love the result, and so will you.",
        }),
      ],
    };

    const analysis = analyzeSeoContent(input);
    expect(analysis.checks).toHaveLength(5);
    expect(analysis.score).toBeGreaterThanOrEqual(0);
    expect(analysis.score).toBeLessThanOrEqual(100);

    const byId = Object.fromEntries(analysis.checks.map((c) => [c.id, c]));
    expect(byId.titleLength.status).toBe("pass");
    expect(byId.metaDescriptionLength.status).toBe("pass");
    expect(byId.headingHierarchy.status).toBe("pass");
    expect(byId.keywordDensity.status).not.toBe("not-applicable");
  });

  it("scores a mostly-empty page low, with concrete failing reasons per check", () => {
    const input: SeoAnalysisInput = {
      title: "",
      metaDescription: "",
      targetKeyword: undefined,
      contentBlocks: [],
    };

    const analysis = analyzeSeoContent(input);
    const byId = Object.fromEntries(analysis.checks.map((c) => [c.id, c]));

    expect(byId.titleLength.status).toBe("fail");
    expect(byId.metaDescriptionLength.status).toBe("fail");
    expect(byId.headingHierarchy.status).toBe("fail");
    expect(byId.readability.status).toBe("fail");
    // No target keyword set -> excluded from scoring, not counted as a failure.
    expect(byId.keywordDensity.status).toBe("not-applicable");

    expect(analysis.score).toBeLessThan(40);
  });

  it("excludes not-applicable checks (no target keyword) from the overall score", () => {
    const withKeyword = analyzeSeoContent({
      title: "Affordable Web Design Services for Small Businesses",
      metaDescription:
        "We help small businesses build fast, modern websites that convert visitors into customers, backed by ongoing SEO support.",
      targetKeyword: "nonexistent phrase that never appears",
      contentBlocks: [],
    });
    const withoutKeyword = analyzeSeoContent({
      title: "Affordable Web Design Services for Small Businesses",
      metaDescription:
        "We help small businesses build fast, modern websites that convert visitors into customers, backed by ongoing SEO support.",
      targetKeyword: undefined,
      contentBlocks: [],
    });

    // A missing keyword fails that check and drags the average down; leaving
    // the keyword unset entirely takes it out of the average altogether.
    expect(withoutKeyword.score).toBeGreaterThan(withKeyword.score);
  });
});
