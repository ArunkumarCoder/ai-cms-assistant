"use server";

import { requireUser } from "@/lib/auth/dal";
import {
  aiClient,
  describeAiActionFailure,
  faqListJsonSchema,
  faqListSchema,
  type FaqItemDraft,
} from "@/lib/ai";
import { getActiveSiteForCurrentUser } from "@/lib/cms";
import { extractParagraphText, extractWords } from "@/lib/seo";
import type { ContentBlock, PageType } from "@/types";
import { buildFaqGenerationPrompt } from "./prompt";

// Below this many words of body text, faqListSchema's required 3-8 items
// (Day 10) would force the model to pad out real answers with invented or
// generic filler rather than reject the request outright — better to refuse
// before spending an AI call than to generate FAQs not actually grounded in
// the page, per this task's own "don't invent facts" instruction (prompt.ts).
const MIN_CONTENT_WORDS = 40;

export interface GenerateFaqListInput {
  title: string;
  pageType: PageType;
  contentBlocks: ContentBlock[];
}

export type GenerateFaqListResult = { faqItems: FaqItemDraft[] } | { error: string };

export async function generateFaqListAction(
  input: GenerateFaqListInput,
): Promise<GenerateFaqListResult> {
  const user = await requireUser();
  // No connected Site (or one with no brand voice set) just means the
  // prompt omits that line — generation shouldn't require a Site to work,
  // same reasoning generatePageDraftAction.ts already applies.
  const site = await getActiveSiteForCurrentUser();

  const bodyText = extractParagraphText(input.contentBlocks);
  if (extractWords(bodyText).length < MIN_CONTENT_WORDS) {
    return {
      error:
        "This page doesn't have enough body content yet to generate meaningful FAQs — add some paragraphs first.",
    };
  }

  try {
    const prompt = buildFaqGenerationPrompt({
      title: input.title,
      pageType: input.pageType,
      contentBlocks: input.contentBlocks,
      brandVoice: site?.brandVoice ?? undefined,
    });
    const result = await aiClient.generateStructured<{ faqItems: FaqItemDraft[] }>(
      "faq-generation",
      prompt,
      faqListJsonSchema,
      { context: { userId: user.id, siteId: site?.id } },
    );
    // Re-validate the provider's own JSON output against the same schema
    // used to constrain it, same safety net as every other AI action.
    return { faqItems: faqListSchema.parse(result.data).faqItems };
  } catch (err) {
    return { error: describeAiActionFailure(err, "Failed to generate FAQs.") };
  }
}
