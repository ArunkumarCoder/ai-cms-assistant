import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../types";
import { GroqProvider, type GroqChatClient } from "./groqProvider";

function makeClient(
  create: GroqChatClient["chat"]["completions"]["create"] = vi
    .fn()
    .mockRejectedValue(new Error("not mocked")),
): GroqChatClient {
  return { chat: { completions: { create } } };
}

describe("GroqProvider.generate", () => {
  it("returns text and token usage for a trivial prompt", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "Hi!" } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });
    const provider = new GroqProvider(makeClient(create));

    const result = await provider.generate("Say hi.");

    expect(result).toEqual({
      text: "Hi!",
      usage: { inputTokens: 5, outputTokens: 2 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });
  });
});

describe("GroqProvider.generateStructured", () => {
  it("parses JSON content and requests json_object mode with the schema in-prompt", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"suggestions":[]}' } }],
      usage: { prompt_tokens: 40, completion_tokens: 10 },
    });
    const provider = new GroqProvider(makeClient(create));

    const result = await provider.generateStructured<{
      suggestions: unknown[];
    }>("Audit this.", { type: "object" });

    expect(result.data).toEqual({ suggestions: [] });
    const [params] = create.mock.calls[0];
    expect(params).toMatchObject({ response_format: { type: "json_object" } });
    expect(params.messages[0]).toMatchObject({ role: "system" });
  });

  it("surfaces a malformed JSON response as an AiProviderError", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ choices: [{ message: { content: "nope" } }] });
    const provider = new GroqProvider(makeClient(create));

    await expect(
      provider.generateStructured("Audit this.", { type: "object" }),
    ).rejects.toThrow(AiProviderError);
  });
});

describe("GroqProvider.generateWithVision", () => {
  it("rejects — Groq's vision support isn't guaranteed (SPEC.md §3)", async () => {
    const provider = new GroqProvider(makeClient());

    await expect(
      provider.generateWithVision("Describe.", "https://example.com/i.jpg", {
        type: "object",
      }),
    ).rejects.toThrow(AiProviderError);
  });
});
