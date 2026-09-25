import { describe, expect, it } from "vitest";
import { buildAltTextPrompt } from "./prompt";

describe("buildAltTextPrompt", () => {
  it("includes the page title when provided", () => {
    const prompt = buildAltTextPrompt({ pageTitle: "Affordable Web Design Services" });
    expect(prompt).toContain('"Affordable Web Design Services"');
  });

  it("omits the page-title line when none is given", () => {
    const prompt = buildAltTextPrompt();
    expect(prompt).not.toContain("used on a page titled");
  });

  it("always asks for a confidence level and a review flag", () => {
    const prompt = buildAltTextPrompt();
    expect(prompt).toMatch(/confidence/i);
    expect(prompt).toMatch(/needsReview/);
  });
});
