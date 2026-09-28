import { describe, expect, it } from "vitest";
import { buildFaqPageJsonLd, serializeJsonLd } from "./jsonLd";
import type { FaqItem } from "@/types";

function faq(overrides: Partial<FaqItem> = {}): FaqItem {
  return {
    id: overrides.id ?? "faq-1",
    pageId: overrides.pageId ?? "page-1",
    question: overrides.question ?? "Do you offer emergency service?",
    answer: overrides.answer ?? "Yes, 24/7.",
    order: overrides.order ?? 0,
    source: overrides.source ?? "manual",
  };
}

describe("buildFaqPageJsonLd", () => {
  it("returns a valid FAQPage document for a normal FAQ list", () => {
    const jsonLd = buildFaqPageJsonLd([
      faq({ id: "a", question: "Are you licensed?", answer: "Yes, fully licensed and insured.", order: 0 }),
      faq({ id: "b", question: "Do you serve Austin?", answer: "Yes, the whole metro area.", order: 1 }),
    ]);

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Are you licensed?",
          acceptedAnswer: { "@type": "Answer", text: "Yes, fully licensed and insured." },
        },
        {
          "@type": "Question",
          name: "Do you serve Austin?",
          acceptedAnswer: { "@type": "Answer", text: "Yes, the whole metro area." },
        },
      ],
    });
  });

  it("orders questions by FaqItem.order regardless of input array order", () => {
    const jsonLd = buildFaqPageJsonLd([
      faq({ id: "second", question: "Second question", order: 1 }),
      faq({ id: "first", question: "First question", order: 0 }),
    ]);

    expect(jsonLd?.mainEntity.map((q) => q.name)).toEqual(["First question", "Second question"]);
  });

  it("returns null for an empty FAQ list rather than an empty mainEntity array", () => {
    expect(buildFaqPageJsonLd([])).toBeNull();
  });

  it("filters out (and can return null for) items with a blank question or answer", () => {
    const withOneBlank = buildFaqPageJsonLd([
      faq({ id: "a", question: "Real question?", answer: "Real answer.", order: 0 }),
      faq({ id: "b", question: "   ", answer: "Orphaned answer.", order: 1 }),
    ]);
    expect(withOneBlank?.mainEntity).toHaveLength(1);

    const allBlank = buildFaqPageJsonLd([faq({ question: "", answer: "" })]);
    expect(allBlank).toBeNull();
  });

  it("trims surrounding whitespace from question and answer text", () => {
    const jsonLd = buildFaqPageJsonLd([faq({ question: "  Trimmed?  ", answer: "  Yes.  " })]);
    expect(jsonLd?.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "Trimmed?",
      acceptedAnswer: { "@type": "Answer", text: "Yes." },
    });
  });
});

describe("serializeJsonLd", () => {
  it("produces valid JSON for a normal payload", () => {
    const data = buildFaqPageJsonLd([faq()]);
    expect(() => JSON.parse(serializeJsonLd(data))).not.toThrow();
  });

  it("escapes '<' so a malicious answer can't close the surrounding <script> tag early", () => {
    const jsonLd = buildFaqPageJsonLd([
      faq({ question: "Safe?", answer: "</script><script>alert(1)</script>" }),
    ]);

    const serialized = serializeJsonLd(jsonLd);

    // No raw "<" survives at all — the HTML parser embedding this string
    // inside a <script> tag has nothing it could ever read as a tag boundary.
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script>\\u003cscript>alert(1)\\u003c/script>");
    // And it still round-trips back to the exact original text once parsed —
    // this is HTML-context escaping, not data corruption.
    const parsed = JSON.parse(serialized);
    expect(parsed.mainEntity[0].acceptedAnswer.text).toBe("</script><script>alert(1)</script>");
  });
});
