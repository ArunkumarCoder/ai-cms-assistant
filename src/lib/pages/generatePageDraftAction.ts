"use server";

import { requireUser } from "@/lib/auth/dal";
import { aiClient, describeAiActionFailure, pageDraftSchema, type PageDraft } from "@/lib/ai";
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
    // aiClient.generateStructured validates the response against
    // pageDraftSchema itself (with a bounded retry on a malformed shape,
    // SPEC.md's Day 31 task) — result.data is already a real PageDraft here,
    // not just a `T`-typed assertion over unchecked JSON.
    const result = await aiClient.generateStructured(
      "page-generation",
      prompt,
      pageDraftSchema,
      { context: { userId: user.id, siteId: site?.id } },
    );
    const draft = result.data;
    return { draft: { ...draft, slug: slugify(draft.slug || draft.title) } };
  } catch (err) {
    return { error: describeAiActionFailure(err, "Failed to generate a page draft.") };
  }
}
