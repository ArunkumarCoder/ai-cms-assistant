import { describe, expect, it } from "vitest";
import { pageDraftSchema } from "./pageDraft";

// Pure schema tests — no aiClient/provider involved. Whether a malformed
// response actually gets retried/rejected when it comes back from a real
// provider call is client.ts's own job and is tested in client.test.ts;
// this file only answers "does this schema accept what it should and reject
// what it shouldn't."
const validDraft = {
  title: "Local Plumbing Services in Austin",
  slug: "local-plumbing-services-austin",
  metaDescription: "Fast, licensed plumbing repair across Austin, TX.",
  targetKeyword: "plumber austin",
  contentBlocks: [
    { type: "heading", content: "Austin's Trusted Plumbers", level: 2 },
    { type: "paragraph", content: "We fix leaks, clogs, and installs, same day." },
    { type: "cta", content: "Book a repair", href: "/contact", openInNewTab: false },
  ],
};

describe("pageDraftSchema", () => {
  it("accepts a well-formed draft", () => {
    expect(pageDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("accepts a null targetKeyword (the model's own way of saying 'no suggestion')", () => {
    expect(pageDraftSchema.safeParse({ ...validDraft, targetKeyword: null }).success).toBe(true);
  });

  it("accepts (and ignores) an extra, unexpected top-level field", () => {
    expect(pageDraftSchema.safeParse({ ...validDraft, confidence: "high" }).success).toBe(true);
  });

  it("rejects a missing required field (metaDescription)", () => {
    const { metaDescription, ...rest } = validDraft;
    void metaDescription;
    expect(pageDraftSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a wrong type (contentBlocks as a string instead of an array)", () => {
    expect(
      pageDraftSchema.safeParse({ ...validDraft, contentBlocks: "a heading and some text" }).success,
    ).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(pageDraftSchema.safeParse({ ...validDraft, title: "" }).success).toBe(false);
  });

  it("rejects an empty string inside a content block", () => {
    expect(
      pageDraftSchema.safeParse({
        ...validDraft,
        contentBlocks: [{ type: "paragraph", content: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a block whose type isn't one of the known variants", () => {
    expect(
      pageDraftSchema.safeParse({
        ...validDraft,
        contentBlocks: [{ type: "video", content: "not a real block type" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a response that is valid JSON but an entirely different shape", () => {
    expect(pageDraftSchema.safeParse({ pages: [validDraft] }).success).toBe(false);
    expect(pageDraftSchema.safeParse([validDraft]).success).toBe(false);
    expect(pageDraftSchema.safeParse("just a string").success).toBe(false);
  });
});
