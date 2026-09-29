import type { PageStatus } from "@/types";

// The minimal per-page slice the dashboard needs — assembled once in
// dashboard/page.tsx from data this app already computes and stores
// (PageSummary's own qualityScore/faqCount, plus a flagged-image count
// derived from listImages()+assessAltText, the exact same function Media
// Library already uses). No new AI calls, no per-page recomputation of
// anything — this task's own "read-heavy and fast" requirement (item 4).
export interface PageHealthInput {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  qualityScore: number | null;
  faqCount: number;
  flaggedImageCount: number;
}

export type StatusCounts = Record<PageStatus, number>;

export interface SiteHealthSummary {
  totalPages: number;
  averageQualityScore: number | null;
  statusCounts: StatusCounts;
  totalImages: number;
  flaggedImages: number;
  pagesWithFaqs: number;
}

// Guards every division against a zero-page/zero-image Site (task item 5) —
// an average over an empty set is `null`, never NaN or a divide-by-zero.
export function summarizeSiteHealth(
  pages: readonly PageHealthInput[],
  totalImages: number,
  flaggedImages: number,
): SiteHealthSummary {
  const scored = pages.filter((page) => page.qualityScore !== null);
  const averageQualityScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, page) => sum + (page.qualityScore as number), 0) / scored.length)
      : null;

  const statusCounts: StatusCounts = { draft: 0, "in-review": 0, approved: 0, published: 0 };
  for (const page of pages) statusCounts[page.status]++;

  return {
    totalPages: pages.length,
    averageQualityScore,
    statusCounts,
    totalImages,
    flaggedImages,
    pagesWithFaqs: pages.filter((page) => page.faqCount > 0).length,
  };
}

export interface SubScoreAverages {
  seo: number;
  readability: number;
  structure: number;
}

// Averages whatever sub-scores the dashboard could find (only pages ever
// saved through this app after Day 14 have any — see getLatestScoresForSite,
// src/lib/quality/scoreHistory.ts). `null` when there's nothing to average,
// same "don't fake a number" convention as averageQualityScore above.
export function averageSubScores(
  entries: readonly { seo: number; readability: number; structure: number }[],
): SubScoreAverages | null {
  if (entries.length === 0) return null;
  const sum = entries.reduce(
    (acc, entry) => ({
      seo: acc.seo + entry.seo,
      readability: acc.readability + entry.readability,
      structure: acc.structure + entry.structure,
    }),
    { seo: 0, readability: 0, structure: 0 },
  );
  return {
    seo: Math.round(sum.seo / entries.length),
    readability: Math.round(sum.readability / entries.length),
    structure: Math.round(sum.structure / entries.length),
  };
}

export type AttentionReasonType = "unscored" | "low-score" | "in-review" | "approved" | "flagged-images";

export interface AttentionReason {
  type: AttentionReasonType;
  label: string;
}

// Matches the existing green/amber/red boundary this app already uses
// everywhere a quality score gets a color (QualityScorePanel.tsx,
// SeoChecklist.tsx's scoreClassName) — "needs attention" means anything
// short of the clearly-good (green, >=80) band, not a new number invented
// just for this screen.
const LOW_SCORE_THRESHOLD = 80;

// The single place "does this page need attention, and why" is decided —
// called both server-side (to build the default queue) and client-side
// (HealthQueue.tsx, so toggling "All pages" can still show why each flagged
// page is flagged, without re-fetching anything).
export function attentionReasonsFor(page: PageHealthInput): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  if (page.qualityScore === null) {
    reasons.push({ type: "unscored", label: "Not yet scored" });
  } else if (page.qualityScore < LOW_SCORE_THRESHOLD) {
    reasons.push({ type: "low-score", label: `Quality score: ${page.qualityScore}/100` });
  }

  if (page.status === "in-review") {
    reasons.push({ type: "in-review", label: "Awaiting review" });
  } else if (page.status === "approved") {
    reasons.push({ type: "approved", label: "Approved, not yet published" });
  }

  if (page.flaggedImageCount > 0) {
    reasons.push({
      type: "flagged-images",
      label: `${page.flaggedImageCount} image${page.flaggedImageCount === 1 ? " needs" : "s need"} alt text`,
    });
  }

  return reasons;
}

export interface AttentionQueueItem extends PageHealthInput {
  reasons: AttentionReason[];
}

// Convenience wrapper over attentionReasonsFor for callers (and tests) that
// just want "the pages that need attention, with why" in one call — the
// default view HealthQueue opens on before a user switches to "All pages".
export function buildAttentionQueue(pages: readonly PageHealthInput[]): AttentionQueueItem[] {
  return pages
    .map((page) => ({ ...page, reasons: attentionReasonsFor(page) }))
    .filter((item) => item.reasons.length > 0);
}
