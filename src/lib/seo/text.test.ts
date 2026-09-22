import { describe, expect, it } from "vitest";
import {
  countSentences,
  countSyllables,
  extractHeadingBlocks,
  extractParagraphText,
  extractWords,
  fleschReadingEase,
} from "./text";
import type { ContentBlock } from "@/types";

describe("countSyllables", () => {
  it.each([
    ["cat", 1],
    ["happy", 2],
    ["reading", 2],
    ["simple", 2],
    ["table", 2],
    ["like", 1],
  ])("counts %s as %i syllable(s)", (word, expected) => {
    expect(countSyllables(word)).toBe(expected);
  });

  it("returns 0 for a string with no letters", () => {
    expect(countSyllables("123")).toBe(0);
  });
});

describe("countSentences", () => {
  it("counts sentences split on . ! ?", () => {
    expect(countSentences("One. Two! Three?")).toBe(3);
  });

  it("returns 0 for empty or punctuation-only text", () => {
    expect(countSentences("")).toBe(0);
    expect(countSentences("...")).toBe(0);
  });
});

describe("extractWords", () => {
  it("extracts alphabetic words, dropping punctuation and numbers", () => {
    expect(extractWords("Hello, world! It's 2026.")).toEqual(["Hello", "world", "It's"]);
  });
});

describe("fleschReadingEase", () => {
  it("scores a short, simple sentence as easy to read", () => {
    // 6 words, 1 sentence, 6 syllables (every word here is <=3 letters and
    // counts as 1 syllable) — a fixed, hand-computable regression case.
    const score = fleschReadingEase("The cat sat on the mat.");
    expect(score).toBe(116.1);
  });

  it("scores a long sentence full of multi-syllable words as hard to read", () => {
    const score = fleschReadingEase(
      "The extraordinarily convoluted methodology necessitated comprehensive interdisciplinary collaboration among unaffiliated practitioners regardless of organizational classification.",
    );
    expect(score).not.toBeNull();
    expect(score as number).toBeLessThan(30);
  });

  it("returns null when there is no analyzable text", () => {
    expect(fleschReadingEase("")).toBeNull();
    expect(fleschReadingEase("...")).toBeNull();
  });
});

function block(overrides: Partial<ContentBlock>): ContentBlock {
  return {
    id: overrides.id ?? "block-1",
    type: overrides.type ?? "paragraph",
    order: overrides.order ?? 0,
    content: overrides.content ?? "",
    metadata: overrides.metadata,
  };
}

describe("extractHeadingBlocks", () => {
  it("returns heading blocks sorted by order, defaulting an unset level to h2", () => {
    const blocks: ContentBlock[] = [
      block({ id: "b", type: "heading", order: 1, content: "Second", metadata: { level: 3 } }),
      block({ id: "a", type: "heading", order: 0, content: "First" }),
      block({ id: "c", type: "paragraph", order: 2, content: "Not a heading" }),
    ];
    expect(extractHeadingBlocks(blocks)).toEqual([
      { level: 2, text: "First" },
      { level: 3, text: "Second" },
    ]);
  });
});

describe("extractParagraphText", () => {
  it("joins only paragraph blocks, sorted by order, space-separated", () => {
    const blocks: ContentBlock[] = [
      block({ id: "b", type: "paragraph", order: 1, content: "Second sentence." }),
      block({ id: "h", type: "heading", order: 0, content: "A heading" }),
      block({ id: "a", type: "paragraph", order: 0, content: "First sentence." }),
    ];
    expect(extractParagraphText(blocks)).toBe("First sentence. Second sentence.");
  });
});
