import * as z from "zod";
import type { JsonSchema } from "../types";

// Canonical output shape for AiCallType "seo-scoring" (SPEC.md §3, call #3).
//
// Mirrors `SeoAudit` (src/types/seo-audit.ts)'s `score`/`breakdown`/
// `suggestions` minus `id`/`pageId`/`createdAt` (assigned when the audit is
// persisted, not something the model knows) and each suggestion's `id`/
// `applied` (`applied` is user-driven state from journey (b) step 4's
// "Apply/dismiss" UI, set long after this call returns).
//
// `suggestedMetaTitle`/`suggestedMetaDescription`/`keywordGaps` don't exist
// on `SeoAudit` yet — the task calling for "rewritten meta title/
// description, keyword gaps" is a real gap in that domain type, flagged here
// the same way `qualityScore` was flagged and then added to `Page` on Day 5
// (SPEC.md §7, point 1) rather than silently dropped or smuggled into
// `suggestions` as unstructured text.
export const seoSuggestionSchema = z.object({
  category: z.string(),
  message: z.string(),
});

export const seoBreakdownSchema = z.object({
  keywordUsage: z.number().min(0).max(100),
  metaTags: z.number().min(0).max(100),
  readability: z.number().min(0).max(100),
  headingStructure: z.number().min(0).max(100),
  internalLinking: z.number().min(0).max(100),
});

export const seoSuggestionsSchema = z.object({
  score: z.number().min(0).max(100),
  breakdown: seoBreakdownSchema,
  suggestions: z.array(seoSuggestionSchema),
  suggestedMetaTitle: z.string().nullable(),
  suggestedMetaDescription: z.string().nullable(),
  keywordGaps: z.array(z.string()),
});

export type SeoSuggestion = z.infer<typeof seoSuggestionSchema>;
export type SeoBreakdown = z.infer<typeof seoBreakdownSchema>;
export type SeoSuggestions = z.infer<typeof seoSuggestionsSchema>;

export const seoSuggestionsJsonSchema: JsonSchema =
  z.toJSONSchema(seoSuggestionsSchema);
