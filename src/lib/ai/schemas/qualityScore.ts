import * as z from "zod";
import type { JsonSchema } from "../types";

// Canonical output shape for AiCallType "content-quality" (SPEC.md §3, call
// #8, "optional/future"). `score` (the composite) is what would map onto
// `Page.qualityScore` (src/types/page.ts) if/when this call is wired up to
// persist it — same field Day 5 added to `Page` for the SEO-scoring call's
// snapshot (SPEC.md §7, point 1). The three sub-scores plus their `reason`
// text exist only inside this AI response; there's no persisted breakdown
// equivalent to mirror, since this is a lighter pre-publish gut-check, not
// `SeoAudit`'s five-category, per-page-history breakdown (seoSuggestions.ts).
export const qualitySubScoreSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string(),
});

export const qualityScoreSchema = z.object({
  score: z.number().min(0).max(100),
  subScores: z.object({
    seo: qualitySubScoreSchema,
    readability: qualitySubScoreSchema,
    structure: qualitySubScoreSchema,
  }),
});

export type QualitySubScore = z.infer<typeof qualitySubScoreSchema>;
export type QualityScore = z.infer<typeof qualityScoreSchema>;

export const qualityScoreJsonSchema: JsonSchema =
  z.toJSONSchema(qualityScoreSchema);
