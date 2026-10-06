import { describe, expect, it } from "vitest";
import { faqListSchema } from "./faqList";

// Pure schema tests — see pageDraft.test.ts's top comment for why these
// don't go through aiClient.
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

describe("faqListSchema", () => {
  it("accepts a well-formed list of 3-8 FAQs", () => {
    expect(faqListSchema.safeParse(validFaqs).success).toBe(true);
  });

  it("accepts (and ignores) an extra, unexpected field on an item", () => {
    expect(
      faqListSchema.safeParse({
        faqItems: validFaqs.faqItems.map((item) => ({ ...item, confidence: "high" })),
      }).success,
    ).toBe(true);
  });

  it("rejects fewer than 3 items", () => {
    expect(faqListSchema.safeParse({ faqItems: validFaqs.faqItems.slice(0, 2) }).success).toBe(
      false,
    );
  });

  it("rejects more than 8 items", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      question: `Question ${i}?`,
      answer: `Answer ${i}.`,
    }));
    expect(faqListSchema.safeParse({ faqItems: nine }).success).toBe(false);
  });

  it("rejects a missing required field (answer)", () => {
    expect(
      faqListSchema.safeParse({
        faqItems: [
          { question: "Do you offer emergency plumbing repairs?" },
          ...validFaqs.faqItems.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a wrong type (faqItems as a string instead of an array)", () => {
    expect(faqListSchema.safeParse({ faqItems: "lots of great FAQs" }).success).toBe(false);
  });

  it("rejects an empty question or answer", () => {
    expect(
      faqListSchema.safeParse({
        faqItems: [{ question: "", answer: "Yes." }, ...validFaqs.faqItems.slice(1)],
      }).success,
    ).toBe(false);
  });

  it("rejects a response that is valid JSON but an entirely different shape", () => {
    expect(faqListSchema.safeParse(validFaqs.faqItems).success).toBe(false);
    expect(faqListSchema.safeParse({ faqs: validFaqs.faqItems }).success).toBe(false);
  });
});
