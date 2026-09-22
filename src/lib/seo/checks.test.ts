import { describe, expect, it } from "vitest";
import {
  checkHeadingHierarchy,
  checkKeywordDensity,
  checkMetaDescriptionLength,
  checkReadability,
  checkTitleLength,
} from "./checks";
import type { ContentBlock } from "@/types";

function block(overrides: Partial<ContentBlock>): ContentBlock {
  return {
    id: overrides.id ?? "block-1",
    type: overrides.type ?? "paragraph",
    order: overrides.order ?? 0,
    content: overrides.content ?? "",
    metadata: overrides.metadata,
  };
}

describe("checkTitleLength", () => {
  it("fails an empty title", () => {
    expect(checkTitleLength("").status).toBe("fail");
  });

  it("passes a title within the ideal 30-60 character range", () => {
    const title = "Affordable Web Design Services for Small Businesses"; // 52 chars
    expect(checkTitleLength(title).status).toBe("pass");
  });

  it("warns on a title outside the ideal range but not extreme", () => {
    expect(checkTitleLength("Local Web Design Co").status).toBe("warn"); // 19 chars
  });

  it("fails a title that's far too short", () => {
    expect(checkTitleLength("SEO").status).toBe("fail");
  });

  it("fails a title that's far too long", () => {
    const longTitle =
      "This Is An Extremely Long Page Title That Goes On And On Well Past What Any Search Engine Would Ever Display In Results";
    expect(checkTitleLength(longTitle).status).toBe("fail");
  });
});

describe("checkMetaDescriptionLength", () => {
  it("fails an empty meta description", () => {
    expect(checkMetaDescriptionLength("").status).toBe("fail");
  });

  it("passes a meta description within the ideal 120-160 character range", () => {
    const meta =
      "We help small businesses build fast, modern websites that convert visitors into customers, backed by ongoing SEO support."; // ~140 chars
    expect(checkMetaDescriptionLength(meta).status).toBe("pass");
  });

  it("warns on a meta description that's a bit short", () => {
    const meta = "We help small businesses build modern, fast websites that convert visitors into customers."; // 92 chars
    expect(checkMetaDescriptionLength(meta).status).toBe("warn");
  });
});

describe("checkHeadingHierarchy", () => {
  it("passes a single implicit H1 (title) with properly nested sub-headings", () => {
    const blocks: ContentBlock[] = [
      block({ id: "a", type: "heading", order: 0, content: "Services", metadata: { level: 2 } }),
      block({ id: "b", type: "heading", order: 1, content: "Web Design", metadata: { level: 3 } }),
    ];
    expect(checkHeadingHierarchy(blocks, "Our Services").status).toBe("pass");
  });

  it("fails when the page has no title at all", () => {
    expect(checkHeadingHierarchy([], "").status).toBe("fail");
  });

  it("fails when a heading skips a level (h2 straight to h4)", () => {
    const blocks: ContentBlock[] = [
      block({ id: "a", type: "heading", order: 0, content: "Services", metadata: { level: 2 } }),
      block({ id: "b", type: "heading", order: 1, content: "Deep detail", metadata: { level: 4 } }),
    ];
    expect(checkHeadingHierarchy(blocks, "Our Services").status).toBe("fail");
  });

  it("warns (not fails) on an extra content block marked as H1", () => {
    const blocks: ContentBlock[] = [
      block({ id: "a", type: "heading", order: 0, content: "Duplicate H1", metadata: { level: 1 } }),
    ];
    expect(checkHeadingHierarchy(blocks, "Our Services").status).toBe("warn");
  });

  it("passes a page with a title and no sub-headings yet", () => {
    expect(checkHeadingHierarchy([], "Our Services").status).toBe("pass");
  });
});

describe("checkKeywordDensity", () => {
  it("is not-applicable when no target keyword is set", () => {
    expect(checkKeywordDensity(undefined, "some body text here").status).toBe("not-applicable");
  });

  it("fails when the keyword never appears in the text", () => {
    expect(checkKeywordDensity("web design", "This page is about something else entirely.").status).toBe("fail");
  });

  it("passes when the keyword appears at a healthy density", () => {
    // 304 total words, "web design" (2 words) appears once ->
    // (1*2)/304*100 ≈ 0.66%, inside the 0.5-2.5% healthy range.
    const filler = Array(150).fill("filler").join(" ");
    const text = `Our ${filler} web design ${filler} services.`;
    expect(checkKeywordDensity("web design", text).status).toBe("pass");
  });

  it("fails when the keyword is stuffed in repeatedly", () => {
    const text = Array(20).fill("web design").join(" ");
    expect(checkKeywordDensity("web design", text).status).toBe("fail");
  });
});

describe("checkReadability", () => {
  it("fails when there is no body text", () => {
    expect(checkReadability("").status).toBe("fail");
  });

  it("passes short, simple sentences", () => {
    const text = "We build fast sites. We keep it simple. You will love the result.";
    expect(checkReadability(text).status).toBe("pass");
  });

  it("fails a wall of long, complex sentences", () => {
    const text =
      "The extraordinarily convoluted methodology necessitated comprehensive interdisciplinary collaboration among unaffiliated practitioners regardless of organizational classification, thereby precipitating unprecedented administrative complexity throughout the entire multinational organizational infrastructure.";
    expect(checkReadability(text).status).toBe("fail");
  });
});
