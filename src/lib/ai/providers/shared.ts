import { AiProviderError } from "../types";
import type { AiProviderName, TokenUsage } from "../types";

// Shared between OpenAiProvider and GroqProvider: Groq's chat API is
// OpenAI-compatible (same chat.completions shape, same
// prompt_tokens/completion_tokens usage fields), so both translate the same
// response shape identically. AnthropicProvider doesn't use this — Claude's
// Messages API has a different shape entirely (content blocks,
// input_tokens/output_tokens).

export function toChatUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
}): TokenUsage {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

export function parseJsonContent<T>(
  provider: AiProviderName,
  raw: string | null | undefined,
): T {
  if (!raw) {
    throw new AiProviderError(provider, "No structured content returned.");
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new AiProviderError(
      provider,
      `Failed to parse structured JSON output: ${(err as Error).message}`,
      { cause: err },
    );
  }
}
