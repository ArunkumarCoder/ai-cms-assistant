import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderMock = vi.fn();
vi.mock("../providers/registry", () => ({ getProvider: getProviderMock }));
vi.mock("../logging", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

const { aiClient } = await import("../client");
const { faqListJsonSchema, faqListSchema } = await import("./faqList");

function mockStructuredProvider(data: unknown) {
  const generateStructured = vi.fn().mockResolvedValue({
    data,
    usage: { inputTokens: 300, outputTokens: 150 },
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  });
  getProviderMock.mockReturnValue({ name: "groq", generateStructured });
  return generateStructured;
}

beforeEach(() => {
  getProviderMock.mockReset();
});

describe("faqListSchema", () => {
  it("validates a well-formed faq-generation response returned through generateStructured", async () => {
    const validFaqs = {
      faqItems: [
        {
          question: "Do you offer emergency plumbing repairs?",
          answer: "Yes, we offer 24/7 emergency service across Austin.",
        },
        {
          question: "How much does a plumbing inspection cost?",
          answer: "Inspections start at $89 and are waived with any repair.",
        },
        {
          question: "Are your plumbers licensed?",
          answer: "Every plumber we dispatch is licensed and insured.",
        },
      ],
    };
    mockStructuredProvider(validFaqs);

    const result = await aiClient.generateStructured(
      "faq-generation",
      "Draft FAQs for this plumbing page.",
      faqListJsonSchema,
    );

    expect(faqListSchema.safeParse(result.data).success).toBe(true);
  });

  it("rejects a malformed response (too few items, missing answer) instead of passing it through silently", async () => {
    const malformed = {
      faqItems: [
        { question: "Do you offer emergency plumbing repairs?" },
        {
          question: "How much does a plumbing inspection cost?",
          answer: "Inspections start at $89.",
        },
      ],
    };
    mockStructuredProvider(malformed);

    const result = await aiClient.generateStructured(
      "faq-generation",
      "Draft FAQs for this plumbing page.",
      faqListJsonSchema,
    );

    expect(faqListSchema.safeParse(result.data).success).toBe(false);
  });
});
