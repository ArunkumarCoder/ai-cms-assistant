import * as z from "zod";
import type { JsonSchema } from "../types";
import { pageDraftBlockSchema } from "./pageDraft";

// Canonical output shape for AiCallType "block-regeneration" (SPEC.md §3,
// call #2) — the schema pageDraft.ts's own top comment anticipated: this
// call reuses pageDraftBlockSchema wrapped in an object, rather than
// inventing a second block shape, since a regenerated block has to remain a
// valid page-draft block by construction. Object-root for the same reason
// every other schema in this directory is (see faqList.ts): Anthropic's
// structured-output path forces a single tool call whose `input` is always a
// JSON object, so a bare discriminated-union root isn't representable there.
//
// What this schema *can't* enforce: that the model kept the same block
// `type` it was asked to rewrite. `pageDraftBlockSchema`'s discriminated
// union happily validates a response that swapped, say, a heading into a cta
// — schema validation only confirms the result is *some* valid block, not
// the *same kind* of block. The caller (regenerateBlockAction.ts) is
// responsible for comparing `result.block.type` against the original block's
// type and rejecting a mismatch itself.
export const blockRegenerationSchema = z.object({
  block: pageDraftBlockSchema,
});

export type BlockRegeneration = z.infer<typeof blockRegenerationSchema>;

export const blockRegenerationJsonSchema: JsonSchema = z.toJSONSchema(
  blockRegenerationSchema,
);
