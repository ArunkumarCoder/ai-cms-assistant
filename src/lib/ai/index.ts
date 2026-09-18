// Provider-agnostic AI client (OpenAI, Claude, Groq) lives here. The
// interface, three provider implementations, routing, call logging, and now
// (./schemas/) a canonical structured-output schema per AI-produced shape
// all exist; no feature (page generation, SEO, alt text, FAQs) calls any of
// it yet. See SPEC.md §3 and ./adapter.ts's top comment for the full design
// reasoning.
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
