import type { ContentBlock, FaqItem } from "@/types";
import {
  checkHeadingHierarchy,
  checkKeywordDensity,
  checkMetaDescriptionLength,
  checkReadability,
  checkTitleLength,
  extractHeadingBlocks,
  extractParagraphText,
  extractWords,
  fleschReadingEase,
} from "@/lib/seo";
import { qualityScoreSchema, type QualityScore, type QualitySubScore } from "@/lib/ai/schemas/qualityScore";

// The deterministic implementation of the Day 10 "content-quality" shape
// (src/lib/ai/schemas/qualityScore.ts) — same score/subScores.{seo,
// readability,structure} contract that call #8 would eventually fill in via
// AI, but computed here from the same rule-based signals src/lib/seo/
// already produces, with no AI call and no extra latency/cost. The result is
// re-validated against `qualityScoreSchema` before returning, same
// belt-and-suspenders pattern the AI actions use for a provider's own
// output (see generateSeoSuggestionsAction.ts) — here it catches a bug in
// this file's own weighting math rather than a bad model response.
//
// Weighting (documented in full in SPEC.md, since "how is this computed" is
// the first question a reviewer will ask). Run against this project's own
// seeded demo pages before settling on these numbers — an early version
// scored the richest demo landing page *below* a deliberately-blank
// placeholder stub, which is exactly the failure mode this comment's last
// two bullets exist to prevent:
//
// - Composite = 40% seo + 30% readability + 30% structure, EXCEPT
//   readability is dropped from the composite entirely (its weight
//   redistributed to seo/structure, same renormalization every other
//   not-applicable component below gets) when the page has under
//   MIN_READABILITY_WORDS of body text. Flesch reading-ease is a noisy
//   signal at very low word counts — a one- or two-sentence stub can land
//   anywhere from "very easy" to "difficult" depending on a single sentence
//   break, which isn't a meaningful verdict on a page that barely has any
//   content yet. The sub-score is still computed and shown (with a note),
//   just not allowed to swing the headline number on a near-empty page.
// - seo sub-score = 30% title length + 30% meta description length + 40%
//   keyword density, reusing src/lib/seo/checks.ts's own checks and scores.
//   Keyword density gets the largest single weight (it's the strongest
//   ranking-relevant signal of the three) but is entirely excluded — not
//   scored as a failure — when no target keyword is set, with its weight
//   redistributed across the other two (matches analyzeSeoContent's own
//   not-applicable handling in src/lib/seo/analyze.ts).
// - readability sub-score = the Flesch reading-ease score itself (clamped to
//   0-100), not checkReadability's coarser pass/warn/fail bucketing — the
//   composite wants the actual continuous number. Its `reason` still reuses
//   checkReadability's own generated sentence rather than writing new copy.
// - structure sub-score = 30% heading hierarchy (checkHeadingHierarchy) +
//   25% content depth + 25% FAQ presence + 20% image alt-text coverage.
//   Content depth is here because checkHeadingHierarchy alone isn't enough:
//   a page with zero headings and zero body copy has no hierarchy *errors*,
//   so it scores a trivial "pass" on that check even though it's the
//   opposite of well-structured — content depth (body word count) is what
//   actually tells a near-empty page apart from a real one. FAQs and alt
//   text have no equivalent in src/lib/seo/checks.ts (they aren't SEO-copy
//   concerns), so this module adds small, consistently-styled checks for
//   both. Alt-text coverage is excluded (not penalized) when the page has no
//   image blocks at all, weight redistributed the same way keyword density
//   is. A missing FAQ list is never "not applicable" — every page can add
//   one — so absence scores 70 (a mild nudge), not 0 or excluded.
const COMPOSITE_WEIGHTS = { seo: 0.4, readability: 0.3, structure: 0.3 };
const MIN_READABILITY_WORDS = 80;

export interface QualityScoreInput {
  title: string;
  metaDescription: string;
  targetKeyword?: string;
  contentBlocks: ContentBlock[];
  faqItems: FaqItem[];
}

interface ScoredComponent {
  weight: number;
  score: number;
  reason: string;
}

// Weighted average over whichever components are applicable, renormalizing
// so an excluded (not-applicable) component's weight doesn't just get
// treated as a zero. `reasons` comes back worst-first so callers that only
// want the most actionable explanation can take the front of the list.
function combine(components: (ScoredComponent | null)[]): { score: number; reasons: string[] } {
  const applicable = components.filter((c): c is ScoredComponent => c !== null);
  const totalWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round(
    applicable.reduce((sum, c) => sum + c.weight * c.score, 0) / totalWeight,
  );
  const reasons = applicable
    .slice()
    .sort((a, b) => a.score - b.score)
    .map((c) => c.reason);
  return { score, reasons };
}

function buildAnalyzableText(title: string, contentBlocks: ContentBlock[], paragraphText: string): string {
  const headingText = extractHeadingBlocks(contentBlocks).map((h) => h.text).join(" ");
  return [title, headingText, paragraphText].filter(Boolean).join(" ");
}

function computeSeoSubScore(input: QualityScoreInput, paragraphText: string): QualitySubScore {
  const titleCheck = checkTitleLength(input.title);
  const metaCheck = checkMetaDescriptionLength(input.metaDescription);
  const keywordCheck = checkKeywordDensity(
    input.targetKeyword,
    buildAnalyzableText(input.title, input.contentBlocks, paragraphText),
  );

  const { score, reasons } = combine([
    { weight: 0.3, score: titleCheck.score, reason: titleCheck.reason },
    { weight: 0.3, score: metaCheck.score, reason: metaCheck.reason },
    keywordCheck.status === "not-applicable"
      ? null
      : { weight: 0.4, score: keywordCheck.score, reason: keywordCheck.reason },
  ]);

  return { score, reason: reasons.slice(0, 2).join(" ") };
}

function faqPresenceComponent(faqItems: FaqItem[]): ScoredComponent {
  if (faqItems.length > 0) {
    return {
      weight: 0.25,
      score: 100,
      reason: `Page has ${faqItems.length} FAQ${faqItems.length === 1 ? "" : "s"} — good for both readers and rich-result eligibility.`,
    };
  }
  return {
    weight: 0.25,
    score: 70,
    reason: "No FAQs yet — optional, but a few relevant questions tend to help both readers and search snippets.",
  };
}

// Excluded (returns null) when the page has no image blocks at all — there's
// nothing to grade alt text coverage against, same "not-applicable" treatment
// keywordDensity gets for an unset target keyword.
function altTextCoverageComponent(contentBlocks: ContentBlock[]): ScoredComponent | null {
  const images = contentBlocks.filter((b) => b.type === "image");
  if (images.length === 0) return null;

  const withAlt = images.filter((b) => b.metadata?.altTextStatus !== "missing").length;
  const score = Math.round((withAlt / images.length) * 100);
  const reason =
    withAlt === images.length
      ? `All ${images.length} image${images.length === 1 ? "" : "s"} have alt text.`
      : `${withAlt} of ${images.length} image${images.length === 1 ? "" : "s"} ${images.length - withAlt === 1 ? "has" : "have"} alt text — the rest need it for accessibility and image search.`;
  return { weight: 0.2, score, reason };
}

// A page with no hierarchy *errors* isn't the same as a page with actual
// structure — checkHeadingHierarchy alone can't tell a rich page apart from
// an empty one (see this file's top comment), so this looks at body word
// count as a separate, simple completeness signal.
function contentDepthComponent(wordCount: number): ScoredComponent {
  if (wordCount < 40) {
    return {
      weight: 0.25,
      score: 20,
      reason: "This page has very little body content yet — there's not much here for a reader or a search engine to work with.",
    };
  }
  if (wordCount < 120) {
    return {
      weight: 0.25,
      score: 60,
      reason: "This page is fairly thin — more body content would give both readers and search engines more to work with.",
    };
  }
  return {
    weight: 0.25,
    score: 100,
    reason: "This page has a healthy amount of body content.",
  };
}

function computeStructureSubScore(input: QualityScoreInput, wordCount: number): QualitySubScore {
  const headingCheck = checkHeadingHierarchy(input.contentBlocks, input.title);

  const { score, reasons } = combine([
    { weight: 0.3, score: headingCheck.score, reason: headingCheck.reason },
    contentDepthComponent(wordCount),
    faqPresenceComponent(input.faqItems),
    altTextCoverageComponent(input.contentBlocks),
  ]);

  return { score, reason: reasons.slice(0, 2).join(" ") };
}

// The continuous Flesch score, clamped to the same 0-100 scale as every
// other sub-score (Flesch can technically run slightly above 100 for very
// short/simple text, or deep negative for dense text). No analyzable body
// text scores 0 here — deliberately harsher than checkReadability's own
// "fail" bucket score of 20, since an empty page has no readability signal
// at all rather than merely a bad one. The reason text is still
// checkReadability's own sentence (plus a short note when the sample is too
// small to be reliable — see MIN_READABILITY_WORDS), not new copy.
function computeReadabilitySubScore(paragraphText: string, wordCount: number): QualitySubScore {
  const flesch = fleschReadingEase(paragraphText);
  const score = flesch === null ? 0 : Math.max(0, Math.min(100, Math.round(flesch)));
  const reason = checkReadability(paragraphText).reason;
  // Same threshold computeQualityScore uses to decide whether this sub-score
  // counts toward the composite — the note only appears when it doesn't, no
  // matter whether that's because there's a little text or none at all.
  const isReliable = wordCount >= MIN_READABILITY_WORDS;
  return {
    score,
    reason: isReliable
      ? reason
      : `${reason} Based on very little text, so it isn't counted in the overall score yet.`,
  };
}

export function computeQualityScore(input: QualityScoreInput): QualityScore {
  const paragraphText = extractParagraphText(input.contentBlocks);
  const wordCount = extractWords(paragraphText).length;

  const seo = computeSeoSubScore(input, paragraphText);
  const readability = computeReadabilitySubScore(paragraphText, wordCount);
  const structure = computeStructureSubScore(input, wordCount);

  const { score } = combine([
    { weight: COMPOSITE_WEIGHTS.seo, score: seo.score, reason: "" },
    wordCount >= MIN_READABILITY_WORDS
      ? { weight: COMPOSITE_WEIGHTS.readability, score: readability.score, reason: "" }
      : null,
    { weight: COMPOSITE_WEIGHTS.structure, score: structure.score, reason: "" },
  ]);

  return qualityScoreSchema.parse({ score, subScores: { seo, readability, structure } });
}
