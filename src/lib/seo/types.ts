import type { ContentBlock, SeoAuditBreakdown } from "@/types";

// Reuses SeoAuditBreakdown's own keys (src/types/seo-audit.ts) as the
// category vocabulary, rather than inventing a parallel one, so Day 18's
// composite quality score can sum per-category results from this module
// against the same keys `seoSuggestionsSchema` (the AI-scoring counterpart,
// src/lib/ai/schemas/seoSuggestions.ts) already produces. `internalLinking`
// is excluded — it needs a site-wide link graph, not a single page's
// content, so it isn't something this deterministic module can check today.
export type SeoCheckCategory = Exclude<keyof SeoAuditBreakdown, "internalLinking">;

export type SeoCheckStatus = "pass" | "warn" | "fail" | "not-applicable";

export interface SeoCheckResult {
  id: string;
  label: string;
  category: SeoCheckCategory;
  status: SeoCheckStatus;
  score: number; // 0-100, same scale as SeoAuditBreakdown's fields
  reason: string;
}

export interface SeoAnalysisInput {
  title: string;
  metaDescription: string;
  targetKeyword?: string;
  contentBlocks: ContentBlock[];
}

export interface SeoAnalysis {
  checks: SeoCheckResult[];
  score: number; // 0-100, average of applicable (non "not-applicable") checks
}
