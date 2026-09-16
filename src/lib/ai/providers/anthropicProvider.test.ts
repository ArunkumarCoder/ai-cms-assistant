import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../types";
import {
  AnthropicProvider,
  type AnthropicMessageClient,
} from "./anthropicProvider";

function makeClient(
  create: AnthropicMessageClient["messages"]["create"] = vi
    .fn()
    .mockRejectedValue(new Error("not mocked")),
): AnthropicMessageClient {
  return { messages: { create } };
}

describe("AnthropicProvider.generate", () => {
  it("returns the text content block and usage for a trivial prompt", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Hello from Claude." }],
      usage: { input_tokens: 8, output_tokens: 3 },
    });
    const provider = new AnthropicProvider(makeClient(create));

    const result = await provider.generate("Say hello.");

    expect(result).toEqual({
      text: "Hello from Claude.",
      usage: { inputTokens: 8, outputTokens: 3 },
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
  });

  it("throws an AiProviderError when Claude returns no text block", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "something_else", input: {} }],
    });
    const provider = new AnthropicProvider(makeClient(create));

    await expect(provider.generate("Say hello.")).rejects.toThrow(
      AiProviderError,
    );
  });
});

describe("AnthropicProvider.generateStructured", () => {
  it("extracts the forced structured_output tool call as data", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "tool_use", name: "structured_output", input: { score: 77 } },
      ],
      usage: { input_tokens: 15, output_tokens: 5 },
    });
    const provider = new AnthropicProvider(makeClient(create));

    const result = await provider.generateStructured<{ score: number }>(
      "Score this.",
      { type: "object", properties: { score: { type: "number" } } },
    );

    expect(result.data).toEqual({ score: 77 });
    const [params] = create.mock.calls[0];
    expect(params).toMatchObject({
      tool_choice: { type: "tool", name: "structured_output" },
    });
  });

  it("throws when Claude doesn't return the forced tool call", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "oops" }] });
    const provider = new AnthropicProvider(makeClient(create));

    await expect(
      provider.generateStructured("Score this.", { type: "object" }),
    ).rejects.toThrow(AiProviderError);
  });
});

describe("AnthropicProvider.generateWithVision", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the image, base64-encodes it, and sends it alongside the prompt", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "structured_output",
          input: { altText: "A cat." },
        },
      ],
      usage: { input_tokens: 20, output_tokens: 6 },
    });
    const provider = new AnthropicProvider(makeClient(create));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new TextEncoder().encode("fake-bytes").buffer,
      }),
    );

    const result = await provider.generateWithVision<{ altText: string }>(
      "Describe this image.",
      "https://example.com/cat.png",
      { type: "object", properties: { altText: { type: "string" } } },
    );

    expect(result.data).toEqual({ altText: "A cat." });
    const [params] = create.mock.calls[0];
    expect(params.messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png" },
    });
  });
});
