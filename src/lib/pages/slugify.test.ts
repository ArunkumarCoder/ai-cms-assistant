import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("passes an already-valid slug through unchanged", () => {
    expect(slugify("local-plumbing-austin")).toBe("local-plumbing-austin");
  });

  it("lowercases and collapses whitespace/punctuation into single hyphens", () => {
    expect(slugify("Austin's  Best Plumbers!!")).toBe("austin-s-best-plumbers");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  -Best Plumbers- ")).toBe("best-plumbers");
  });

  it("falls back to a default when nothing alphanumeric survives", () => {
    expect(slugify("🚀🚀🚀")).toBe("page");
    expect(slugify("")).toBe("page");
  });
});
