import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../types";
import { OpenAiProvider, type OpenAiChatClient } from "./openaiProvider";

function makeClient(
  create: OpenAiChatClient["chat"]["completions"]["create"] = vi
    .fn()
    .mockRejectedValue(new Error("not mocked")),
): OpenAiChatClient {
  return { chat: { completions: { create } } };
}

describe("OpenAiProvider.generate", () => {
  it("returns text and token usage for a trivial prompt", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "Hello there." } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    });
    const provider = new OpenAiProvider(makeClient(create));

    const result = await provider.generate("Say hello.");

    expect(result).toEqual({
      text: "Hello there.",
      usage: { inputTokens: 12, outputTokens: 4 },
      provider: "openai",
      model: "gpt-4o-mini",
    });
  });

  it("surfaces missing content as an AiProviderError, not undefined text", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ choices: [{ message: { content: null } }] });
    const provider = new OpenAiProvider(makeClient(create));

    await expect(provider.generate("Say hello.")).rejects.toThrow(
      AiProviderError,
    );
  });
});

describe("OpenAiProvider.generateStructured", () => {
  it("parses JSON content and requests strict json_schema mode", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"score":90}' } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    });
    const provider = new OpenAiProvider(makeClient(create));

    const result = await provider.generateStructured<{ score: number }>(
      "Score this.",
      { type: "object", properties: { score: { type: "number" } } },
    );

    expect(result.data).toEqual({ score: 90 });
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 8 });
    const [params] = create.mock.calls[0];
    expect(params).toMatchObject({
      response_format: { type: "json_schema" },
    });
  });

  it("surfaces a malformed JSON response as an AiProviderError", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ choices: [{ message: { content: "not json" } }] });
    const provider = new OpenAiProvider(makeClient(create));

    await expect(
      provider.generateStructured("Score this.", { type: "object" }),
    ).rejects.toThrow(AiProviderError);
  });
});

describe("OpenAiProvider.generateWithVision", () => {
  it("sends the image as an image_url content part alongside the prompt", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"altText":"A red widget."}' } }],
      usage: { prompt_tokens: 30, completion_tokens: 6 },
    });
    const provider = new OpenAiProvider(makeClient(create));

    const result = await provider.generateWithVision<{ altText: string }>(
      "Describe this image.",
      "https://example.com/image.jpg",
      { type: "object", properties: { altText: { type: "string" } } },
    );

    expect(result.data).toEqual({ altText: "A red widget." });
    const [params] = create.mock.calls[0];
    expect(params.messages[0].content).toEqual(
      expect.arrayContaining([
        {
          type: "image_url",
          image_url: { url: "https://example.com/image.jpg" },
        },
      ]),
    );
  });
});
