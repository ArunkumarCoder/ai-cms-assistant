import type { TokenUsage } from "./types";

interface Rate {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Verified directly against each provider's own current pricing on
// 2026-09-29 (SPEC.md §20) — not re-derived from a training-data guess or a
// third-party aggregator: OpenAI's and Anthropic's own pricing pages, and
// Groq's own docs (console.groq.com/docs/deprecations, which also confirms
// llama-3.3-70b-versatile is still an active, recommended model as of that
// date — several SEO-aggregator sites turned up in that same check claiming
// otherwise, i.e. an "enterprise-only" cutover that Groq's own docs don't
// support, a good reminder to trust the primary source over scraped
// secondary ones). All three numbers below were already correct before this
// check; nothing needed to change, only this note.
//
// No separate "vision rate" for OpenAI's alt-text calls (generateWithVision,
// src/lib/images/generateAltTextAction.ts) — gpt-4o-mini bills an image by
// tokenizing it into ordinary input tokens already included in the API's own
// `usage.prompt_tokens`, not a flat per-image surcharge this file would need
// to add on top. The generic `inputPerMillion` rate below already covers it.
//
// Keyed by `${provider}:${model}` so a model swap can't silently mis-price a
// call under the old model's rate; an unrecognized key logs a cost of 0
// rather than guessing. Re-verify again if any of these three models change
// or a new one is added — pricing pages move, this file won't know on its
// own.
const RATES: Record<string, Rate> = {
  "groq:llama-3.3-70b-versatile": {
    inputPerMillion: 0.59,
    outputPerMillion: 0.79,
  },
  "openai:gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "anthropic:claude-haiku-4-5-20251001": {
    inputPerMillion: 1,
    outputPerMillion: 5,
  },
};

export function estimateCostUsd(
  provider: string,
  model: string,
  usage: TokenUsage,
): number {
  const rate = RATES[`${provider}:${model}`];
  if (!rate) return 0;
  return (
    (usage.inputTokens / 1_000_000) * rate.inputPerMillion +
    (usage.outputTokens / 1_000_000) * rate.outputPerMillion
  );
}
