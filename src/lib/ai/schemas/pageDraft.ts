import * as z from "zod";
import type { JsonSchema } from "../types";

// Canonical output shape for AiCallType "page-generation" (SPEC.md §3, call
// #1) — the one schema `generateStructured` is called with; no provider gets
// its own copy (see adapter.ts's top comment: provider-specific translation
// of this schema, e.g. Anthropic's forced tool-use wrapping, stays inside
// that provider's own file).
//
// Mirrors `Page` (src/types/page.ts) minus every field that isn't the AI's
// to produce: `id`/`siteId`/`cmsDocumentId`/`status`/`latestSeoAuditId`/
// `faqItems`/`qualityScore`/`createdAt`/`updatedAt` are either app-assigned
// bookkeeping or populated by a later, separate AI call (FAQs, quality
// score) — same "omit what the caller doesn't generate" precedent as
// CmsAdapter's `CreatePageInput` (SPEC.md §6).
//
// `contentBlocks` narrows `ContentBlock`'s five-member type union down to
// the three SPEC.md's journey (a) actually asks a page draft to produce
// (headings, paragraphs, a CTA) — `image`/`faq-schema` blocks are never
// authored by this call (images are a separate asset flow; FAQ schema is
// generated from `FaqItem[]` at render time, per SPEC.md §4). Each block
// variant's `metadata` bag becomes explicit typed fields instead of
// `ContentBlock`'s generic `Record<string, unknown>`, since a JSON Schema
// (unlike the TS type) needs a real shape to constrain the model to
// producing. `id`/`order` are assigned by the app after generation (a fresh
// id per block; order = array position) — the AI only owns content.
const headingBlockSchema = z.object({
  type: z.literal("heading"),
  content: z.string(),
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

const paragraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  content: z.string(),
});

const ctaBlockSchema = z.object({
  type: z.literal("cta"),
  content: z.string(),
  href: z.string(),
  openInNewTab: z.boolean(),
});

export const pageDraftBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  ctaBlockSchema,
]);

export const pageDraftSchema = z.object({
  title: z.string(),
  slug: z.string(),
  metaDescription: z.string(),
  // Nullable, not optional: OpenAI's strict `json_schema` mode requires
  // every property to be listed in `required` — a field that's merely
  // absent-when-not-required isn't representable there. Modeling "the AI has
  // no suggested keyword" as `null` keeps one canonical schema valid across
  // all three providers instead of needing a provider-specific patch.
  targetKeyword: z.string().nullable(),
  contentBlocks: z.array(pageDraftBlockSchema).min(1),
});

export type PageDraftBlock = z.infer<typeof pageDraftBlockSchema>;
export type PageDraft = z.infer<typeof pageDraftSchema>;

export const pageDraftJsonSchema: JsonSchema = z.toJSONSchema(pageDraftSchema);
