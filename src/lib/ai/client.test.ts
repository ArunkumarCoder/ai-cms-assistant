import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

const getProviderMock = vi.fn();
const logAiCallMock = vi.fn().mockResolvedValue(undefined);
const waitForRateLimitSlotMock = vi.fn().mockResolvedValue(undefined);

vi.mock("./providers/registry", () => ({ getProvider: getProviderMock }));
vi.mock("./logging", () => ({ logAiCall: logAiCallMock }));
// Mocked so these tests never depend on real timing/state from the actual
// sliding-window limiter (./rateLimit.test.ts covers that in isolation) —
// client.ts's own job is just to call it, once per attempt, for the right
// provider.
vi.mock("./rateLimit", () => ({
  waitForRateLimitSlot: (...args: unknown[]) => waitForRateLimitSlotMock(...args),
}));

const { aiClient } = await import("./client");
const { AiValidationError } = await import("./validation");

function fakeTextResult(overrides: Record<string, unknown> = {}) {
  return {
    text: "hello",
    usage: { inputTokens: 10, outputTokens: 5 },
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    ...overrides,
  };
}

beforeEach(() => {
  getProviderMock.mockReset();
  logAiCallMock.mockClear();
  waitForRateLimitSlotMock.mockClear();
});

describe("aiClient.generate", () => {
  it("routes a text-only call type to the provider ./routing.ts resolves for it", async () => {
    const generate = vi.fn().mockResolvedValue(fakeTextResult());
    getProviderMock.mockReturnValue({ name: "groq", generate });

    const result = await aiClient.generate("page-generation", "Write a page.");

    expect(getProviderMock).toHaveBeenCalledWith("groq");
    expect(generate).toHaveBeenCalledWith("Write a page.", undefined);
    expect(result.text).toBe("hello");
  });

  it("routes the vision call type (alt-text-single) to openai", async () => {
    const generate = vi
      .fn()
      .mockResolvedValue(
        fakeTextResult({ provider: "openai", model: "gpt-4o-mini" }),
      );
    getProviderMock.mockReturnValue({ name: "openai", generate });

    await aiClient.generate("alt-text-single", "Describe this image.");

    expect(getProviderMock).toHaveBeenCalledWith("openai");
  });

  it("logs a successful call with provider, usage, and an estimated cost", async () => {
    const generate = vi.fn().mockResolvedValue(fakeTextResult());
    getProviderMock.mockReturnValue({ name: "groq", generate });

    await aiClient.generate("seo-scoring", "Score this.");

    expect(logAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callType: "seo-scoring",
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        usage: { inputTokens: 10, outputTokens: 5 },
        success: true,
      }),
    );
    const [entry] = logAiCallMock.mock.calls[0];
    expect(entry.estimatedCostUsd).toBeGreaterThan(0);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs a failed call and rethrows the provider's error unchanged", async () => {
    const err = new Error("boom");
    const generate = vi.fn().mockRejectedValue(err);
    getProviderMock.mockReturnValue({ name: "groq", generate });

    await expect(
      aiClient.generate("faq-generation", "Draft FAQs."),
    ).rejects.toThrow("boom");

    expect(logAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callType: "faq-generation",
        provider: "groq",
        success: false,
        errorMessage: "boom",
      }),
    );
  });

  it("threads context.siteId/userId through to the logged entry", async () => {
    const generate = vi.fn().mockResolvedValue(fakeTextResult());
    getProviderMock.mockReturnValue({ name: "groq", generate });

    await aiClient.generate("page-generation", "Write a page.", {
      context: { siteId: "site-1", userId: "user-1" },
    });

    expect(logAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: "site-1", userId: "user-1" }),
    );
  });
});

// A deliberately minimal schema — these tests are about the validate/retry/
// log machinery in client.ts, not about any one real feature's schema (those
// live in ./schemas/*.test.ts).
const scoreSchema = z.object({ score: z.number() });

function structuredResult(data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    data,
    usage: { inputTokens: 1, outputTokens: 1 },
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    ...overrides,
  };
}

describe("aiClient.generateStructured", () => {
  it("converts the Zod schema to JSON Schema and passes it, with the prompt, to the resolved provider", async () => {
    const generateStructured = vi.fn().mockResolvedValue(structuredResult({ score: 88 }));
    getProviderMock.mockReturnValue({ name: "groq", generateStructured });

    const result = await aiClient.generateStructured("seo-scoring", "Score this.", scoreSchema);

    expect(generateStructured).toHaveBeenCalledWith(
      "Score this.",
      z.toJSONSchema(scoreSchema),
      undefined,
    );
    expect(result.data).toEqual({ score: 88 });
  });

  it("returns schema-validated, typed data on a well-formed response — no caller-side parse needed", async () => {
    const generateStructured = vi.fn().mockResolvedValue(structuredResult({ score: 42 }));
    getProviderMock.mockReturnValue({ name: "groq", generateStructured });

    const result = await aiClient.generateStructured("seo-scoring", "Score this.", scoreSchema);

    expect(result.data.score).toBe(42);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(logAiCallMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // These three use "alt-text-single" (routes to openai, no fallback target
  // configured — see FALLBACK_PROVIDER) rather than a groq-routed call type
  // on purpose: groq's own fallback-to-openai would otherwise also fire on
  // every validation failure (a real, separately-tested interaction — see
  // "a Groq validation failure can still fall back to OpenAI" below), which
  // would confuse a call count or prompt-identity assertion aimed purely at
  // this retry loop with the unrelated fallback mechanism's own extra call.
  it("retries with the validation error fed back into the prompt when the response fails the schema", async () => {
    const generateStructured = vi
      .fn()
      .mockResolvedValueOnce(structuredResult({ score: "not a number" }, { provider: "openai" }))
      .mockResolvedValueOnce(structuredResult({ score: 77 }, { provider: "openai" }));
    getProviderMock.mockReturnValue({ name: "openai", generateStructured });

    const result = await aiClient.generateStructured("alt-text-single", "Score this.", scoreSchema);

    expect(result.data.score).toBe(77);
    expect(generateStructured).toHaveBeenCalledTimes(2);
    const [firstPrompt] = generateStructured.mock.calls[0];
    const [secondPrompt] = generateStructured.mock.calls[1];
    expect(secondPrompt).not.toBe(firstPrompt);
    expect(secondPrompt).toContain("Score this.");
    expect(secondPrompt).toContain("did not match the required JSON shape");
    expect(secondPrompt).toContain("score");
  });

  it("logs each validation failure (provider, callType, which check failed) via the existing logging utility", async () => {
    const generateStructured = vi
      .fn()
      .mockResolvedValueOnce(structuredResult({ score: "not a number" }, { provider: "openai" }))
      .mockResolvedValueOnce(structuredResult({ score: 77 }, { provider: "openai" }));
    getProviderMock.mockReturnValue({ name: "openai", generateStructured });

    await aiClient.generateStructured("alt-text-single", "Score this.", scoreSchema);

    expect(logAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callType: "alt-text-single",
        provider: "openai",
        success: false,
        errorMessage: expect.stringContaining("failed schema validation"),
      }),
    );
    expect(logAiCallMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("gives up after exhausting retries and throws AiValidationError, never returning invalid data", async () => {
    const generateStructured = vi
      .fn()
      .mockResolvedValue(structuredResult({ score: "nope" }, { provider: "openai" }));
    getProviderMock.mockReturnValue({ name: "openai", generateStructured });

    await expect(
      aiClient.generateStructured("alt-text-single", "Score this.", scoreSchema),
    ).rejects.toBeInstanceOf(AiValidationError);
    // 1 initial attempt + 2 retries = 3 calls, then give up — bounded, not
    // unbounded, and never silently returns the malformed shape.
    expect(generateStructured).toHaveBeenCalledTimes(3);
  });

  it("does not retry (or fall back) a validation failure for a provider with no fallback configured", async () => {
    const generateStructured = vi.fn().mockResolvedValue(structuredResult({ score: "nope" }, { provider: "openai" }));
    getProviderMock.mockReturnValue({ name: "openai", generateStructured });

    await expect(
      aiClient.generateStructured("alt-text-single", "Score this.", scoreSchema),
    ).rejects.toBeInstanceOf(AiValidationError);
    expect(getProviderMock).toHaveBeenCalledTimes(3); // one resolution per prompt-feedback attempt, no fallback
    expect(generateStructured).toHaveBeenCalledTimes(3);
  });

  it("a Groq validation failure can still fall back to OpenAI, same as a transport failure would", async () => {
    const groqGenerateStructured = vi.fn().mockResolvedValue(structuredResult({ score: "nope" }));
    const openaiGenerateStructured = vi
      .fn()
      .mockResolvedValue(structuredResult({ score: 90 }, { provider: "openai" }));
    getProviderMock.mockImplementation((name: string) =>
      name === "groq"
        ? { name: "groq", generateStructured: groqGenerateStructured }
        : { name: "openai", generateStructured: openaiGenerateStructured },
    );

    const result = await aiClient.generateStructured("seo-scoring", "Score this.", scoreSchema);

    expect(result.data.score).toBe(90);
    expect(groqGenerateStructured).toHaveBeenCalledTimes(1);
    expect(openaiGenerateStructured).toHaveBeenCalledTimes(1);
  });
});

describe("aiClient.generateWithVision", () => {
  it("retries with feedback while keeping the same image URL across attempts", async () => {
    const generateWithVision = vi
      .fn()
      .mockResolvedValueOnce(structuredResult({ score: "not a number" }, { provider: "openai" }))
      .mockResolvedValueOnce(structuredResult({ score: 5 }, { provider: "openai" }));
    getProviderMock.mockReturnValue({ name: "openai", generateWithVision });

    const result = await aiClient.generateWithVision(
      "alt-text-single",
      "Describe this.",
      "https://example.com/a.jpg",
      scoreSchema,
    );

    expect(result.data.score).toBe(5);
    expect(generateWithVision).toHaveBeenCalledTimes(2);
    for (const call of generateWithVision.mock.calls) {
      expect(call[1]).toBe("https://example.com/a.jpg");
    }
  });
});

describe("aiClient rate limiting", () => {
  it("waits for a rate-limit slot on the resolved provider before calling it", async () => {
    const generate = vi.fn().mockResolvedValue(fakeTextResult());
    getProviderMock.mockReturnValue({ name: "groq", generate });

    await aiClient.generate("page-generation", "Write a page.");

    expect(waitForRateLimitSlotMock).toHaveBeenCalledWith("groq");
    // The slot must be reserved before the provider is actually called —
    // otherwise the limiter isn't actually throttling anything.
    expect(waitForRateLimitSlotMock.mock.invocationCallOrder[0]).toBeLessThan(
      generate.mock.invocationCallOrder[0],
    );
  });
});

describe("aiClient provider fallback", () => {
  function providerFor(name: string, methods: Record<string, unknown>) {
    return { name, ...methods };
  }

  it("falls back to OpenAI when Groq fails, and logs the fallback with fallbackFrom set", async () => {
    const groqGenerate = vi.fn().mockRejectedValue(new Error("Groq is down"));
    const openaiGenerate = vi.fn().mockResolvedValue(
      fakeTextResult({ provider: "openai", model: "gpt-4o-mini" }),
    );
    getProviderMock.mockImplementation((name: string) =>
      name === "groq"
        ? providerFor("groq", { generate: groqGenerate })
        : providerFor("openai", { generate: openaiGenerate }),
    );

    const result = await aiClient.generate("page-generation", "Write a page.");

    expect(groqGenerate).toHaveBeenCalledTimes(1);
    expect(openaiGenerate).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("openai");

    // One failure row for the primary provider, one success row for the
    // fallback — never merged into a single entry that would hide that
    // Groq failed at all.
    expect(logAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "groq", success: false, fallbackFrom: undefined }),
    );
    expect(logAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", success: true, fallbackFrom: "groq" }),
    );
  });

  it("respects the fallback provider's own rate limit before calling it", async () => {
    const groqGenerate = vi.fn().mockRejectedValue(new Error("Groq is down"));
    const openaiGenerate = vi.fn().mockResolvedValue(fakeTextResult({ provider: "openai" }));
    getProviderMock.mockImplementation((name: string) =>
      name === "groq"
        ? providerFor("groq", { generate: groqGenerate })
        : providerFor("openai", { generate: openaiGenerate }),
    );

    await aiClient.generate("page-generation", "Write a page.");

    expect(waitForRateLimitSlotMock).toHaveBeenCalledWith("groq");
    expect(waitForRateLimitSlotMock).toHaveBeenCalledWith("openai");
  });

  it("throws the primary provider's own error when the fallback also fails, but still logs both", async () => {
    const groqGenerate = vi.fn().mockRejectedValue(new Error("Groq is down"));
    const openaiGenerate = vi.fn().mockRejectedValue(new Error("OpenAI is also down"));
    getProviderMock.mockImplementation((name: string) =>
      name === "groq"
        ? providerFor("groq", { generate: groqGenerate })
        : providerFor("openai", { generate: openaiGenerate }),
    );

    await expect(aiClient.generate("page-generation", "Write a page.")).rejects.toThrow(
      "Groq is down",
    );

    expect(logAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "groq", success: false, fallbackFrom: undefined }),
    );
    expect(logAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        success: false,
        errorMessage: "OpenAI is also down",
        fallbackFrom: "groq",
      }),
    );
  });

  it("does not attempt a fallback for a provider with no configured fallback target (e.g. OpenAI)", async () => {
    const openaiGenerate = vi.fn().mockRejectedValue(new Error("OpenAI is down"));
    getProviderMock.mockReturnValue(providerFor("openai", { generate: openaiGenerate }));

    await expect(aiClient.generate("alt-text-single", "Describe this.")).rejects.toThrow(
      "OpenAI is down",
    );

    expect(openaiGenerate).toHaveBeenCalledTimes(1);
    expect(getProviderMock).toHaveBeenCalledTimes(1);
  });
});
