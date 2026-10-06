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
      { context: { userId: user.id, siteId: site?.id } },
    );
    return { suggestions: result.data };
  } catch (err) {
    return { error: describeAiActionFailure(err, "Failed to generate SEO suggestions.") };
  }
}
