import * as z from "zod";
import type { AiProvider } from "./adapter";
import { getProvider } from "./providers/registry";
import { resolveProviderName } from "./routing";
import { estimateCostUsd } from "./pricing";
import { logAiCall } from "./logging";
import { waitForRateLimitSlot } from "./rateLimit";
import { AiValidationError, appendValidationFeedback } from "./validation";
import type {
  AiCallType,
  AiProviderName,
  AiStructuredResult,
  AiTextResult,
  GenerateOptions,
  JsonSchema,
} from "./types";

// Up to 2 retries (3 attempts total) when a provider's response parses as
// JSON but fails the caller's Zod schema — "a bounded retry (once or
// twice)," never unbounded, and never silently returning data that failed
// validation. Each attempt goes through runLogged's own provider resolution/
// rate-limit/fallback machinery unchanged, so a validation failure on a
// Groq-routed call can still fall back to OpenAI exactly like a transport
// failure would (a bonus of reusing that machinery, not something this layer
// has to reimplement) — the worst case is a few provider calls, never an
// unbounded loop, and every retry's prompt still derives from the *original*
// prompt plus that attempt's own feedback, not a compounding chain.
const MAX_VALIDATION_ATTEMPTS = 3;

// The single entry point feature code actually calls — composes routing,
// logging, proactive per-provider rate limiting (./rateLimit.ts, SPEC.md
// §21), provider fallback, and (for the two structured-output methods)
// schema validation with a bounded, feedback-driven retry around the raw
// AiProvider interface, so a feature just names which call it's making and
// gets all of that for free, without repeating any of it per feature.
// Exported as a plain object of functions, not a class — there's no
// per-instance state to hold (routing/provider resolution is already cached
// at the module level in ./routing.ts and ./providers/registry.ts), so a
// class would just add a constructor nobody needs to call.
//
// `generateStructured`/`generateWithVision` take a Zod schema, not a plain
// JsonSchema — this is the one layer where Zod enters the picture (every
// `AiProvider` implementation still only ever sees a converted JsonSchema,
// per adapter.ts's own design note on why providers can't depend on Zod).
// Day 10's five feature call sites used to each convert their own schema to
// JSON (for the provider) *and* re-run `schema.parse(result.data)`
// themselves afterward — identical, hand-duplicated validation in five
// places, and none of them retried on failure. Centralizing it here means a
// caller gets an already-validated, already-typed `T` back; there's nothing
// left to `.parse()` downstream, and nowhere a malformed shape could leak
// into a feature and get saved to a CMS.
export const aiClient = {
  generate: (
    callType: AiCallType,
    prompt: string,
    options?: GenerateOptions,
  ): Promise<AiTextResult> =>
    runLogged(callType, options, (provider) =>
      provider.generate(prompt, options),
    ),

  generateStructured: <T>(
    callType: AiCallType,
    prompt: string,
    schema: z.ZodType<T>,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> =>
    runValidated(callType, prompt, schema, options, (provider, p, jsonSchema) =>
      provider.generateStructured<unknown>(p, jsonSchema, options),
    ),

  generateWithVision: <T>(
    callType: AiCallType,
    prompt: string,
    imageUrl: string,
    schema: z.ZodType<T>,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> =>
    runValidated(callType, prompt, schema, options, (provider, p, jsonSchema) =>
      provider.generateWithVision<unknown>(p, imageUrl, jsonSchema, options),
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

// Wraps runLogged with schema validation plus the bounded, feedback-driven
// retry described at MAX_VALIDATION_ATTEMPTS above. Validation happens
// *inside* the function passed to runLogged, not after it returns — so a
// shape-invalid response is logged through the exact same logFailure path as
// any other failed attempt (provider, callType, and AiValidationError's own
// message already carry "which check failed," satisfying SPEC.md's logging
// requirement with zero new logging code) rather than needing a second,
// separate log call alongside a misleading "success" row for a response that
// was actually useless.
async function runValidated<T>(
  callType: AiCallType,
  initialPrompt: string,
  schema: z.ZodType<T>,
  options: GenerateOptions | undefined,
  call: (
    provider: AiProvider,
    prompt: string,
    jsonSchema: JsonSchema,
  ) => Promise<AiStructuredResult<unknown>>,
): Promise<AiStructuredResult<T>> {
  const jsonSchema = z.toJSONSchema(schema);
  let prompt = initialPrompt;

  for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt++) {
    try {
      const result = await runLogged<AiStructuredResult<unknown>>(
        callType,
        options,
        async (provider) => {
          const raw = await call(provider, prompt, jsonSchema);
          const parsed = schema.safeParse(raw.data);
          if (!parsed.success) {
            throw new AiValidationError(callType, raw.provider, parsed.error.issues);
          }
          return { ...raw, data: parsed.data };
        },
      );
      // Safe: `result.data` was just produced by `schema.safeParse` above,
      // which narrows it to exactly `T` — the cast only restates that to the
      // type checker, since runLogged's own signature can't express "T, but
      // only once a specific closure has validated it."
      return result as AiStructuredResult<T>;
    } catch (err) {
      const isLastAttempt = attempt === MAX_VALIDATION_ATTEMPTS;
      if (!(err instanceof AiValidationError) || isLastAttempt) throw err;
      prompt = appendValidationFeedback(initialPrompt, err.issues);
    }
  }
  // Unreachable — every loop iteration above either returns or throws.
  throw new Error(`"${callType}": exhausted validation attempts without returning or throwing.`);
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
