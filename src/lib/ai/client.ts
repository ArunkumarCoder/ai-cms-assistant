import type { AiProvider } from "./adapter";
import { getProvider } from "./providers/registry";
import { resolveProviderName } from "./routing";
import { estimateCostUsd } from "./pricing";
import { logAiCall } from "./logging";
import type {
  AiCallType,
  AiStructuredResult,
  AiTextResult,
  GenerateOptions,
  JsonSchema,
} from "./types";

// The single entry point feature code (tomorrow's task: structured output
// schemas for every AI feature) actually calls — composes routing (task item
// 3) and logging (task item 4) around the raw AiProvider interface (task
// items 1/2), so a feature just names which call it's making and gets a
// resolved provider, retries/timeouts (already inside each provider via
// ./retry.ts), and a cost-logged call for free, without repeating any of
// that per feature. Exported as a plain object of functions, not a class —
// there's no per-instance state to hold (routing/provider resolution is
// already cached at the module level in ./routing.ts and
// ./providers/registry.ts), so a class would just add a constructor nobody
// needs to call.
export const aiClient = {
  generate: (
    callType: AiCallType,
    prompt: string,
    options?: GenerateOptions,
  ): Promise<AiTextResult> =>
    runLogged(callType, options, (provider) =>
      provider.generate(prompt, options),
    ),

  generateStructured: <T = unknown>(
    callType: AiCallType,
    prompt: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> =>
    runLogged(callType, options, (provider) =>
      provider.generateStructured<T>(prompt, schema, options),
    ),

  generateWithVision: <T = unknown>(
    callType: AiCallType,
    prompt: string,
    imageUrl: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> =>
    runLogged(callType, options, (provider) =>
      provider.generateWithVision<T>(prompt, imageUrl, schema, options),
    ),
};

async function runLogged<T extends AiTextResult | AiStructuredResult<unknown>>(
  callType: AiCallType,
  options: GenerateOptions | undefined,
  run: (provider: AiProvider) => Promise<T>,
): Promise<T> {
  const providerName = resolveProviderName(callType);
  const provider = getProvider(providerName);
  const startedAt = Date.now();

  try {
    const result = await run(provider);
    await logAiCall({
      callType,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      estimatedCostUsd: estimateCostUsd(
        result.provider,
        result.model,
        result.usage,
      ),
      durationMs: Date.now() - startedAt,
      success: true,
      siteId: options?.context?.siteId,
      userId: options?.context?.userId,
    });
    return result;
  } catch (err) {
    // The provider (or the routed-to provider name, if it failed before
    // returning any result at all) is still known even on failure — a
    // dashboard needs failed-call cost/volume too, not just successes.
    await logAiCall({
      callType,
      provider: providerName,
      model: "unknown",
      usage: { inputTokens: 0, outputTokens: 0 },
      estimatedCostUsd: 0,
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      siteId: options?.context?.siteId,
      userId: options?.context?.userId,
    });
    throw err;
  }
}
