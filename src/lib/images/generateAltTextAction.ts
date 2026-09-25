"use server";

import { requireUser } from "@/lib/auth/dal";
import { aiClient, altTextJsonSchema, altTextSchema, type AltText } from "@/lib/ai";
import { getActiveSiteForCurrentUser } from "@/lib/cms";
import { buildAltTextPrompt } from "./prompt";

// First AI vision call in this app (SPEC.md §3, calls #4/#5) — routed to
// OpenAI by default, never Groq (../ai/routing.ts's CALL_TYPE_PROVIDER table,
// unchanged by this feature: Groq's vision coverage isn't guaranteed across
// its hosted models). Deliberately does not write anything anywhere — see
// saveAltTextAction.ts for the only place a suggestion is ever persisted,
// and only once a human explicitly accepts it.
export interface GenerateAltTextInput {
  imageUrl: string;
  pageTitle?: string;
}

export type GenerateAltTextResult = { altText: AltText } | { error: string };

export async function generateAltTextAction(
  input: GenerateAltTextInput,
): Promise<GenerateAltTextResult> {
  const user = await requireUser();
  // Absent siteId just means this vision call's cost-log row (Day 9's
  // logAiCall, wired in automatically by aiClient) has no site attribution —
  // generation shouldn't require a Site to work, same reasoning
  // generatePageDraftAction.ts already applies to brandVoice.
  const site = await getActiveSiteForCurrentUser();

  try {
    const prompt = buildAltTextPrompt({ pageTitle: input.pageTitle });
    const result = await aiClient.generateWithVision<AltText>(
      "alt-text-single",
      prompt,
      input.imageUrl,
      altTextJsonSchema,
      { context: { userId: user.id, siteId: site?.id } },
    );
    // Re-validate the provider's own JSON output against the same schema
    // used to constrain it, same safety net as generatePageDraftAction.ts /
    // generateSeoSuggestionsAction.ts.
    return { altText: altTextSchema.parse(result.data) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to generate alt text.",
    };
  }
}
