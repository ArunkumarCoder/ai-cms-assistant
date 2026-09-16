// Shared shapes for the AI adapter layer (./adapter.ts and every provider
// under ./providers/). Mirrors src/lib/cms/types.ts's role for CmsAdapter:
// small, provider-agnostic types every implementation trades in, so no
// provider file needs to invent its own response shape.

export type AiProviderName = "openai" | "anthropic" | "groq";

// One entry per AI call in SPEC.md §3's inventory (FAQ schema formatting is
// kept separate from faq-generation per that section's own note, pending a
// possible future merge). The routing layer (./routing.ts) maps each to a
// provider; feature code — none exists yet, tomorrow's task — names the call
// type it's making, never the provider, so changing a call's provider means
// editing routing config, not hunting through feature code.
export type AiCallType =
  | "page-generation"
  | "block-regeneration"
  | "seo-scoring"
  | "alt-text-single"
  | "alt-text-batch"
  | "faq-generation"
  | "faq-schema"
  | "content-quality";

// A plain JSON Schema object, not a Zod schema — see adapter.ts's top comment
// for why. `Record<string, unknown>` rather than a typed JSON-Schema shape
// because every provider only ever passes this through to its own SDK
// untouched; this layer never inspects it.
export type JsonSchema = Record<string, unknown>;

export interface GenerateOptions {
  temperature?: number;
  maxOutputTokens?: number;
  // Per-call overrides for ./retry.ts's defaults — most callers should never
  // need these; they exist for a feature that knows its own prompt is
  // unusually large/slow (e.g. a full-page SEO audit) or unusually cheap to
  // just fail fast on (e.g. a single block regeneration).
  timeoutMs?: number;
  maxRetries?: number;
  // Attribution for ./logging.ts, not sent to the provider. Optional because
  // most calls during initial development have no signed-in user/site
  // context (e.g. this layer's own tests); once feature code calls through
  // ./client.ts for real, threading these through is what lets the Phase 5
  // cost dashboard break spend down per client site, not just per call type.
  context?: { siteId?: string; userId?: string };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiTextResult {
  text: string;
  usage: TokenUsage;
  provider: AiProviderName;
  model: string;
}

export interface AiStructuredResult<T> {
  data: T;
  usage: TokenUsage;
  provider: AiProviderName;
  model: string;
}

// Thrown by every provider (and ./retry.ts, which wraps whatever a provider's
// own SDK throws) on real failure — auth, network, a malformed/missing
// response. Mirrors CmsAdapter's "throw on real failures" convention
// (src/lib/cms/adapter.ts design note 3); unlike CmsAdapter there's no
// legitimate "not found" result for an AI call to distinguish from failure,
// so there's only this one error type, not a null-vs-throw split.
export class AiProviderError extends Error {
  readonly provider: AiProviderName;
  readonly retryable: boolean;

  constructor(
    provider: AiProviderName,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AiProviderError";
    this.provider = provider;
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
