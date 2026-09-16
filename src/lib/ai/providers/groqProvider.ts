import Groq from "groq-sdk";
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

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// Groq's API is OpenAI-compatible, so this narrow interface is structurally
// identical to OpenAiChatClient (openaiProvider.ts) — kept as its own type
// rather than reused so the two providers can diverge later (a Groq-only
// param, a model swap) without one file's interface constraining the other.
export interface GroqChatClient {
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

let cachedClient: GroqChatClient | null = null;
function getDefaultClient(): GroqChatClient {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AiProviderError("groq", "Missing GROQ_API_KEY.");
  }
  // See OpenAiProvider's getDefaultClient() for why this cast is necessary —
  // same reasoning, Groq's SDK just as stricter-typed as OpenAI's.
  cachedClient = new Groq({ apiKey }) as unknown as GroqChatClient;
  return cachedClient;
}

export class GroqProvider implements AiProvider {
  readonly name = "groq" as const;

  constructor(
    private readonly client: GroqChatClient = getDefaultClient(),
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
      throw new AiProviderError("groq", "Groq returned no text content.");
    }
    return {
      text,
      usage: toChatUsage(response.usage),
      provider: "groq",
      model: this.model,
    };
  }

  async generateStructured<T = unknown>(
    prompt: string,
    schema: JsonSchema,
    options?: GenerateOptions,
  ): Promise<AiStructuredResult<T>> {
    // Groq's OpenAI-compatible endpoint supports `json_object` mode (valid
    // JSON, unconstrained shape) but not OpenAI's stricter `json_schema`
    // mode — the schema is embedded in the prompt as an instruction instead,
    // same technique SPEC.md's own routing note assumes is necessary for a
    // cheaper/faster model that doesn't offer schema-constrained decoding.
    const response = await this.call(
      [
        {
          role: "system",
          content: `Respond with only JSON matching this schema, no other text: ${JSON.stringify(schema)}`,
        },
        { role: "user", content: prompt },
      ],
      options,
      { response_format: { type: "json_object" } },
    );
    return {
      data: parseJsonContent<T>("groq", response.choices[0]?.message.content),
      usage: toChatUsage(response.usage),
      provider: "groq",
      model: this.model,
    };
  }

  // SPEC.md §3: "Groq's vision support isn't guaranteed across its hosted
  // models." The default routing table (../routing.ts) never sends a vision
  // call here — but a caller that overrides routing straight to Groq (an env
  // override, a future misconfiguration) gets a clear rejection instead of a
  // text-only response silently pretending to have seen the image.
  async generateWithVision(
    ...args: [
      prompt: string,
      imageUrl: string,
      schema: JsonSchema,
      options?: GenerateOptions,
    ]
  ): Promise<never> {
    void args;
    throw new AiProviderError(
      "groq",
      "Groq provider does not support generateWithVision — route vision calls to OpenAI or Anthropic instead.",
    );
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
        provider: "groq",
        timeoutMs: options?.timeoutMs,
        maxRetries: options?.maxRetries,
      },
    );
  }
}
