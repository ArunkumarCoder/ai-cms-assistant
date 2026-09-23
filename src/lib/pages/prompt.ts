import type { PageType } from "@/types";
import type { PageDraftBlock } from "@/lib/ai/schemas/pageDraft";

// Pure prompt-building, deliberately kept out of the "use server" action
// files (generatePageDraftAction.ts / regenerateBlockAction.ts) so it's
// unit-testable with no aiClient mock at all. `brandVoice` is filled in by
// the calling action from the current Site's own field
// (getActiveSiteForCurrentUser, src/lib/cms/resolveAdapter.ts) — the client
// never sends it, since it belongs to the Site, not to a one-off brief.

export interface PageBrief {
  title: string;
  targetKeyword: string;
  audience: string;
  keyPoints: string;
  tone: string;
  pageType: PageType;
  brandVoice?: string;
}

export function buildPageGenerationPrompt(brief: PageBrief): string {
  return [
    `Write a ${brief.pageType} page draft.`,
    `Working title: ${brief.title}`,
    brief.targetKeyword ? `Target SEO keyword: ${brief.targetKeyword}` : null,
    brief.audience ? `Target audience: ${brief.audience}` : null,
    brief.tone ? `Tone: ${brief.tone}` : null,
    brief.brandVoice ? `Brand voice / style guide to follow:\n${brief.brandVoice}` : null,
    brief.keyPoints ? `Key points to cover:\n${brief.keyPoints}` : null,
    "Return a title, a URL slug, a meta description, and an ordered list of " +
      "content blocks (headings, paragraphs, and a closing call-to-action).",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export interface BlockRegenerationContext {
  pageTitle: string;
  metaDescription: string;
  targetKeyword: string | null;
  pageType: PageType;
  audience?: string;
  tone?: string;
  brandVoice?: string;
  // Content of the immediately preceding/following block, if any — enough
  // surrounding context for the regenerated block to still fit the page,
  // without handing the model the whole contentBlocks array (that
  // aggregation is the action's job; this function stays a small pure one).
  precedingBlockSummary?: string;
  followingBlockSummary?: string;
  targetBlock: PageDraftBlock;
}

export function buildBlockRegenerationPrompt(
  ctx: BlockRegenerationContext,
): string {
  return [
    `This is one block from a ${ctx.pageType} page titled "${ctx.pageTitle}".`,
    ctx.metaDescription ? `Page meta description: ${ctx.metaDescription}` : null,
    ctx.targetKeyword ? `Target SEO keyword: ${ctx.targetKeyword}` : null,
    ctx.audience ? `Target audience: ${ctx.audience}` : null,
    ctx.tone ? `Tone: ${ctx.tone}` : null,
    ctx.brandVoice ? `Brand voice / style guide to follow:\n${ctx.brandVoice}` : null,
    ctx.precedingBlockSummary
      ? `The block right before this one says: "${ctx.precedingBlockSummary}"`
      : null,
    ctx.followingBlockSummary
      ? `The block right after this one says: "${ctx.followingBlockSummary}"`
      : null,
    `The block to rewrite is a "${ctx.targetBlock.type}" block that currently ` +
      `says: "${ctx.targetBlock.content}"`,
    `Rewrite just this block so it still fits between its neighbors and the ` +
      `page's overall topic. Keep it a "${ctx.targetBlock.type}" block — do ` +
      `not change its type.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
