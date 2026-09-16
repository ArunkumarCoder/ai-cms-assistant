import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderMock = vi.fn();
const logAiCallMock = vi.fn().mockResolvedValue(undefined);

vi.mock("./providers/registry", () => ({ getProvider: getProviderMock }));
vi.mock("./logging", () => ({ logAiCall: logAiCallMock }));

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
