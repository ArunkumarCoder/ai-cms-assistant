"use server";

import { requireUser } from "@/lib/auth/dal";
import { getActiveSiteForCurrentUser } from "@/lib/cms";
import {
  aiClient,
  blockRegenerationJsonSchema,
  blockRegenerationSchema,
} from "@/lib/ai";
import type { PageDraftBlock } from "@/lib/ai/schemas/pageDraft";
import type { ContentBlock, PageType } from "@/types";
import { buildBlockRegenerationPrompt } from "./prompt";

export interface RegenerateBlockInput {
  pageTitle: string;
  metaDescription: string;
  targetKeyword: string | null;
  pageType: PageType;
  audience?: string;
  tone?: string;
  contentBlocks: ContentBlock[];
  targetBlockId: string;
}

// Generates a suggestion only — never persists anything. This used to also
// auto-save through CmsAdapter.updatePage the moment a cmsDocumentId existed
// (i.e. the moment the page had already been saved once), which meant a
// regeneration on an already-saved page silently overwrote live content
// before anyone had reviewed the result — exactly the "silently replacing
// content" this task (SPEC.md §17) exists to fix. Persistence now only ever
// happens through saveDraftPageAction, the same single place every other
// content write already goes through, and only once a user explicitly
// accepts the diff GeneratePageForm now shows instead of applying this
// directly.
export type RegenerateBlockResult = { block: PageDraftBlock } | { error: string };

// Only heading/paragraph/cta are ever AI-generated content in a page draft
// (pageDraftSchema) — image/faq-schema blocks can exist on an already-saved
// page but were never something this screen produced, so they're not
// regeneration candidates.
function contentBlockToDraftBlock(block: ContentBlock): PageDraftBlock {
  switch (block.type) {
    case "heading": {
      const level = block.metadata?.level;
      return {
        type: "heading",
        content: block.content,
        level: level === 3 || level === 4 ? level : 2,
      };
    }
    case "paragraph":
      return { type: "paragraph", content: block.content };
    case "cta":
      return {
        type: "cta",
        content: block.content,
        href: typeof block.metadata?.href === "string" ? block.metadata.href : "#",
        openInNewTab: block.metadata?.openInNewTab === true,
      };
    default:
      throw new Error(
        `Cannot regenerate a "${block.type}" block — only heading, paragraph, ` +
          "and cta blocks come from page generation.",
      );
  }
}

export async function regenerateBlockAction(
  input: RegenerateBlockInput,
): Promise<RegenerateBlockResult> {
  const user = await requireUser();
  const site = await getActiveSiteForCurrentUser();

  const index = input.contentBlocks.findIndex(
    (block) => block.id === input.targetBlockId,
  );
  if (index === -1) {
    return { error: "That block no longer exists in this draft." };
  }
  const target = input.contentBlocks[index];

  let targetDraftBlock: PageDraftBlock;
  try {
    targetDraftBlock = contentBlockToDraftBlock(target);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "This block can't be regenerated.",
    };
  }

  const prompt = buildBlockRegenerationPrompt({
    pageTitle: input.pageTitle,
    metaDescription: input.metaDescription,
    targetKeyword: input.targetKeyword,
    pageType: input.pageType,
    audience: input.audience,
    tone: input.tone,
    brandVoice: site?.brandVoice ?? undefined,
    precedingBlockSummary: input.contentBlocks[index - 1]?.content,
    followingBlockSummary: input.contentBlocks[index + 1]?.content,
    targetBlock: targetDraftBlock,
  });

  let regenerated: PageDraftBlock;
  try {
    const result = await aiClient.generateStructured<{ block: PageDraftBlock }>(
      "block-regeneration",
      prompt,
      blockRegenerationJsonSchema,
      { context: { userId: user.id } },
    );
    regenerated = blockRegenerationSchema.parse(result.data).block;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to regenerate this block.",
    };
  }

  // Schema validation alone can't catch this — see blockRegeneration.ts's
  // top comment. A targeted single-block rewrite that comes back as a
  // different block type is treated as a failure, not silently accepted.
  if (regenerated.type !== target.type) {
    return {
      error:
        `The regenerated block came back as a "${regenerated.type}" instead of ` +
        `"${target.type}" — discarded, original kept.`,
    };
  }

  return { block: regenerated };
}
