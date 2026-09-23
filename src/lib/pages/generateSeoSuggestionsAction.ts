"use server";

import { requireUser } from "@/lib/auth/dal";
import {
  aiClient,
  seoSuggestionsJsonSchema,
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
    const result = await aiClient.generateStructured<SeoSuggestions>(
      "seo-scoring",
      prompt,
      seoSuggestionsJsonSchema,
      { context: { userId: user.id } },
    );
    // Re-validate the provider's own JSON output against the same schema
    // used to constrain it, same safety net as generatePageDraftAction.ts.
    return { suggestions: seoSuggestionsSchema.parse(result.data) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to generate SEO suggestions.",
    };
  }
}
