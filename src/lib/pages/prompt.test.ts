import { describe, expect, it } from "vitest";
import {
  buildBlockRegenerationPrompt,
  buildPageGenerationPrompt,
  buildSeoSuggestionsPrompt,
} from "./prompt";
import type { PageBrief, SeoSuggestionsPromptInput } from "./prompt";

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

  it("includes the site's brand voice when set", () => {
    const prompt = buildPageGenerationPrompt({
      ...brief,
      brandVoice: "Friendly and conversational, avoid jargon.",
    });
    expect(prompt).toContain("Brand voice / style guide to follow:");
    expect(prompt).toContain("Friendly and conversational, avoid jargon.");
  });

  it("omits the brand voice line when the site has none set", () => {
    const prompt = buildPageGenerationPrompt({ ...brief, brandVoice: undefined });
    expect(prompt).not.toContain("Brand voice");
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

  it("includes the site's brand voice when set", () => {
    const prompt = buildBlockRegenerationPrompt({
      pageTitle: "Local Plumbing Services",
      metaDescription: "",
      targetKeyword: null,
      pageType: "landing",
      brandVoice: "Warm, plain-spoken, no corporate jargon.",
      targetBlock: { type: "heading", content: "Welcome", level: 2 },
    });
    expect(prompt).toContain("Brand voice / style guide to follow:");
    expect(prompt).toContain("Warm, plain-spoken, no corporate jargon.");
  });

  it("omits the brand voice line when the site has none set", () => {
    const prompt = buildBlockRegenerationPrompt({
      pageTitle: "Local Plumbing Services",
      metaDescription: "",
      targetKeyword: null,
      pageType: "landing",
      targetBlock: { type: "heading", content: "Welcome", level: 2 },
    });
    expect(prompt).not.toContain("Brand voice");
  });
});

describe("buildSeoSuggestionsPrompt", () => {
  const input: SeoSuggestionsPromptInput = {
    title: "Local Plumbing Services in Austin",
    metaDescription: "Fast, licensed plumbing repair across Austin, TX.",
    targetKeyword: "plumber austin",
    pageType: "landing",
    contentBlocks: [
      { id: "1", type: "heading", order: 0, content: "Austin's Trusted Plumbers", metadata: { level: 2 } },
      { id: "2", type: "paragraph", order: 1, content: "We fix leaks, clogs, and installs, same day." },
    ],
  };

  it("includes the title, meta description, keyword, and page type", () => {
    const prompt = buildSeoSuggestionsPrompt(input);
    expect(prompt).toContain(input.title);
    expect(prompt).toContain(input.metaDescription);
    expect(prompt).toContain(input.targetKeyword as string);
    expect(prompt).toContain("landing");
  });

  it("includes the heading outline and body text extracted from content blocks", () => {
    const prompt = buildSeoSuggestionsPrompt(input);
    expect(prompt).toContain("H2: Austin's Trusted Plumbers");
    expect(prompt).toContain("We fix leaks, clogs, and installs, same day.");
  });

  it("flags a missing target keyword explicitly rather than omitting it", () => {
    const prompt = buildSeoSuggestionsPrompt({ ...input, targetKeyword: undefined });
    expect(prompt).toContain("No target keyword is set");
  });

  it("flags empty headings and body content explicitly", () => {
    const prompt = buildSeoSuggestionsPrompt({ ...input, contentBlocks: [] });
    expect(prompt).toContain("no heading blocks yet");
    expect(prompt).toContain("no body paragraphs yet");
  });

  it("includes the site's brand voice when set", () => {
    const prompt = buildSeoSuggestionsPrompt({
      ...input,
      brandVoice: "Warm and plain-spoken.",
    });
    expect(prompt).toContain("Brand voice / style guide to follow:");
    expect(prompt).toContain("Warm and plain-spoken.");
  });

  it("omits the brand voice line when the site has none set", () => {
    const prompt = buildSeoSuggestionsPrompt(input);
    expect(prompt).not.toContain("Brand voice");
  });

  it("instructs the model to return a neutral internalLinking score", () => {
    const prompt = buildSeoSuggestionsPrompt(input);
    expect(prompt).toContain("always return exactly 50 (neutral) for internalLinking");
  });
});
