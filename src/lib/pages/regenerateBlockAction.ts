"use server";

import { requireUser } from "@/lib/auth/dal";
import { getAdapterForCurrentUser } from "@/lib/cms";
import {
  aiClient,
  blockRegenerationJsonSchema,
  blockRegenerationSchema,
} from "@/lib/ai";
import type { PageDraftBlock } from "@/lib/ai/schemas/pageDraft";
import type { ContentBlock, PageType } from "@/types";
import { buildBlockRegenerationPrompt } from "./prompt";
import { draftBlockToContentBlock } from "./mapping";

export interface RegenerateBlockInput {
  // Present once the page has been saved at least once — arms auto-persist
  // below. Absent means the draft is still local-state-only (nothing to
  // persist to yet), so a regeneration only ever updates the client's copy.
  cmsDocumentId?: string;
  pageTitle: string;
  metaDescription: string;
  targetKeyword: string | null;
  pageType: PageType;
  audience?: string;
  tone?: string;
  contentBlocks: ContentBlock[];
  targetBlockId: string;
}

// One success/failure signal, not two — the client never has to reconcile a
// "regenerated but not saved" partial state. A failure at any step (AI call,
// type mismatch, or the persisting updatePage call) returns `{ error }` and
// leaves the caller's own copy of the block untouched.
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

  if (!input.cmsDocumentId) {
    return { block: regenerated };
  }

  try {
    const adapter = await getAdapterForCurrentUser();
    const merged = input.contentBlocks.map((block, i) =>
      i === index
        ? draftBlockToContentBlock(regenerated, target.id, target.order)
        : block,
    );
    await adapter.updatePage(input.cmsDocumentId, { contentBlocks: merged });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Regenerated the block but failed to save it.",
    };
  }

  return { block: regenerated };
}
