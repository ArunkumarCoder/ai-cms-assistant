"use server";

import { requireUser } from "@/lib/auth/dal";
import { aiClient, pageDraftJsonSchema, pageDraftSchema, type PageDraft } from "@/lib/ai";
import { getActiveSiteForCurrentUser } from "@/lib/cms";
import { buildPageGenerationPrompt, type PageBrief } from "./prompt";
import { slugify } from "./slugify";

// Part A: brief -> AI draft. No CMS call here — the draft lives in the
// client's local state (src/components/GeneratePageForm.tsx) until the user
// explicitly saves it (saveDraftPageAction.ts).
export type GeneratePageDraftResult = { draft: PageDraft } | { error: string };

export async function generatePageDraftAction(
  brief: PageBrief,
): Promise<GeneratePageDraftResult> {
  const user = await requireUser();
  // No connected Site (or one with no brand voice set) just means the
  // prompt omits that line — generation shouldn't require a Site to work.
  const site = await getActiveSiteForCurrentUser();

  try {
    const prompt = buildPageGenerationPrompt({ ...brief, brandVoice: site?.brandVoice ?? undefined });
    const result = await aiClient.generateStructured<PageDraft>(
      "page-generation",
      prompt,
      pageDraftJsonSchema,
      { context: { userId: user.id } },
    );
    // Re-validate the provider's own JSON output against the same schema
    // used to constrain it — generateStructured's `T` type param is a
    // compile-time assertion, not a runtime guarantee.
    const draft = pageDraftSchema.parse(result.data);
    return { draft: { ...draft, slug: slugify(draft.slug || draft.title) } };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to generate a page draft.",
    };
  }
}
