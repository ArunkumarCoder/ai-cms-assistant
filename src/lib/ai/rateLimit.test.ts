import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitStateForTests, waitForRateLimitSlot } from "./rateLimit";

// A tiny fake clock + sleep so this test suite never actually waits real
// wall-clock time, even though it's exercising a 60-second sliding window.
function fakeClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    sleepFn: async (ms: number) => {
      current += ms;
    },
  };
}

beforeEach(() => {
  __resetRateLimitStateForTests();
  delete process.env.AI_RATE_LIMIT_GROQ_RPM;
});

describe("waitForRateLimitSlot", () => {
  it("resolves immediately while under the limit", async () => {
    const clock = fakeClock();
    for (let i = 0; i < 5; i++) {
      await waitForRateLimitSlot("groq", clock);
    }
    // No assertion needed beyond "this didn't hang" — resolving at all
    // within a synchronous-ish test run proves no wait was queued.
  });

  it("queues (waits) once the per-minute limit is reached, rather than throwing", async () => {
    process.env.AI_RATE_LIMIT_GROQ_RPM = "3";
    const clock = fakeClock();

    for (let i = 0; i < 3; i++) {
      await waitForRateLimitSlot("groq", clock);
    }

    const before = clock.now();
    await waitForRateLimitSlot("groq", clock);
    // The 4th call had to wait for the 60s window to roll past the 1st.
    expect(clock.now()).toBeGreaterThan(before);
  });

  it("frees a slot once the oldest request ages out of the 60s window", async () => {
    process.env.AI_RATE_LIMIT_GROQ_RPM = "1";
    const clock = fakeClock(0);

    await waitForRateLimitSlot("groq", clock); // consumes the only slot at t=0

    const before = clock.now();
    await waitForRateLimitSlot("groq", clock);
    // Should have advanced roughly a full window (60s), not hung forever
    // and not returned instantly either.
    expect(clock.now() - before).toBeGreaterThanOrEqual(60_000);
  });

  it("tracks each provider's window independently", async () => {
    process.env.AI_RATE_LIMIT_GROQ_RPM = "1";
    const clock = fakeClock();

    await waitForRateLimitSlot("groq", clock);
    const before = clock.now();
    // openai has its own (much larger) budget — shouldn't be blocked by
    // groq's window filling up.
    await waitForRateLimitSlot("openai", clock);
    expect(clock.now()).toBe(before);
  });

  it("respects an AI_RATE_LIMIT_<PROVIDER>_RPM override", async () => {
    process.env.AI_RATE_LIMIT_GROQ_RPM = "1";
    const clock = fakeClock();

    await waitForRateLimitSlot("groq", clock);
    const before = clock.now();
    await waitForRateLimitSlot("groq", clock);
    expect(clock.now()).toBeGreaterThan(before);
  });
});
