// Provider-agnostic AI client (OpenAI, Claude, Groq) lives here. The
// interface, three provider implementations, routing, call logging, and
// (./schemas/) a canonical structured-output schema per AI-produced shape
// all exist. Page generation and block regeneration (`src/lib/pages/`) are
// the first features to call through this layer; SEO, alt text, and FAQs
// still don't. See SPEC.md §3 and ./adapter.ts's top comment for the full
// design reasoning.
export type { AiProvider } from "./adapter";
export type {
  AiCallType,
  AiProviderName,
  AiStructuredResult,
  AiTextResult,
  GenerateOptions,
  JsonSchema,
  TokenUsage,
} from "./types";
export { AiProviderError } from "./types";
export { aiClient } from "./client";
export { resolveProviderName } from "./routing";
export { getProvider } from "./providers/registry";
export { estimateCostUsd } from "./pricing";
export * from "./schemas";
