import { describe, expect, it } from "vitest";
import { computeArrayDiff, computeValueDiff } from "./computeDiff";

interface Item {
  id: string;
  text: string;
}

const getId = (item: Item) => item.id;

describe("computeArrayDiff", () => {
  it("marks an item present in both with equal content as unchanged", () => {
    const before = [{ id: "a", text: "Hello" }];
    const after = [{ id: "a", text: "Hello" }];
    expect(computeArrayDiff(before, after, getId)).toEqual([
      { id: "a", status: "unchanged", before: before[0], after: after[0] },
    ]);
  });

  it("marks an item present in both with different content as changed", () => {
    const before = [{ id: "a", text: "Hello" }];
    const after = [{ id: "a", text: "Hi" }];
    expect(computeArrayDiff(before, after, getId)).toEqual([
      { id: "a", status: "changed", before: before[0], after: after[0] },
    ]);
  });

  it("marks an item only in `before` as removed", () => {
    const before = [{ id: "a", text: "Hello" }];
    const result = computeArrayDiff(before, [], getId);
    expect(result).toEqual([{ id: "a", status: "removed", before: before[0], after: null }]);
  });

  it("marks an item only in `after` as added", () => {
    const after = [{ id: "a", text: "Hello" }];
    const result = computeArrayDiff([], after, getId);
    expect(result).toEqual([{ id: "a", status: "added", before: null, after: after[0] }]);
  });

  it("handles a realistic mixed diff: one changed, one removed, one added, one untouched", () => {
    const before = [
      { id: "1", text: "Heading" },
      { id: "2", text: "Old paragraph" },
      { id: "3", text: "CTA" },
    ];
    const after = [
      { id: "1", text: "Heading" },
      { id: "2", text: "New paragraph" },
      { id: "4", text: "New block" },
    ];

    const result = computeArrayDiff(before, after, getId);

    expect(result.map((e) => ({ id: e.id, status: e.status }))).toEqual([
      { id: "1", status: "unchanged" },
      { id: "2", status: "changed" },
      { id: "3", status: "removed" },
      { id: "4", status: "added" },
    ]);
  });

  it("preserves before's order and appends new ids at the position they first appear in after", () => {
    const before = [
      { id: "1", text: "A" },
      { id: "2", text: "B" },
    ];
    const after = [
      { id: "1", text: "A" },
      { id: "3", text: "C" },
      { id: "2", text: "B" },
    ];
    const result = computeArrayDiff(before, after, getId);
    expect(result.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });

  it("accepts a custom equality function instead of the default JSON.stringify comparison", () => {
    const before = [{ id: "a", text: "Hello", ignoredField: 1 }];
    const after = [{ id: "a", text: "Hello", ignoredField: 2 }];
    const result = computeArrayDiff(before, after, getId, (a, b) => a.text === b.text);
    expect(result[0].status).toBe("unchanged");
  });
});

describe("computeValueDiff", () => {
  it("returns 'unchanged' for equal values", () => {
    expect(computeValueDiff("title", "Hello", "Hello")).toEqual({
      id: "title",
      status: "unchanged",
      before: "Hello",
      after: "Hello",
    });
  });

  it("returns 'changed' for different values", () => {
    expect(computeValueDiff("title", "Hello", "Hi")).toEqual({
      id: "title",
      status: "changed",
      before: "Hello",
      after: "Hi",
    });
  });

  it("accepts a custom equality function", () => {
    const result = computeValueDiff("title", "  Hello  ", "Hello", (a, b) => a.trim() === b.trim());
    expect(result.status).toBe("unchanged");
  });
});
