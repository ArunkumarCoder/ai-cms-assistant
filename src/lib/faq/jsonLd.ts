import type { FaqItem } from "@/types";

export interface FaqPageQuestion {
  "@type": "Question";
  name: string;
  acceptedAnswer: {
    "@type": "Answer";
    text: string;
  };
}

export interface FaqPageJsonLd {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: FaqPageQuestion[];
}

// Deterministic transform of already-saved FAQ items into Google's FAQPage
// structured-data shape — SPEC.md §3 originally flagged this as AI call #7
// ("FAQ schema/JSON-LD formatting"), never built; this task explicitly calls
// for a plain transform of data already saved instead of a second AI call
// re-deriving facts a model (or a human) already wrote once on Day 19,
// mirroring how the Day 14 composite quality score resolved its own
// once-planned AI call (#8) deterministically instead.
//
// Returns `null` when there are no usable FAQ items — an empty `mainEntity`
// array isn't valid, meaningful FAQPage markup (Google's own guidelines
// require at least one question), so the caller should render no script tag
// at all rather than an empty shell. Items with a blank question or answer
// are filtered out defensively: saveFaqItemsAction.ts already rejects those
// at save time, but a page edited directly in Sanity Studio bypasses this
// app's own validation entirely, and stale/blank markup is worse than none.
export function buildFaqPageJsonLd(faqItems: FaqItem[]): FaqPageJsonLd | null {
  const items = faqItems
    .filter((item) => item.question.trim() !== "" && item.answer.trim() !== "")
    .slice()
    .sort((a, b) => a.order - b.order);

  if (items.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question.trim(),
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer.trim(),
      },
    })),
  };
}

// `JSON.stringify` alone doesn't sanitize a `</script>` sequence inside a
// question/answer from prematurely closing the script tag this gets embedded
// in — the exact escaping Next's own JSON-LD guide (node_modules/next/dist/
// docs/01-app/02-guides/json-ld.md) recommends, applied here rather than
// inline at every render site so it can't be forgotten at one of them.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
