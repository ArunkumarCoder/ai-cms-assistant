import type { ContentBlock } from "@/types";
import {
  countSentences,
  extractHeadingBlocks,
  extractWords,
  fleschEaseLabel,
  fleschReadingEase,
} from "./text";
import type { SeoCheckCategory, SeoCheckResult, SeoCheckStatus } from "./types";

const SCORE_BY_STATUS: Record<SeoCheckStatus, number> = {
  pass: 100,
  warn: 60,
  fail: 20,
  // Excluded from the composite average (see analyze.ts) — the value here
  // is never actually summed, just present so every SeoCheckResult has one.
  "not-applicable": 100,
};

function checkResult(
  id: string,
  label: string,
  category: SeoCheckCategory,
  status: SeoCheckStatus,
  reason: string,
): SeoCheckResult {
  return { id, label, category, status, score: SCORE_BY_STATUS[status], reason };
}

const TITLE_IDEAL_MIN = 30;
const TITLE_IDEAL_MAX = 60;
const TITLE_ACCEPTABLE_MIN = 15;
const TITLE_ACCEPTABLE_MAX = 70;

export function checkTitleLength(title: string): SeoCheckResult {
  const length = title.trim().length;
  const id = "titleLength";
  const label = "Title length";
  const category: SeoCheckCategory = "metaTags";

  if (length === 0) {
    return checkResult(id, label, category, "fail", "Title is empty — every page needs one for both SEO and the browser tab.");
  }
  if (length >= TITLE_IDEAL_MIN && length <= TITLE_IDEAL_MAX) {
    return checkResult(id, label, category, "pass", `Title is ${length} characters — within the recommended 30–60 range.`);
  }
  if (length >= TITLE_ACCEPTABLE_MIN && length <= TITLE_ACCEPTABLE_MAX) {
    const hint = length < TITLE_IDEAL_MIN ? "Consider adding more detail." : "Consider trimming it; search engines may truncate it.";
    return checkResult(id, label, category, "warn", `Title is ${length} characters — outside the ideal 30–60 range. ${hint}`);
  }
  const hint = length < TITLE_ACCEPTABLE_MIN ? "too short to be descriptive" : "likely to be truncated in search results";
  return checkResult(id, label, category, "fail", `Title is ${length} characters — ${hint}. Aim for 30–60 characters.`);
}

const META_IDEAL_MIN = 120;
const META_IDEAL_MAX = 160;
const META_ACCEPTABLE_MIN = 70;
const META_ACCEPTABLE_MAX = 200;

export function checkMetaDescriptionLength(metaDescription: string): SeoCheckResult {
  const length = metaDescription.trim().length;
  const id = "metaDescriptionLength";
  const label = "Meta description length";
  const category: SeoCheckCategory = "metaTags";

  if (length === 0) {
    return checkResult(id, label, category, "fail", "Meta description is empty — search engines will fall back to auto-generated snippet text.");
  }
  if (length >= META_IDEAL_MIN && length <= META_IDEAL_MAX) {
    return checkResult(id, label, category, "pass", `Meta description is ${length} characters — within the recommended 120–160 range.`);
  }
  if (length >= META_ACCEPTABLE_MIN && length <= META_ACCEPTABLE_MAX) {
    const hint = length < META_IDEAL_MIN ? "Consider expanding it." : "It may get truncated in search results.";
    return checkResult(id, label, category, "warn", `Meta description is ${length} characters — outside the ideal 120–160 range. ${hint}`);
  }
  const hint = length < META_ACCEPTABLE_MIN ? "too short to be a useful search snippet" : "far too long and will be truncated";
  return checkResult(id, label, category, "fail", `Meta description is ${length} characters — ${hint}. Aim for 120–160 characters.`);
}

export function checkHeadingHierarchy(contentBlocks: ContentBlock[], title: string): SeoCheckResult {
  const id = "headingHierarchy";
  const label = "Heading hierarchy";
  const category: SeoCheckCategory = "headingStructure";

  const headings = extractHeadingBlocks(contentBlocks);
  const issues: string[] = [];
  let hasSkippedLevel = false;

  if (!title.trim()) {
    issues.push("the page has no title, so there is no H1 for search engines to key off of");
  }

  const explicitH1Count = headings.filter((h) => h.level === 1).length;
  if (explicitH1Count > 0) {
    issues.push(
      `${explicitH1Count} content block${explicitH1Count === 1 ? "" : "s"} marked as H1 — the page title already renders as the H1, so demote ${explicitH1Count === 1 ? "it" : "them"} to H2 or lower`,
    );
  }

  let deepestSoFar = 1; // the page title, treated as the implicit H1
  for (const heading of headings) {
    if (heading.level > deepestSoFar + 1) {
      issues.push(`"${heading.text}" jumps from H${deepestSoFar} to H${heading.level}, skipping a level`);
      hasSkippedLevel = true;
    }
    deepestSoFar = Math.max(deepestSoFar, heading.level);
  }

  if (issues.length === 0) {
    const reason =
      headings.length > 0
        ? `Single H1 (page title) with ${headings.length} nested heading${headings.length === 1 ? "" : "s"}, no skipped levels.`
        : "Single H1 (page title); no sub-headings yet, so there's nothing to nest.";
    return checkResult(id, label, category, "pass", reason);
  }

  const status: SeoCheckStatus = hasSkippedLevel || !title.trim() ? "fail" : "warn";
  return checkResult(id, label, category, status, `${issues.join("; ")}.`);
}

const KEYWORD_DENSITY_MIN = 0.5;
const KEYWORD_DENSITY_MAX = 2.5;
const KEYWORD_DENSITY_STUFFING = 4;

export function checkKeywordDensity(targetKeyword: string | undefined, analyzableText: string): SeoCheckResult {
  const id = "keywordDensity";
  const label = "Keyword density";
  const category: SeoCheckCategory = "keywordUsage";

  const keyword = targetKeyword?.trim();
  if (!keyword) {
    return checkResult(id, label, category, "not-applicable", "No target keyword set on this page — nothing to measure.");
  }

  const words = extractWords(analyzableText).map((w) => w.toLowerCase());
  const keywordWords = extractWords(keyword).map((w) => w.toLowerCase());

  if (words.length === 0 || keywordWords.length === 0) {
    return checkResult(id, label, category, "fail", `Target keyword "${keyword}" can't be checked — the page has no analyzable text yet.`);
  }

  let occurrences = 0;
  for (let i = 0; i <= words.length - keywordWords.length; i++) {
    if (keywordWords.every((kw, j) => words[i + j] === kw)) occurrences++;
  }

  if (occurrences === 0) {
    return checkResult(id, label, category, "fail", `Target keyword "${keyword}" doesn't appear anywhere in the title, headings, or body text.`);
  }

  const density = ((occurrences * keywordWords.length) / words.length) * 100;
  const roundedDensity = Math.round(density * 100) / 100;
  const timesText = `${occurrences} time${occurrences === 1 ? "" : "s"}`;

  if (density > KEYWORD_DENSITY_STUFFING) {
    return checkResult(
      id, label, category, "fail",
      `"${keyword}" appears ${timesText} (${roundedDensity}% density) — this reads as keyword stuffing. Aim for 0.5–2.5%.`,
    );
  }
  if (density >= KEYWORD_DENSITY_MIN && density <= KEYWORD_DENSITY_MAX) {
    return checkResult(
      id, label, category, "pass",
      `"${keyword}" appears ${timesText} (${roundedDensity}% density) — within the healthy 0.5–2.5% range.`,
    );
  }
  const hint = density < KEYWORD_DENSITY_MIN ? "a bit low; consider using it a little more" : "getting high; keep an eye on it";
  return checkResult(
    id, label, category, "warn",
    `"${keyword}" appears ${timesText} (${roundedDensity}% density) — ${hint}. Aim for 0.5–2.5%.`,
  );
}

export function checkReadability(bodyText: string): SeoCheckResult {
  const id = "readability";
  const label = "Readability";
  const category: SeoCheckCategory = "readability";

  const trimmed = bodyText.trim();
  if (!trimmed || countSentences(trimmed) === 0) {
    return checkResult(id, label, category, "fail", "No body paragraphs with complete sentences to analyze yet.");
  }

  const score = fleschReadingEase(trimmed);
  if (score === null) {
    return checkResult(id, label, category, "fail", "No body paragraphs with complete sentences to analyze yet.");
  }

  const easeLabel = fleschEaseLabel(score);
  if (score >= 60) {
    return checkResult(id, label, category, "pass", `Flesch reading ease score is ${score} (${easeLabel}) — easy to read for most audiences.`);
  }
  if (score >= 30) {
    return checkResult(id, label, category, "warn", `Flesch reading ease score is ${score} (${easeLabel}) — fairly dense. Consider shorter sentences and simpler words.`);
  }
  return checkResult(id, label, category, "fail", `Flesch reading ease score is ${score} (${easeLabel}) — very hard to read. Break up long sentences and simplify vocabulary.`);
}
