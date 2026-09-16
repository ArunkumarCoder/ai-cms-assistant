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

// Every provider call goes through this — the one place "don't let one slow
// provider hang the whole request" (today's task item 2) is enforced,
// instead of each of the three providers reimplementing timeout/retry policy
// slightly differently. `attempt` receives a fresh AbortSignal per try (not
// one shared signal across retries), so a retried call gets its own full
// timeout window rather than whatever was left of the first attempt's.
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
      await sleep(BASE_BACKOFF_MS * 2 ** attemptIndex);
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
  return new AiProviderError(provider, message, {
    retryable: false,
    cause: err,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
