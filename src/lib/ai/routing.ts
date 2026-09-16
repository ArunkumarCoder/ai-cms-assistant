import type { AiCallType, AiProviderName } from "./types";

// Default routing table, per SPEC.md §3's "routing rule of thumb": Groq for
// text-only calls (fastest/cheapest for dev-time iteration), OpenAI for the
// one vision call in the inventory (Groq's vision support isn't guaranteed
// across its hosted models — see GroqProvider.generateWithVision). A plain
// config object, not an if/else buried in feature code (today's task item
// 3) — changing which provider handles a call, or adding a new call type,
// means editing this table, not hunting through page-generation/seo-audit/
// alt-text code for a hardcoded provider name.
const CALL_TYPE_PROVIDER: Record<AiCallType, AiProviderName> = {
  "page-generation": "groq",
  "block-regeneration": "groq",
  "seo-scoring": "groq",
  "alt-text-single": "openai",
  "alt-text-batch": "openai",
  "faq-generation": "groq",
  "faq-schema": "groq",
  "content-quality": "groq",
};

// Overridable per call type via env — `AI_ROUTE_<CALL_TYPE>=<provider>`, e.g.
// `AI_ROUTE_ALT_TEXT_SINGLE=anthropic` — without a code change or redeploy.
// This is what makes SPEC.md's "consider Claude Haiku as a vision fallback if
// OpenAI is unavailable" note actionable rather than aspirational: swapping
// providers for one call type is an env var, not a patch.
export function resolveProviderName(callType: AiCallType): AiProviderName {
  const envKey = `AI_ROUTE_${callType.replace(/-/g, "_").toUpperCase()}`;
  const override = process.env[envKey];
  if (isProviderName(override)) return override;
  return CALL_TYPE_PROVIDER[callType];
}

function isProviderName(value: string | undefined): value is AiProviderName {
  return value === "openai" || value === "anthropic" || value === "groq";
}
