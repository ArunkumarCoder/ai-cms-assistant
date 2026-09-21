// One entry per AI-produced shape in SPEC.md §3's call inventory that a
// feature exists (or is about to exist) to consume. Each schema is defined
// once, as a Zod schema converted to a plain JSON Schema via `z.toJSONSchema`
// — the same object every provider's `generateStructured`/
// `generateWithVision` receives, translated into that provider's own
// function-calling format inside its own file (../providers/), never
// duplicated per provider here. See each file's top comment for why its
// shape omits/adds fields relative to the domain type (`src/types/`) it's
// closest to.
//
// Not yet covered: call #7 (FAQ schema/JSON-LD formatting). Flagged here
// rather than silently absent — see SPEC.md §3's table. Call #2 (single-block
// regeneration) is now covered by ./blockRegeneration.ts.
export {
  pageDraftBlockSchema,
  pageDraftJsonSchema,
  pageDraftSchema,
  type PageDraft,
  type PageDraftBlock,
} from "./pageDraft";
export {
  blockRegenerationJsonSchema,
  blockRegenerationSchema,
  type BlockRegeneration,
} from "./blockRegeneration";
export {
  seoBreakdownSchema,
  seoSuggestionSchema,
  seoSuggestionsJsonSchema,
  seoSuggestionsSchema,
  type SeoBreakdown,
  type SeoSuggestion,
  type SeoSuggestions,
} from "./seoSuggestions";
export {
  faqItemDraftSchema,
  faqListJsonSchema,
  faqListSchema,
  type FaqItemDraft,
  type FaqList,
} from "./faqList";
export { altTextJsonSchema, altTextSchema, type AltText } from "./altText";
export {
  qualityScoreJsonSchema,
  qualityScoreSchema,
  qualitySubScoreSchema,
  type QualityScore,
  type QualitySubScore,
} from "./qualityScore";
