import {
  checkHeadingHierarchy,
  checkKeywordDensity,
  checkMetaDescriptionLength,
  checkReadability,
  checkTitleLength,
} from "./checks";
import { extractHeadingBlocks, extractParagraphText } from "./text";
import type { SeoAnalysis, SeoAnalysisInput } from "./types";

// Deterministic, rule-based SEO analysis — no AI calls. This is the
// foundation the composite quality score (Day 18) sums up; tomorrow's task
// layers AI-assisted suggestions (meta rewrites, keyword-gap suggestions)
// on top of these same checks rather than replacing them.
export function analyzeSeoContent(input: SeoAnalysisInput): SeoAnalysis {
  const paragraphText = extractParagraphText(input.contentBlocks);
  const headingText = extractHeadingBlocks(input.contentBlocks)
    .map((h) => h.text)
    .join(" ");
  const analyzableText = [input.title, headingText, paragraphText].filter(Boolean).join(" ");

  const checks = [
    checkTitleLength(input.title),
    checkMetaDescriptionLength(input.metaDescription),
    checkHeadingHierarchy(input.contentBlocks, input.title),
    checkKeywordDensity(input.targetKeyword, analyzableText),
    checkReadability(paragraphText),
  ];

  const scorable = checks.filter((check) => check.status !== "not-applicable");
  const score =
    scorable.length > 0
      ? Math.round(scorable.reduce((sum, check) => sum + check.score, 0) / scorable.length)
      : 100;

  return { checks, score };
}
