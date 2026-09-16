import { afterEach, describe, expect, it } from "vitest";
import { resolveProviderName } from "./routing";

describe("resolveProviderName", () => {
  afterEach(() => {
    delete process.env.AI_ROUTE_PAGE_GENERATION;
  });

  it("routes text-only calls to groq by default (SPEC.md §3)", () => {
    expect(resolveProviderName("page-generation")).toBe("groq");
    expect(resolveProviderName("block-regeneration")).toBe("groq");
    expect(resolveProviderName("seo-scoring")).toBe("groq");
    expect(resolveProviderName("faq-generation")).toBe("groq");
    expect(resolveProviderName("faq-schema")).toBe("groq");
    expect(resolveProviderName("content-quality")).toBe("groq");
  });

  it("routes the vision calls (alt text) to openai by default", () => {
    expect(resolveProviderName("alt-text-single")).toBe("openai");
    expect(resolveProviderName("alt-text-batch")).toBe("openai");
  });

  it("lets an AI_ROUTE_<CALL_TYPE> env override win over the default", () => {
    process.env.AI_ROUTE_PAGE_GENERATION = "anthropic";
    expect(resolveProviderName("page-generation")).toBe("anthropic");
  });

  it("ignores a garbage override and falls back to the default", () => {
    process.env.AI_ROUTE_PAGE_GENERATION = "not-a-real-provider";
    expect(resolveProviderName("page-generation")).toBe("groq");
  });
});
