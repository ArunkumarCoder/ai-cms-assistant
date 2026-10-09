import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiResponseCache, buildAiCacheKey, isCacheableCallType } from "./cache";

const SCHEMA = { type: "object", properties: { score: { type: "number" } } };

function key(overrides: Partial<Parameters<typeof buildAiCacheKey>[0]> = {}) {
  return buildAiCacheKey({
    callType: "seo-scoring",
    userId: "user-1",
    siteId: "site-1",
    prompt: "Score this page.",
    imageUrl: undefined,
    jsonSchema: SCHEMA,
    ...overrides,
  });
}

describe("isCacheableCallType", () => {
  it("allows the four deterministic-style call types", () => {
    expect(isCacheableCallType("seo-scoring")).toBe(true);
    expect(isCacheableCallType("faq-generation")).toBe(true);
    expect(isCacheableCallType("alt-text-single")).toBe(true);
    expect(isCacheableCallType("content-quality")).toBe(true);
  });

  it("excludes the two generative call types users expect fresh variants from", () => {
    expect(isCacheableCallType("page-generation")).toBe(false);
    expect(isCacheableCallType("block-regeneration")).toBe(false);
  });
});

describe("buildAiCacheKey", () => {
  it("produces the same key for identical inputs", () => {
    expect(key()).toBe(key());
  });

  it("isolates by userId — never shares an entry across users", () => {
    expect(key({ userId: "user-1" })).not.toBe(key({ userId: "user-2" }));
  });

  it("isolates by siteId — never shares an entry across Sites", () => {
    expect(key({ siteId: "site-1" })).not.toBe(key({ siteId: "site-2" }));
  });

  it("differs when the prompt differs", () => {
    expect(key({ prompt: "Score this page." })).not.toBe(key({ prompt: "Score a different page." }));
  });

  it("differs when the image URL differs (vision calls)", () => {
    expect(key({ imageUrl: "https://example.com/a.jpg" })).not.toBe(
      key({ imageUrl: "https://example.com/b.jpg" }),
    );
  });

  it("differs when the JSON schema differs", () => {
    expect(key({ jsonSchema: SCHEMA })).not.toBe(
      key({ jsonSchema: { type: "object", properties: { score: { type: "string" } } } }),
    );
  });

  it("differs across call types for otherwise-identical inputs", () => {
    expect(key({ callType: "seo-scoring" })).not.toBe(key({ callType: "faq-generation" }));
  });
});

describe("AiResponseCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a miss, then a hit, for get/set", () => {
    const cache = new AiResponseCache(10, 60_000);
    expect(cache.get("k")).toBeUndefined();
    cache.set("k", { score: 1 });
    expect(cache.get("k")).toEqual({ score: 1 });
    expect(cache.stats()).toEqual({ hits: 1, misses: 1, size: 1 });
  });

  it("expires an entry once its TTL has passed", () => {
    const cache = new AiResponseCache(10, 1_000);
    cache.set("k", "value");
    vi.advanceTimersByTime(999);
    expect(cache.get("k")).toBe("value");
    vi.advanceTimersByTime(2);
    expect(cache.get("k")).toBeUndefined();
  });

  it("evicts the least-recently-used entry once over max size", () => {
    const cache = new AiResponseCache(2, 60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    // Touch "a" so "b" becomes the least-recently-used entry.
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.stats().size).toBe(2);
  });

  it("de-duplicates concurrent identical requests into one compute call", async () => {
    const cache = new AiResponseCache();
    let resolveCompute!: (value: string) => void;
    const compute = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveCompute = resolve;
        }),
    );

    const first = cache.wrap("k", compute);
    const second = cache.wrap("k", compute);
    expect(compute).toHaveBeenCalledTimes(1);

    resolveCompute("value");
    await expect(first).resolves.toBe("value");
    await expect(second).resolves.toBe("value");
  });

  it("caches a successful compute so a later call is a hit with no further compute calls", async () => {
    const cache = new AiResponseCache();
    const compute = vi.fn().mockResolvedValue("value");

    await cache.wrap("k", compute);
    const result = await cache.wrap("k", compute);

    expect(result).toBe("value");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("never caches a rejected compute — the next call tries again", async () => {
    const cache = new AiResponseCache();
    const compute = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("recovered");

    await expect(cache.wrap("k", compute)).rejects.toThrow("boom");
    const result = await cache.wrap("k", compute);

    expect(result).toBe("recovered");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("clear() resets entries, in-flight requests, and stats together", async () => {
    const cache = new AiResponseCache();
    cache.set("k", "value");
    cache.get("k");
    cache.get("missing");

    cache.clear();

    expect(cache.get("k")).toBeUndefined();
    expect(cache.stats()).toEqual({ hits: 0, misses: 1, size: 0 });
  });
});
