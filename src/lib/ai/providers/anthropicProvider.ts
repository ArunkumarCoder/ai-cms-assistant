import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider } from "../adapter";
import { AiProviderError } from "../types";
import type {
  AiStructuredResult,
  AiTextResult,
  GenerateOptions,
  JsonSchema,
} from "../types";
import { withTimeoutAndRetry } from "../retry";
import { fetchImageAsBase64 } from "../images";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

// Claude has no dedicated "structured output" mode the way OpenAI's
// `response_format.json_schema` does. The standard workaround — forcing a
// single tool call whose `input_schema` is the schema we want back, then
// reading that tool call's already-parsed `input` object — is what
// generateStructured/generateWithVision use below; this is that tool's name.
const STRUCTURED_OUTPUT_TOOL = "structured_output";

// The narrow slice of the real `@anthropic-ai/sdk` client this provider
// calls — same pattern as SanityQueryClient (src/lib/cms/sanityAdapter.ts)
// and OpenAiChatClient (./openaiProvider.ts): unit tests inject a plain mock
// instead of a real Anthropic client.
export interface AnthropicMessageClient {
  messages: {
    create(
      params: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ): Promise<{
      content: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; name: string; input: unknown }
        | { type: string; [key: string]: unknown }
      >;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>;
  };
}

let cachedClient: AnthropicMessageClient | null = null;
function getDefaultClient(): AnthropicMessageClient {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiProviderError("anthropic", "Missing ANTHROPIC_API_KEY.");
  }
  // See OpenAiProvider's getDefaultClient() for why this cast is necessary.
  cachedClient = new Anthropic({ apiKey }) as unknown as AnthropicMessageClient;
  return cachedClient;
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;

  constructor(
    private readonly client: AnthropicMessageClient = getDefaultClient(),
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async generate(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<AiTextResult> {
    const response = await this.callMessages(
      [{ role: "user", content: prompt }],
      options,
    );
    const block = response.content.find(
      (c): c is { type: "text"; text: string } => c.type === "text",
    );
    if (!block) {
      throw new AiProviderError(
        "anthropic",
        "Claude returned no text content.",
      );
    }
    return {
      text: block.text,
      usage: toUsage(response.usage),
      provider: "anthropic",
      model: this.model,
    };
  }

  async generateStructured<T = unknown>(
    prompt: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> {
    const response = await this.callMessages(
      [{ role: "user", content: prompt }],
      options,
      schema,
    );
    return {
      data: extractToolInput<T>(response),
      usage: toUsage(response.usage),
      provider: "anthropic",
      model: this.model,
    };
  }

  async generateWithVision<T = unknown>(
    prompt: string,
    imageUrl: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> {
    const image = await fetchImageAsBase64(imageUrl);
    const response = await this.callMessages(
      [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mediaType,
                data: image.base64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      options,
      schema,
    );
    return {
      data: extractToolInput<T>(response),
      usage: toUsage(response.usage),
      provider: "anthropic",
      model: this.model,
    };
  }

  private callMessages(
    messages: unknown[],
    options: GenerateOptions | undefined,
    schema?: JsonSchema,
  ) {
    return withTimeoutAndRetry(
      (signal) =>
        this.client.messages.create(
          {
            model: this.model,
            max_tokens: options?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
            temperature: options?.temperature,
            messages,
            ...(schema
              ? {
                  tools: [
                    { name: STRUCTURED_OUTPUT_TOOL, input_schema: schema },
                  ],
                  tool_choice: { type: "tool", name: STRUCTURED_OUTPUT_TOOL },
                }
              : {}),
          },
          { signal },
        ),
      {
        provider: "anthropic",
        timeoutMs: options?.timeoutMs,
        maxRetries: options?.maxRetries,
      },
    );
  }
}

function toUsage(usage?: { input_tokens?: number; output_tokens?: number }) {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}

function extractToolInput<T>(response: {
  content: Array<{ type: string; name?: string; input?: unknown }>;
}): T {
  const block = response.content.find(
    (c) => c.type === "tool_use" && c.name === STRUCTURED_OUTPUT_TOOL,
  );
  if (!block) {
    throw new AiProviderError(
      "anthropic",
      "Claude did not return the expected structured tool call.",
    );
  }
  return block.input as T;
}
