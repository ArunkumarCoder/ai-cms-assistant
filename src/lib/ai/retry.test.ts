import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiProviderError } from "./types";
import { withTimeoutAndRetry } from "./retry";

function httpError(status: number, message = "error", extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Runs `promise` while repeatedly flushing fake timers, so a retry's
// `sleep()` (real `setTimeout` under the hood) resolves instantly instead of
// requiring the test to guess exactly how long to advance by.
async function resolveWithFakeTimers<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  promise.finally(() => {
    settled = true;
  });
  while (!settled) {
    await vi.advanceTimersByTimeAsync(1000);
  }
  return promise;
}

describe("withTimeoutAndRetry", () => {
  it("returns the result on first success without retrying", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");

    const result = await withTimeoutAndRetry(attempt, { provider: "groq" });

    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries a transient (5xx) failure and succeeds on the next attempt", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce("ok");

    const result = await resolveWithFakeTimers(
      withTimeoutAndRetry(attempt, { provider: "groq", maxRetries: 2 }),
    );

    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 with a longer backoff than a generic 5xx", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce("ok");

    const promise = withTimeoutAndRetry(attempt, { provider: "openai", maxRetries: 2 });

    // A generic 5xx's first backoff (300ms) would already have let this
    // resolve; a 429's much longer backoff (2s+) should not have yet.
    await vi.advanceTimersByTimeAsync(300);
    expect(attempt).toHaveBeenCalledTimes(1);

    const result = await resolveWithFakeTimers(promise);
    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("honors a Retry-After header on a 429 instead of the default backoff", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(
        httpError(429, "rate limited", { headers: { "retry-after": "5" } }),
      )
      .mockResolvedValueOnce("ok");

    const promise = withTimeoutAndRetry(attempt, { provider: "openai", maxRetries: 1 });

    // Just under the 5s the header specified — shouldn't have retried yet.
    await vi.advanceTimersByTimeAsync(4900);
    expect(attempt).toHaveBeenCalledTimes(1);

    const result = await resolveWithFakeTimers(promise);
    expect(result).toBe("ok");
  });

  it("honors a Headers-like Retry-After (a .get() method) the same way as a plain object", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(
        httpError(429, "rate limited", {
          headers: { get: (name: string) => (name === "retry-after" ? "3" : null) },
        }),
      )
      .mockResolvedValueOnce("ok");

    const result = await resolveWithFakeTimers(
      withTimeoutAndRetry(attempt, { provider: "openai", maxRetries: 1 }),
    );
    expect(result).toBe("ok");
  });

  it("does not retry a non-retryable (4xx) failure", async () => {
    const attempt = vi.fn().mockRejectedValue(httpError(400, "bad request"));

    await expect(
      withTimeoutAndRetry(attempt, { provider: "openai", maxRetries: 2 }),
    ).rejects.toThrow(AiProviderError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("marks a non-retryable failure's AiProviderError as not retryable", async () => {
    const attempt = vi.fn().mockRejectedValue(httpError(400, "bad request"));

    const err = await withTimeoutAndRetry(attempt, { provider: "openai", maxRetries: 0 }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).retryable).toBe(false);
  });

  it("gives up after maxRetries and throws an AiProviderError marked retryable, since the failure mode itself was transient", async () => {
    const attempt = vi.fn().mockRejectedValue(httpError(503, "unavailable"));

    const errPromise = resolveWithFakeTimers(
      withTimeoutAndRetry(attempt, { provider: "groq", maxRetries: 1 }).catch((e) => e),
    );
    const err = await errPromise;

    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).retryable).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("aborts a hung attempt once timeoutMs elapses instead of hanging forever", async () => {
    const attempt = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );

    const promise = withTimeoutAndRetry(attempt, {
      provider: "anthropic",
      timeoutMs: 10,
      maxRetries: 0,
    });
    // Attach the rejection expectation before advancing timers, so there's
    // no tick where the rejection is briefly unhandled.
    const expectation = expect(promise).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
  });
});
