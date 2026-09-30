import type { AiProvider } from "./adapter";
import { getProvider } from "./providers/registry";
import { resolveProviderName } from "./routing";
import { estimateCostUsd } from "./pricing";
import { logAiCall } from "./logging";
import { waitForRateLimitSlot } from "./rateLimit";
import type {
  AiCallType,
  AiProviderName,
  AiStructuredResult,
  AiTextResult,
  GenerateOptions,
  JsonSchema,
} from "./types";

// The single entry point feature code actually calls — composes routing,
// logging, proactive per-provider rate limiting (./rateLimit.ts, SPEC.md
// §21), and provider fallback around the raw AiProvider interface, so a
// feature just names which call it's making and gets all of that for free,
// without repeating any of it per feature. Exported as a plain object of
// functions, not a class — there's no per-instance state to hold (routing/
// provider resolution is already cached at the module level in ./routing.ts
// and ./providers/registry.ts), so a class would just add a constructor
// nobody needs to call.
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

// Only Groq gets a fallback target — task's own framing ("this matters most
// for Groq, since its free-tier limits are noticeably tighter than paid
// OpenAI/Claude") and the reasoning is directional: OpenAI/Anthropic are
// already the more reliable, generously-limited paid tier, so there's little
// to gain routing *their* failures elsewhere, and Groq's tight free tier
// makes a poor fallback target for anything. OpenAI over Anthropic here
// because it already has a complete, tested implementation of all three
// AiProvider methods including vision, making it a strictly capable
// universal fallback for whatever Groq was asked to do.
const FALLBACK_PROVIDER: Partial<Record<AiProviderName, AiProviderName>> = {
  groq: "openai",
};

type RunFn<T> = (provider: AiProvider) => Promise<T>;

async function runLogged<T extends AiTextResult | AiStructuredResult<unknown>>(
  callType: AiCallType,
  options: GenerateOptions | undefined,
  run: RunFn<T>,
): Promise<T> {
  const providerName = resolveProviderName(callType);
  await waitForRateLimitSlot(providerName);
  const provider = getProvider(providerName);
  const startedAt = Date.now();

  try {
    const result = await run(provider);
    await logSuccess(callType, result, startedAt, options);
    return result;
  } catch (primaryErr) {
    // The provider (or the routed-to provider name, if it failed before
    // returning any result at all) is still known even on failure — a
    // dashboard needs failed-call cost/volume too, not just successes.
    await logFailure(callType, providerName, primaryErr, startedAt, options);

    const fallbackProviderName = FALLBACK_PROVIDER[providerName];
    if (!fallbackProviderName) throw primaryErr;

    // "Log that a fallback occurred, don't silently swap providers without a
    // trace" — the fallback attempt gets its own log row either way
    // (success or failure), tagged with `fallbackFrom`, distinct from the
    // primary failure row logged just above. If the fallback also fails,
    // the *primary* provider's error is what gets thrown — that's the
    // provider routing.ts actually configured for this call type, so it's
    // the more relevant root cause to surface to the caller than the
    // fallback's own (secondary) failure.
    await waitForRateLimitSlot(fallbackProviderName);
    const fallbackProvider = getProvider(fallbackProviderName);
    const fallbackStartedAt = Date.now();
    try {
      const result = await run(fallbackProvider);
      await logSuccess(callType, result, fallbackStartedAt, options, providerName);
      return result;
    } catch (fallbackErr) {
      await logFailure(callType, fallbackProviderName, fallbackErr, fallbackStartedAt, options, providerName);
      throw primaryErr;
    }
  }
}

async function logSuccess<T extends AiTextResult | AiStructuredResult<unknown>>(
  callType: AiCallType,
  result: T,
  startedAt: number,
  options: GenerateOptions | undefined,
  fallbackFrom?: AiProviderName,
): Promise<void> {
  await logAiCall({
    callType,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    estimatedCostUsd: estimateCostUsd(result.provider, result.model, result.usage),
    durationMs: Date.now() - startedAt,
    success: true,
    siteId: options?.context?.siteId,
    userId: options?.context?.userId,
    fallbackFrom,
  });
}

async function logFailure(
  callType: AiCallType,
  providerName: AiProviderName,
  err: unknown,
  startedAt: number,
  options: GenerateOptions | undefined,
  fallbackFrom?: AiProviderName,
): Promise<void> {
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
    fallbackFrom,
  });
}
