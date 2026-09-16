import OpenAI from "openai";
import type { AiProvider } from "../adapter";
import { AiProviderError } from "../types";
import type {
  AiStructuredResult,
  AiTextResult,
  GenerateOptions,
  JsonSchema,
} from "../types";
import { withTimeoutAndRetry } from "../retry";
import { parseJsonContent, toChatUsage } from "./shared";

const DEFAULT_MODEL = "gpt-4o-mini";

// The narrow slice of the real `openai` client this provider actually calls
// — same pattern as SanityQueryClient (src/lib/cms/sanityAdapter.ts): unit
// tests inject a plain mock object instead of constructing a real OpenAI
// client, and nothing here depends on the rest of that SDK's surface.
export interface OpenAiChatClient {
  chat: {
    completions: {
      create(
        params: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ): Promise<{
        choices: { message: { content: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
    };
  };
}

let cachedClient: OpenAiChatClient | null = null;
function getDefaultClient(): OpenAiChatClient {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AiProviderError("openai", "Missing OPENAI_API_KEY.");
  }
  // The real client's `create` overloads require specific request-shaped
  // params (model/messages/etc. as required properties), which is stricter
  // than this narrow interface's deliberately loose `Record<string, unknown>`
  // — TS can't verify a real OpenAI client satisfies that on its own, even
  // though every call site here always passes a well-formed request. Same
  // cast used by GroqProvider/AnthropicProvider's default clients.
  cachedClient = new OpenAI({ apiKey }) as unknown as OpenAiChatClient;
  return cachedClient;
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly client: OpenAiChatClient = getDefaultClient(),
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async generate(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<AiTextResult> {
    const response = await this.call(
      [{ role: "user", content: prompt }],
      options,
    );
    const text = response.choices[0]?.message.content;
    if (typeof text !== "string") {
      throw new AiProviderError("openai", "OpenAI returned no text content.");
    }
    return {
      text,
      usage: toChatUsage(response.usage),
      provider: "openai",
      model: this.model,
    };
  }

  async generateStructured<T = unknown>(
    prompt: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> {
    const response = await this.call(
      [{ role: "user", content: prompt }],
      options,
      { response_format: jsonSchemaFormat(schema) },
    );
    return {
      data: parseJsonContent<T>("openai", response.choices[0]?.message.content),
      usage: toChatUsage(response.usage),
      provider: "openai",
      model: this.model,
    };
  }

  async generateWithVision<T = unknown>(
    prompt: string,
    imageUrl: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> {
    const response = await this.call(
      [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      options,
      { response_format: jsonSchemaFormat(schema) },
    );
    return {
      data: parseJsonContent<T>("openai", response.choices[0]?.message.content),
      usage: toChatUsage(response.usage),
      provider: "openai",
      model: this.model,
    };
  }

  private call(
    messages: unknown[],
    options: GenerateOptions | undefined,
    extra: Record<string, unknown> = {},
  ) {
    return withTimeoutAndRetry(
      (signal) =>
        this.client.chat.completions.create(
          {
            model: this.model,
            messages,
            temperature: options?.temperature,
            max_tokens: options?.maxOutputTokens,
            ...extra,
          },
          { signal },
        ),
      {
        provider: "openai",
        timeoutMs: options?.timeoutMs,
        maxRetries: options?.maxRetries,
      },
    );
  }
}

function jsonSchemaFormat(schema: JsonSchema) {
  return {
    type: "json_schema" as const,
    json_schema: { name: "structured_output", schema, strict: true },
  };
}
