import { AiProviderError } from "./types";

// Every AI-calling Server Action used to format a caught error the same
// way — `err instanceof Error ? err.message : fallback` — which meant a raw
// provider error (a 429's technical message, an SDK-specific phrasing)
// reached the user unchanged. Extracted here so "a clear 'try again in a
// moment' message where a delay isn't practical" (task item 2, for
// interactive single-call actions — the batch queue's own resilience is the
// rate limiter/backoff in ./rateLimit.ts and ./retry.ts instead) is one
// sentence written once, not five near-duplicates that could drift.
//
// Only fires for a *retryable* AiProviderError (./retry.ts's toProviderError
// sets this based on the failure mode — a 429/5xx/timeout that exhausted its
// retry budget, not a 400/401 the caller sent wrong). Anything else still
// gets its real message, since "try again in a moment" would be actively
// misleading for a genuinely non-transient failure (bad input, a schema
// mismatch, an auth problem) that retrying can't fix.
export function describeAiActionFailure(err: unknown, fallback: string): string {
  if (err instanceof AiProviderError && err.retryable) {
    return "The AI provider is busy right now — please try again in a moment.";
  }
  return err instanceof Error ? err.message : fallback;
}
