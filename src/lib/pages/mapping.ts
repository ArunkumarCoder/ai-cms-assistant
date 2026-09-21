import type { ContentBlock } from "@/types";
import type { PageDraftBlock } from "@/lib/ai/schemas/pageDraft";

// The one place a PageDraftBlock (AI-shape, src/lib/ai/schemas/pageDraft.ts)
// becomes a ContentBlock (CMS-adapter-shape, src/types/content-block.ts) —
// shared by saveDraftPageAction.ts and regenerateBlockAction.ts so this
// translation isn't duplicated. `id`/`order` are assigned by the caller (the
// AI only ever owns content), matching pageDraft.ts's own top comment.
export function draftBlockToContentBlock(
  block: PageDraftBlock,
  id: string,
  order: number,
): ContentBlock {
  switch (block.type) {
    case "heading":
      return {
        id,
        type: "heading",
        order,
        content: block.content,
        metadata: { level: block.level },
      };
    case "paragraph":
      return { id, type: "paragraph", order, content: block.content };
    case "cta":
      return {
        id,
        type: "cta",
        order,
        content: block.content,
        metadata: { href: block.href, openInNewTab: block.openInNewTab },
      };
    default:
      throw new Error(
        `Unknown page-draft block type: ${(block as PageDraftBlock).type}`,
      );
  }
}
