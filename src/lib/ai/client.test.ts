import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("aiClient.generateStructured", () => {
  it("passes the prompt and schema through to the resolved provider", async () => {
    const schema = { type: "object" };
    const generateStructured = vi.fn().mockResolvedValue({
      data: { score: 88 },
      usage: { inputTokens: 1, outputTokens: 1 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });
    getProviderMock.mockReturnValue({ name: "groq", generateStructured });

    const result = await aiClient.generateStructured(
      "seo-scoring",
      "Score this.",
      schema,
    );

    expect(generateStructured).toHaveBeenCalledWith(
      "Score this.",
      schema,
      undefined,
    );
    expect(result.data).toEqual({ score: 88 });
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
