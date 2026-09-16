import type { AiProvider } from "../adapter";
import type { AiProviderName } from "../types";
import { OpenAiProvider } from "./openaiProvider";
import { AnthropicProvider } from "./anthropicProvider";
import { GroqProvider } from "./groqProvider";

const instances = new Map<AiProviderName, AiProvider>();

// Lazy singletons: constructing a provider reads its API key from env (see
// each provider's own getDefaultClient()), so a provider with no key
// configured only throws when a call actually routes to it, not at import
// time — the same "don't block on what you don't need yet" reasoning as
// getWriteClient() (src/sanity/writeClient.ts).
export function getProvider(name: AiProviderName): AiProvider {
  const existing = instances.get(name);
  if (existing) return existing;

  const created: AiProvider =
    name === "openai"
      ? new OpenAiProvider()
      : name === "anthropic"
        ? new AnthropicProvider()
        : new GroqProvider();

  instances.set(name, created);
  return created;
}
