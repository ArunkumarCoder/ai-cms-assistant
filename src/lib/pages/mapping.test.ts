import { describe, expect, it } from "vitest";
import { draftBlockToContentBlock } from "./mapping";

describe("draftBlockToContentBlock", () => {
  it("maps a heading block, carrying level into metadata", () => {
    const result = draftBlockToContentBlock(
      { type: "heading", content: "Welcome", level: 3 },
      "block-1",
      0,
    );
    expect(result).toEqual({
      id: "block-1",
      type: "heading",
      order: 0,
      content: "Welcome",
      metadata: { level: 3 },
    });
  });

  it("maps a paragraph block with no metadata", () => {
    const result = draftBlockToContentBlock(
      { type: "paragraph", content: "We fix leaks." },
      "block-2",
      1,
    );
    expect(result).toEqual({
      id: "block-2",
      type: "paragraph",
      order: 1,
      content: "We fix leaks.",
    });
  });

  it("maps a cta block, carrying href/openInNewTab into metadata", () => {
    const result = draftBlockToContentBlock(
      { type: "cta", content: "Book now", href: "/contact", openInNewTab: true },
      "block-3",
      2,
    );
    expect(result).toEqual({
      id: "block-3",
      type: "cta",
      order: 2,
      content: "Book now",
      metadata: { href: "/contact", openInNewTab: true },
    });
  });

  it("passes id/order through unchanged regardless of block content", () => {
    const result = draftBlockToContentBlock(
      { type: "paragraph", content: "x" },
      "keep-this-id",
      7,
    );
    expect(result.id).toBe("keep-this-id");
    expect(result.order).toBe(7);
  });
});
