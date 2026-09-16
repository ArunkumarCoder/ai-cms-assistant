import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "./types";
import { withTimeoutAndRetry } from "./retry";

function httpError(status: number, message = "error") {
  return Object.assign(new Error(message), { status });
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

    const result = await withTimeoutAndRetry(attempt, {
      provider: "groq",
      maxRetries: 2,
    });

    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 the same way as a 5xx", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce("ok");

    const result = await withTimeoutAndRetry(attempt, {
      provider: "openai",
      maxRetries: 2,
    });

    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable (4xx) failure", async () => {
    const attempt = vi.fn().mockRejectedValue(httpError(400, "bad request"));

    await expect(
      withTimeoutAndRetry(attempt, { provider: "openai", maxRetries: 2 }),
    ).rejects.toThrow(AiProviderError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries and throws an AiProviderError wrapping the last failure", async () => {
    const attempt = vi.fn().mockRejectedValue(httpError(503, "unavailable"));

    await expect(
      withTimeoutAndRetry(attempt, { provider: "groq", maxRetries: 1 }),
    ).rejects.toThrow(AiProviderError);
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

    await expect(
      withTimeoutAndRetry(attempt, {
        provider: "anthropic",
        timeoutMs: 10,
        maxRetries: 0,
      }),
    ).rejects.toThrow(/timed out/);
  });
});
