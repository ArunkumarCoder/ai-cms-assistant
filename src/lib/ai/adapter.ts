import type {
  AiProviderName,
  AiStructuredResult,
  AiTextResult,
  GenerateOptions,
  JsonSchema,
} from "./types";

// The boundary between "the app" and "an AI provider" — the same shape of
// decision as CmsAdapter (src/lib/cms/adapter.ts): every AI feature in
// SPEC.md §3 needs to call a model, but none of them should care which one
// answered, or how that provider's SDK shapes a request/response. Everything
// below is something any of the three providers in scope (OpenAI, Anthropic,
// Groq) can do; provider-specific concerns (auth, request shape, which
// models exist, retry/timeout policy) stay inside that provider's own file
// under ./providers/.
//
// Three methods, not one, because SPEC.md's call inventory needs three
// distinct output shapes:
// - generate: plain text/completion (page-generation's draft prose, single-
//   block regeneration).
// - generateStructured: JSON-schema-constrained output (SEO scoring's
//   score+breakdown+suggestions, FAQ generation's Q&A array, FAQ schema
//   formatting) — every non-vision call in the inventory except plain text
//   wants shaped JSON back, not prose the caller has to parse by hand.
// - generateWithVision: the same schema-constrained contract as
//   generateStructured, plus an image — alt-text generation is the only
//   vision call in the inventory, and it still wants shaped output (today
//   just `{ altText: string }`), so this is a variant of
//   generateStructured, not a fourth unrelated capability.
//
// `schema` is a plain JSON Schema object (see ./types.ts's `JsonSchema`), not
// a Zod schema. Each provider translates that into whatever its own SDK
// wants — OpenAI's `response_format.json_schema`, Anthropic's forced
// tool-use `input_schema`, Groq's prompt-embedded `json_object` mode — a Zod
// schema would tie this interface to one runtime validation library and
// leak zod-specific behavior into providers that don't use it. Zod schemas
// (tomorrow's task, one per AI feature) live one layer above this interface
// and get converted to JSON Schema at the call site, the same way
// CmsAdapter's ContentBlock[] never leaks Portable Text upward.
export interface AiProvider {
  readonly name: AiProviderName;

  generate(prompt: string, options?: GenerateOptions): Promise<AiTextResult>;

  generateStructured<T = unknown>(
    prompt: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>>;

  generateWithVision<T = unknown>(
    prompt: string,
    imageUrl: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>>;
}
