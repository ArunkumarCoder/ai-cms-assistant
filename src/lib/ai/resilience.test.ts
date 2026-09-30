import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeoutAndRetry } from "./retry";
import { runWithConcurrency } from "@/lib/images/concurrency";

// Task item 5: "stress-test this by intentionally hammering a rate-limited
// path... confirm the app degrades gracefully rather than crashing or
// silently dropping work." No real API keys exist in this environment (see
// every earlier Phase 4/5 day's own note), so this simulates the exact shape
// of a real batch alt-text run — many concurrent items, several hitting 429s
// unevenly, retried with the rate-limit-aware backoff (./retry.ts) — rather
// than a manual, unrepeatable "ran it once and watched" check. Fake timers
// throughout: this is exercising real backoff durations (seconds per retry),
// not real wall-clock time.
function rateLimitedError() {
  return Object.assign(new Error("rate limited"), { status: 429 });
}

async function drain<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  promise.finally(() => {
    settled = true;
  });
  while (!settled) {
    await vi.advanceTimersByTimeAsync(5000);
  }
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resilience under a simulated rate-limited provider", () => {
  it("completes an entire batch with no drops or duplicates when items hit an uneven number of 429s", async () => {
    const ITEM_COUNT = 20;
    const CONCURRENCY = 3;
    // Each item needs 0-3 simulated rate-limit failures before succeeding —
    // staggered so different items are "recovering" at different times,
    // matching how a real burst against a shared per-minute limit wouldn't
    // fail every in-flight request identically.
    const failuresRemaining = new Map(Array.from({ length: ITEM_COUNT }, (_, i) => [i, i % 4]));
    const results = new Map<number, "ok" | "gave-up">();

    await drain(
      runWithConcurrency(
        Array.from({ length: ITEM_COUNT }, (_, i) => i),
        CONCURRENCY,
        async (item) => {
          const attempt = vi.fn(async () => {
            const remaining = failuresRemaining.get(item)!;
            if (remaining > 0) {
              failuresRemaining.set(item, remaining - 1);
              throw rateLimitedError();
            }
            return "ok" as const;
          });
          // Mirrors how generateAltTextAction.ts actually behaves: catches
          // the provider error and resolves to a result rather than
          // rejecting, so a batch worker never sees an unhandled throw.
          try {
            const result = await withTimeoutAndRetry(attempt, { provider: "openai", maxRetries: 5 });
            results.set(item, result === "ok" ? "ok" : "gave-up");
          } catch {
            results.set(item, "gave-up");
          }
        },
      ),
    );

    expect(results.size).toBe(ITEM_COUNT); // every item accounted for, none dropped
    expect([...results.values()].every((r) => r === "ok")).toBe(true);
  });

  it("still finishes the rest of the batch when a few items exhaust their retry budget entirely", async () => {
    const ITEM_COUNT = 10;
    const PERMANENTLY_BROKEN = new Set([2, 5, 8]);
    const results = new Map<number, "ok" | "failed">();

    await drain(
      runWithConcurrency(
        Array.from({ length: ITEM_COUNT }, (_, i) => i),
        2,
        async (item) => {
          const attempt = vi.fn(async () => {
            if (PERMANENTLY_BROKEN.has(item)) throw rateLimitedError();
            return "ok" as const;
          });
          try {
            await withTimeoutAndRetry(attempt, { provider: "openai", maxRetries: 2 });
            results.set(item, "ok");
          } catch {
            results.set(item, "failed");
          }
        },
      ),
    );

    expect(results.size).toBe(ITEM_COUNT);
    for (let i = 0; i < ITEM_COUNT; i++) {
      expect(results.get(i)).toBe(PERMANENTLY_BROKEN.has(i) ? "failed" : "ok");
    }
  });
});
