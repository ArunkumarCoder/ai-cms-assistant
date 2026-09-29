import { describe, expect, it } from "vitest";
import { summarizeContentChange, summarizeFaqChange, type ContentSnapshot } from "./auditSummary";
import type { ContentBlock, FaqItem } from "@/types";

function block(overrides: Partial<ContentBlock>): ContentBlock {
  return {
    id: overrides.id ?? "b1",
    type: overrides.type ?? "paragraph",
    order: overrides.order ?? 0,
    content: overrides.content ?? "",
    metadata: overrides.metadata,
  };
}

function snapshot(overrides: Partial<ContentSnapshot> = {}): ContentSnapshot {
  return {
    title: "My Page",
    metaDescription: "A page.",
    targetKeyword: "widgets",
    contentBlocks: [block({ id: "b1", content: "Hello." })],
    ...overrides,
  };
}

describe("summarizeContentChange", () => {
  it("returns null when nothing changed", () => {
    const snap = snapshot();
    expect(summarizeContentChange(snap, snapshot())).toBeNull();
  });

  it("reports which top-level fields changed", () => {
    const before = snapshot();
    const after = snapshot({ title: "New Title", metaDescription: "New description." });
    expect(summarizeContentChange(before, after)).toBe("title, meta description changed");
  });

  it("reports block-level changes, additions, and removals together", () => {
    const before = snapshot({
      contentBlocks: [block({ id: "b1", content: "Old." }), block({ id: "b2", content: "Keep me." })],
    });
    const after = snapshot({
      contentBlocks: [block({ id: "b1", content: "New." }), block({ id: "b3", content: "Added." })],
    });
    const summary = summarizeContentChange(before, after);
    expect(summary).toContain("1 block changed");
    expect(summary).toContain("1 block added");
    expect(summary).toContain("1 block removed");
  });

  it("treats an unset target keyword changing to a set one as a change", () => {
    const before = snapshot({ targetKeyword: undefined });
    const after = snapshot({ targetKeyword: "widgets" });
    expect(summarizeContentChange(before, after)).toBe("target keyword changed");
  });
});

describe("summarizeFaqChange", () => {
  function faq(overrides: Partial<FaqItem> = {}): FaqItem {
    return {
      id: overrides.id ?? "f1",
      pageId: "page-1",
      question: overrides.question ?? "Q?",
      answer: overrides.answer ?? "A.",
      order: overrides.order ?? 0,
      source: overrides.source ?? "manual",
    };
  }

  it("returns null when the FAQ list is unchanged", () => {
    const list = [faq()];
    expect(summarizeFaqChange(list, [...list])).toBeNull();
  });

  it("reports added, edited, and removed FAQs together", () => {
    const before = [faq({ id: "f1", question: "Old Q?" }), faq({ id: "f2" })];
    const after = [faq({ id: "f1", question: "New Q?" }), faq({ id: "f3" })];
    const summary = summarizeFaqChange(before, after);
    expect(summary).toContain("1 FAQ added");
    expect(summary).toContain("1 FAQ edited");
    expect(summary).toContain("1 FAQ removed");
  });
});
