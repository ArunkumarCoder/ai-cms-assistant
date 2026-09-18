import * as z from "zod";
import type { JsonSchema } from "../types";

// Canonical output shape for AiCallType "faq-generation" (SPEC.md §3, call
// #6). Mirrors `FaqItem` (src/types/faq-item.ts) minus `id`/`pageId` (assigned
// when persisted), `order` (array position once saved), and `source` (always
// "ai-generated" when this call produced it — the app sets that, the model
// never does; a manually-added FAQ never goes through this schema at all).
//
// `min(3).max(8)` directly encodes SPEC.md journey (d) step 2's "3–8
// question/answer pairs." Wrapped in an object rather than a bare array
// because Anthropic's structured-output path forces a single tool call whose
// `input` is always a JSON object (see AnthropicProvider.generateStructured's
// `tools`/`tool_choice`) — a top-level array schema isn't representable
// there, so every schema in this directory has an object root.
export const faqItemDraftSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const faqListSchema = z.object({
  faqItems: z.array(faqItemDraftSchema).min(3).max(8),
});

export type FaqItemDraft = z.infer<typeof faqItemDraftSchema>;
export type FaqList = z.infer<typeof faqListSchema>;

export const faqListJsonSchema: JsonSchema = z.toJSONSchema(faqListSchema);
