import { createHash } from "node:crypto";
import type { AiCallType, JsonSchema } from "./types";

// Call types worth caching are the ones where the same input is expected to
// produce the same *meaningful* answer for a while — scoring/classification/
// description work, not generative drafting. `page-generation` and
// `block-regeneration` are deliberately excluded: a user clicking "Generate"
// or "Regenerate" again expects a genuinely new variant, and silently
// replaying a stale one would look like a broken button, not a feature.
const CACHEABLE_CALL_TYPES: ReadonlySet<AiCallType> = new Set([
  "seo-scoring",
  "faq-generation",
  "alt-text-single",
  "content-quality",
]);

export function isCacheableCallType(callType: AiCallType): boolean {
  return CACHEABLE_CALL_TYPES.has(callType);
}

export interface AiCacheKeyParts {
  callType: AiCallType;
  userId: string | undefined;
  siteId: string | undefined;
  prompt: string;
  imageUrl: string | undefined;
  jsonSchema: JsonSchema;
}

// userId/siteId are part of the key itself, not a separate partition — two
// different users (or the same user on two different Sites) asking the exact
// same question never share an entry, by construction, rather than by a
// filter someone could forget to apply. The prompt/imageUrl/jsonSchema are
// hashed together (sha256, truncated — collision resistance has to be
// decent, not cryptographic) rather than concatenated raw, since a page-draft
// prompt can run to several KB and this key only needs to be unique, not
// readable.
export function buildAiCacheKey(parts: AiCacheKeyParts): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ prompt: parts.prompt, imageUrl: parts.imageUrl ?? null, jsonSchema: parts.jsonSchema }))
    .digest("hex")
    .slice(0, 32);
  return `${parts.callType}:${parts.userId ?? "anon"}:${parts.siteId ?? "none"}:${digest}`;
}

const DEFAULT_MAX_SIZE = 200;
// 15 minutes: long enough that re-opening the SEO panel or re-running a
// batch a few minutes later is a hit, short enough that a page's content
// changing mid-session doesn't serve a noticeably stale score/suggestion for
// long. There's no revalidation signal to key off (no webhook, no content
// hash this layer sees) — a fixed TTL is the simplest honest choice.
const DEFAULT_TTL_MS = 15 * 60 * 1000;

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface AiCacheStats {
  hits: number;
  misses: number;
  size: number;
}

// Plain in-memory TTL + LRU cache with in-flight de-duplication, scoped to
// one server process. Deliberately not backed by Redis/anything shared: the
// task this exists for (skip re-asking the same provider question twice in a
// row) doesn't need cross-instance sharing to pay off, and every deploy
// restarting with an empty cache is an acceptable, documented tradeoff (see
// README's Performance section) rather than a bug.
//
// `store` is a `Map`, which iterates in insertion order — both `get` (on a
// hit) and `set` delete-then-reinsert a key to move it to the end, so the
// first key in iteration order is always the least-recently-used one, which
// is what `evictIfNeeded` evicts first once `maxSize` is exceeded.
export class AiResponseCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly maxSize: number = DEFAULT_MAX_SIZE,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  get<V>(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    // Touch: move to the end so it reads as "most recently used" for LRU
    // eviction purposes.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.value as V;
  }

  set<V>(key: string, value: V): void {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  // The shared entry point: a cache hit returns immediately with no call to
  // `compute` at all (so no rate-limit wait, no provider call, no cost-log
  // row — the caller never even runs). A miss checks for an identical
  // request already in flight and awaits that instead of starting a second
  // one — two concurrent clicks, or two components asking the same question
  // at once, cost one provider call, not two. Only a `compute` that resolves
  // gets cached; a rejection (provider failure, exhausted validation
  // retries) is never stored, so the next attempt always tries fresh rather
  // than replaying a failure.
  async wrap<V>(key: string, compute: () => Promise<V>): Promise<V> {
    const cached = this.get<V>(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key) as Promise<V> | undefined;
    if (pending) return pending;

    const promise = compute()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  stats(): AiCacheStats {
    return { hits: this.hits, misses: this.misses, size: this.store.size };
  }

  // Not just a test helper: a future "flush the AI cache" admin action would
  // call this too. Resets hit/miss counters along with the store, since a
  // fresh cache life should report fresh stats.
  clear(): void {
    this.store.clear();
    this.inFlight.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

export const aiResponseCache = new AiResponseCache();
