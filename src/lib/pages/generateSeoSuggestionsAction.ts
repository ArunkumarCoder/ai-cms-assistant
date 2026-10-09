"use server";

import { requireUser } from "@/lib/auth/dal";
import {
  aiClient,
  describeAiActionFailure,
  seoSuggestionsSchema,
  type SeoSuggestions,
} from "@/lib/ai";
import { getActiveSiteForCurrentUser } from "@/lib/cms";
import { buildSeoSuggestionsPrompt, type SeoSuggestionsPromptInput } from "./prompt";

export type GenerateSeoSuggestionsInput = Omit<SeoSuggestionsPromptInput, "brandVoice">;
export type GenerateSeoSuggestionsResult = { suggestions: SeoSuggestions } | { error: string };

export async function generateSeoSuggestionsAction(
  input: GenerateSeoSuggestionsInput,
  // The caller's "Regenerate" affordance (SeoPanel.tsx) — "seo-scoring" is a
  // cacheable call type (src/lib/ai/cache.ts), so an unchanged title/meta/
  // keyword would otherwise silently replay the same suggestion on every
  // click, which looks like a broken button. Defaults to a fresh cache read,
  // same as before this existed.
  options: { bypassCache?: boolean } = {},
): Promise<GenerateSeoSuggestionsResult> {
  const user = await requireUser();
  const site = await getActiveSiteForCurrentUser();

  try {
    const prompt = buildSeoSuggestionsPrompt({ ...input, brandVoice: site?.brandVoice ?? undefined });
    // aiClient.generateStructured validates against seoSuggestionsSchema
    // itself (with a bounded retry on a malformed shape) — no separate parse
    // step needed here anymore.
    const result = await aiClient.generateStructured(
      "seo-scoring",
      prompt,
      seoSuggestionsSchema,
      { context: { userId: user.id, siteId: site?.id }, bypassCache: options.bypassCache },
    );
    return { suggestions: result.data };
  } catch (err) {
    return { error: describeAiActionFailure(err, "Failed to generate SEO suggestions.") };
  }
}
