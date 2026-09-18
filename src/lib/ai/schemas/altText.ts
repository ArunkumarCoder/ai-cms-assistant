import * as z from "zod";
import type { JsonSchema } from "../types";

// Canonical output shape for AiCallType "alt-text-single" AND
// "alt-text-batch" (SPEC.md §3, calls #4/#5) — one schema, not two: the
// inventory's own note on call #5 is "Same as #4, looped per image," so
// batch is this same per-image shape called N times by feature code, never
// a different response shape.
//
// `confidence`/`needsReview` have no equivalent on `ImageAsset`
// (src/types/image-asset.ts) — that type only tracks `altText` plus the
// workflow state `altTextStatus` ("missing" | "ai-generated" | "reviewed").
// Confidence is an AI-time signal for whether a human should double-check
// before a suggestion is trusted into "reviewed" (journey (c) step 4's
// review pass); it's a hint for that UI step, not something persisted
// alongside the image, so it deliberately has no domain-type field to
// mirror.
export const altTextSchema = z.object({
  altText: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  needsReview: z.boolean(),
});

export type AltText = z.infer<typeof altTextSchema>;

export const altTextJsonSchema: JsonSchema = z.toJSONSchema(altTextSchema);
