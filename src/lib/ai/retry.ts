import { AiProviderError } from "./types";
import type { AiProviderName } from "./types";

export interface RetryOptions {
  provider: AiProviderName;
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 300;
// A per-minute rate limit doesn't clear in hundreds of milliseconds — the
// generic transient-error backoff above is sized for a momentary 5xx blip,
// not a sustained 429. Used only when the provider's own response doesn't
// say how long to actually wait (see extractRetryAfterMs) — a 2s/4s/8s
// schedule at least has a real chance of landing after the window rolls,
// which the old uniform 300ms schedule never did for a genuine rate limit.
const RATE_LIMIT_BASE_BACKOFF_MS = 2_000;

// Every provider call goes through this — the one place "don't let one slow
// provider hang the whole request" is enforced, instead of each of the three
// providers reimplementing timeout/retry policy slightly differently.
// `attempt` receives a fresh AbortSignal per try (not one shared signal
// across retries), so a retried call gets its own full timeout window rather
// than whatever was left of the first attempt's.
export async function withTimeoutAndRetry<T>(
  attempt: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: unknown;
  let timedOut = false;

  for (let attemptIndex = 0; attemptIndex <= maxRetries; attemptIndex++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await attempt(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      timedOut = controller.signal.aborted;
      if (attemptIndex === maxRetries || !isRetryable(err, timedOut)) {
        throw toProviderError(options.provider, err, timedOut);
      }
      await sleep(backoffMsFor(err, attemptIndex));
    }
  }

  // Unreachable (the loop above always returns or throws) — satisfies
  // TypeScript's control-flow analysis without an unsafe cast.
  throw toProviderError(options.provider, lastError, timedOut);
}

// 429 (rate limited) and 5xx (provider-side) are worth retrying; a timeout is
// always worth retrying once (the provider may just have been slow this
// time); anything else with a known HTTP status (400/401/403/404 — bad
// input, bad auth, unknown resource) never is, since retrying won't change
// the outcome. An error with no discernible status (a raw network failure)
// is treated as transient — better to retry once than to give up on a blip.
function isRetryable(err: unknown, timedOut: boolean): boolean {
  if (timedOut) return true;
  const status = (err as { status?: number } | null | undefined)?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return true;
}

function isRateLimited(err: unknown): boolean {
  return (err as { status?: number } | null | undefined)?.status === 429;
}

// Providers that send a `Retry-After` header are telling us exactly how long
// their rate-limit window has left — honoring it beats guessing. Checked in
// a couple of shapes defensively (a Headers-like object with `.get`, or a
// plain object some SDKs/mocks use instead) since this project doesn't
// control what shape a given provider SDK's thrown error takes; returns
// `null` on anything unrecognized rather than risking a wrong wait.
function extractRetryAfterMs(err: unknown): number | null {
  const candidate = err as { headers?: unknown; response?: { headers?: unknown } } | null | undefined;
  const headers = candidate?.headers ?? candidate?.response?.headers;
  if (!headers) return null;

  let raw: string | null | undefined;
  if (typeof (headers as { get?: unknown }).get === "function") {
    raw = (headers as { get(name: string): string | null }).get("retry-after");
  } else if (typeof headers === "object") {
    raw = (headers as Record<string, string | undefined>)["retry-after"];
  }
  if (!raw) return null;

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds * 1000;
}

function backoffMsFor(err: unknown, attemptIndex: number): number {
  if (isRateLimited(err)) {
    return extractRetryAfterMs(err) ?? RATE_LIMIT_BASE_BACKOFF_MS * 2 ** attemptIndex;
  }
  return BASE_BACKOFF_MS * 2 ** attemptIndex;
}

function toProviderError(
  provider: AiProviderName,
  err: unknown,
  timedOut: boolean,
): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const message = timedOut
    ? `${provider} request timed out.`
    : err instanceof Error
      ? err.message
      : String(err);
  // `retryable` reflects the *failure mode*, not whether retries were
  // actually attempted — a 429/5xx/timeout that exhausted its retry budget
  // is still a condition where trying again later has a real chance of
  // working, unlike a 400/401/403 the caller sent wrong. Feature code (see
  // src/lib/ai/errorMessage.ts) reads this to show "try again in a moment"
  // instead of a raw technical message for exactly this case.
  return new AiProviderError(provider, message, {
    retryable: isRetryable(err, timedOut),
    cause: err,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
