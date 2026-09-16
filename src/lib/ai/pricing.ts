import type { TokenUsage } from "./types";

interface Rate {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Rough per-token rates, sourced from SPEC.md §3 (Groq at Llama 3.3 70B
// rates, OpenAI at GPT-4o-mini rates) plus a placeholder Claude Haiku rate
// for the vision fallback SPEC.md flags as worth considering — same
// "reverify against each provider's current pricing page" caveat as SPEC.md
// itself applies here. Keyed by `${provider}:${model}` so a model swap can't
// silently mis-price a call under the old model's rate; an unrecognized
// key logs a cost of 0 rather than guessing.
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
