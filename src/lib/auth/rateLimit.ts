// Day 37's abuse protection for the public login/signup forms — the AI
// layer has had a rate limiter since SPEC.md §21, but nothing has ever
// guarded the one pair of endpoints a public, internet-facing demo actually
// gets hit on: credential-stuffing against /login, automated spam against
// /signup. A fixed window per (action, IP) is enough for "basic signup
// protection" (the task's own wording) without the complexity a sliding
// window buys for the AI rate limiter's much higher-volume, cost-sensitive
// use case.
//
// Per-server-instance, same documented tradeoff as src/lib/ai/rateLimit.ts
// and src/lib/ai/cache.ts: on a multi-instance serverless deployment, each
// instance enforces its own independent budget, so the *effective* limit
// scales with instance count rather than being one true global ceiling.
// Still real protection against a single-source script hitting one warm
// instance repeatedly, which is the common case this exists for; a hard
// global guarantee would need a shared store (Vercel KV/Redis), which is a
// real infrastructure dependency this task doesn't ask for.
export type AuthRateLimitAction = "login" | "signup";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS: Record<AuthRateLimitAction, number> = {
  // Login gets more headroom than signup — a real user mistyping a password
  // a few times in a minute is normal; nobody legitimately submits the
  // signup form five times in a minute.
  login: 10,
  signup: 5,
};

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterSeconds?: number;
}

// Pure (aside from the shared `buckets` map) and synchronous — `now` is
// injectable specifically so rateLimit.test.ts can exercise window expiry
// without a real clock or fake timers.
export function checkAuthRateLimit(
  action: AuthRateLimitAction,
  identifier: string,
  now: number = Date.now(),
): RateLimitVerdict {
  const key = `${action}:${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= MAX_ATTEMPTS[action]) {
    const retryAfterSeconds = Math.ceil(
      (bucket.windowStart + WINDOW_MS - now) / 1000,
    );
    return {
      allowed: false,
      retryAfterSeconds: Math.max(retryAfterSeconds, 1),
    };
  }

  bucket.count++;
  return { allowed: true };
}

export function __resetAuthRateLimitForTests(): void {
  buckets.clear();
}
