import { describe, expect, it, vi } from "vitest";
import type * as z from "zod";

// Mocked before importing AnthropicProvider, which imports fetchImageAsBase64
// from here — Anthropic's vision path fetches the image itself (unlike
// OpenAI, which just embeds the URL); this test cares about schema parity,
// not about exercising a real network fetch.
const fetchImageAsBase64Mock = vi.fn().mockResolvedValue({ base64: "ZmFrZQ==", mediaType: "image/jpeg" });
vi.mock("./images", () => ({ fetchImageAsBase64: (...args: unknown[]) => fetchImageAsBase64Mock(...args) }));

const { OpenAiProvider } = await import("./providers/openaiProvider");
const { GroqProvider } = await import("./providers/groqProvider");
const { AnthropicProvider } = await import("./providers/anthropicProvider");
const { pageDraftSchema } = await import("./schemas/pageDraft");
const { seoSuggestionsSchema } = await import("./schemas/seoSuggestions");
const { faqListSchema } = await import("./schemas/faqList");
const { qualityScoreSchema } = await import("./schemas/qualityScore");
const { altTextSchema } = await import("./schemas/altText");

// The test described in SPEC.md's Day 31 task as "a good line for the case
// study": the SAME logical data, returned in each provider's own native wire
// format — OpenAI/Groq hand back a JSON *string* buried in a chat
// completion's message content; Anthropic hands back an already-parsed
// object inside a forced tool-use block — ends up as the exact same
// validated, schema-correct shape regardless of which provider answered.
// This is what "provider-neutral" actually means in this codebase: a feature
// built against one schema works unchanged no matter which of the three
// providers routing.ts sends it to.

function openAiStyleClient(data: unknown) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify(data) } }],
          usage: { prompt_tokens: 42, completion_tokens: 17 },
        }),
      },
    },
  };
}

function anthropicStyleClient(data: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "tool_use", name: "structured_output", input: data }],
        usage: { input_tokens: 42, output_tokens: 17 },
      }),
    },
  };
}

type StructuredCase = {
  name: string;
  schema: z.ZodType;
  data: Record<string, unknown>;
  providers: Array<"openai" | "groq" | "anthropic">;
};

const cases: StructuredCase[] = [
  {
    name: "page draft (page-generation)",
    schema: pageDraftSchema,
    data: {
      title: "Local Plumbing Services in Austin",
      slug: "local-plumbing-services-austin",
      metaDescription: "Fast, licensed plumbing repair across Austin, TX.",
      targetKeyword: "plumber austin",
      contentBlocks: [
        { type: "heading", content: "Austin's Trusted Plumbers", level: 2 },
        { type: "paragraph", content: "We fix leaks, clogs, and installs, same day." },
        { type: "cta", content: "Book a repair", href: "/contact", openInNewTab: false },
      ],
    },
    providers: ["openai", "groq", "anthropic"],
  },
  {
    name: "SEO suggestions (seo-scoring)",
    schema: seoSuggestionsSchema,
    data: {
      score: 78,
      breakdown: {
        keywordUsage: 70,
        metaTags: 90,
        readability: 82,
        headingStructure: 75,
        internalLinking: 60,
      },
      suggestions: [{ category: "meta-tags", message: "Meta description is too short." }],
      suggestedMetaTitle: "Austin Plumbers | 24/7 Emergency Repair",
      suggestedMetaDescription: "Licensed Austin plumbers for leaks, clogs, and installs.",
      keywordGaps: ["emergency plumber austin"],
    },
    providers: ["openai", "groq", "anthropic"],
  },
  {
    name: "FAQ list (faq-generation)",
    schema: faqListSchema,
    data: {
      faqItems: [
        { question: "Do you offer emergency repairs?", answer: "Yes, 24/7 across Austin." },
        { question: "How much does an inspection cost?", answer: "Inspections start at $89." },
        { question: "Are your plumbers licensed?", answer: "Every plumber is licensed and insured." },
      ],
    },
    providers: ["openai", "groq", "anthropic"],
  },
  {
    name: "quality score (content-quality)",
    schema: qualityScoreSchema,
    data: {
      score: 84,
      subScores: {
        seo: { score: 80, reason: "Target keyword appears in the H1." },
        readability: { score: 88, reason: "Short sentences, mostly active voice." },
        structure: { score: 84, reason: "Clear heading hierarchy with one CTA." },
      },
    },
    providers: ["openai", "groq", "anthropic"],
  },
];

describe("provider parity: generateStructured", () => {
  for (const { name, schema, data, providers } of cases) {
    describe(name, () => {
      for (const providerName of providers) {
        it(`normalizes ${providerName}'s own response format to the same validated shape`, async () => {
          const jsonSchema = { type: "object" };
          const provider =
            providerName === "openai"
              ? new OpenAiProvider(openAiStyleClient(data))
              : providerName === "groq"
                ? new GroqProvider(openAiStyleClient(data))
                : new AnthropicProvider(anthropicStyleClient(data));

          const result = await provider.generateStructured("Generate this.", jsonSchema);

          const parsed = schema.safeParse(result.data);
          expect(parsed.success).toBe(true);
          if (parsed.success) {
            expect(parsed.data).toEqual(data);
          }
          expect(result.provider).toBe(providerName);
          expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 17 });
        });
      }
    });
  }
});

describe("provider parity: generateWithVision (alt text) — openai and anthropic only, groq has no vision support", () => {
  const altText = {
    altText: "A licensed plumber repairing a leaking pipe under a sink.",
    confidence: "high" as const,
    needsReview: false,
  };
  const imageUrl = "https://example.com/plumber.jpg";
  const jsonSchema = { type: "object" };

  it("openai normalizes to the validated shape", async () => {
    const provider = new OpenAiProvider(openAiStyleClient(altText));
    const result = await provider.generateWithVision("Describe this.", imageUrl, jsonSchema);
    expect(altTextSchema.safeParse(result.data)).toEqual({ success: true, data: altText });
  });

  it("anthropic normalizes to the same validated shape", async () => {
    const provider = new AnthropicProvider(anthropicStyleClient(altText));
    const result = await provider.generateWithVision("Describe this.", imageUrl, jsonSchema);
    expect(altTextSchema.safeParse(result.data)).toEqual({ success: true, data: altText });
  });

  it("groq explicitly refuses vision calls rather than silently answering without seeing the image", async () => {
    const { GroqProvider } = await import("./providers/groqProvider");
    const provider = new GroqProvider(openAiStyleClient(altText));
    await expect(provider.generateWithVision("Describe this.", imageUrl, jsonSchema)).rejects.toThrow(
      /does not support generateWithVision/,
    );
  });
});
