import { describe, expect, it } from "vitest";
import { buildBlockRegenerationPrompt, buildPageGenerationPrompt } from "./prompt";
import type { PageBrief } from "./prompt";

describe("buildPageGenerationPrompt", () => {
  const brief: PageBrief = {
    title: "Local Plumbing Services",
    targetKeyword: "plumber austin",
    audience: "homeowners in Austin",
    keyPoints: "24/7 emergency service\nLicensed and insured",
    tone: "friendly",
    pageType: "landing",
  };

  it("includes every brief field", () => {
    const prompt = buildPageGenerationPrompt(brief);
    expect(prompt).toContain(brief.title);
    expect(prompt).toContain(brief.targetKeyword);
    expect(prompt).toContain(brief.audience);
    expect(prompt).toContain(brief.tone);
    expect(prompt).toContain(brief.keyPoints);
    expect(prompt).toContain("landing");
  });

  it("omits empty optional fields rather than leaving blank lines", () => {
    const prompt = buildPageGenerationPrompt({ ...brief, audience: "", tone: "" });
    expect(prompt).not.toContain("Target audience:");
    expect(prompt).not.toContain("Tone:");
  });
});

describe("buildBlockRegenerationPrompt", () => {
  it("includes the target block, both neighbor summaries, and a keep-the-type instruction", () => {
    const prompt = buildBlockRegenerationPrompt({
      pageTitle: "Local Plumbing Services",
      metaDescription: "Fast, licensed plumbing repair.",
      targetKeyword: "plumber austin",
      pageType: "landing",
      audience: "homeowners",
      tone: "friendly",
      precedingBlockSummary: "Austin's Trusted Plumbers",
      followingBlockSummary: "Book a repair",
      targetBlock: { type: "paragraph", content: "We fix leaks and clogs." },
    });

    expect(prompt).toContain("We fix leaks and clogs.");
    expect(prompt).toContain("Austin's Trusted Plumbers");
    expect(prompt).toContain("Book a repair");
    expect(prompt).toContain('Keep it a "paragraph" block');
  });

  it("omits neighbor lines when there is no preceding/following block", () => {
    const prompt = buildBlockRegenerationPrompt({
      pageTitle: "Local Plumbing Services",
      metaDescription: "",
      targetKeyword: null,
      pageType: "landing",
      targetBlock: { type: "heading", content: "Welcome", level: 2 },
    });

    expect(prompt).not.toContain("right before");
    expect(prompt).not.toContain("right after");
  });
});
