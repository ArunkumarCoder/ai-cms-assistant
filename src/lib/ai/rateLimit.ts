import type { AiProviderName } from "./types";

// Conservative defaults, not measured SLAs — Groq's free tier is the one
// that actually matters here (task's own framing: "this matters most for
// Groq, since its free-tier limits are noticeably tighter than paid
// OpenAI/Claude"); OpenAI/Anthropic get a generous ceiling that exists as a
// safety backstop, not something a normal demo workload should ever brush
// against. Overridable per provider via `AI_RATE_LIMIT_<PROVIDER>_RPM` (same
// env-override convention as ./routing.ts's `AI_ROUTE_<CALL_TYPE>`) for
// whoever's actual account tier differs from these guesses.
const DEFAULT_RPM: Record<AiProviderName, number> = {
  groq: 25,
  openai: 500,
  anthropic: 500,
};

function resolveRpmLimit(provider: AiProviderName): number {
  const override = process.env[`AI_RATE_LIMIT_${provider.toUpperCase()}_RPM`];
  const parsed = override !== undefined ? Number(override) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RPM[provider];
}

const WINDOW_MS = 60_000;

interface Window {
  timestamps: number[];
}

const windows = new Map<AiProviderName, Window>();

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WaitForRateLimitSlotOptions {
  // Injectable clock/sleep so tests can drive this deterministically and
  // instantly instead of waiting on real wall-clock minutes — see
  // rateLimit.test.ts. Production callers (client.ts) never pass these.
  now?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
}

// A sliding 60-second window per provider: blocks (queues, doesn't reject)
// until there's genuinely room for one more request, rather than firing
// everything immediately and letting the provider's own 429 respond. This is
// the "queue/delay rather than failing outright where that makes sense"
// half of task item 2 — the reactive half (what happens if a 429 still
// slips through anyway) lives in ./retry.ts's rate-limit-aware backoff.
//
// The check-then-record step below is synchronous (no `await` between
// reading `window.timestamps.length` and pushing to it), so concurrent
// callers can't both observe "there's room" for the same slot — only the
// `await sleepFn(...)` branch yields control, and it always re-checks from
// scratch after waking rather than assuming the slot it was waiting for is
// still free.
export async function waitForRateLimitSlot(
  provider: AiProviderName,
  options: WaitForRateLimitSlotOptions = {},
): Promise<void> {
  const now = options.now ?? Date.now;
  const sleepFn = options.sleepFn ?? defaultSleep;
  const limit = resolveRpmLimit(provider);

  for (;;) {
    const nowMs = now();
    const window = windows.get(provider) ?? { timestamps: [] };
    while (window.timestamps.length > 0 && nowMs - window.timestamps[0] >= WINDOW_MS) {
      window.timestamps.shift();
    }

    if (window.timestamps.length < limit) {
      window.timestamps.push(nowMs);
      windows.set(provider, window);
      return;
    }

    windows.set(provider, window);
    const waitMs = WINDOW_MS - (nowMs - window.timestamps[0]) + 10;
    await sleepFn(waitMs);
  }
}

// Test-only escape hatch — this module's per-provider windows are process-
// level singleton state (deliberately, so every call through the app shares
// one real budget per provider), which means tests must explicitly clear it
// between runs rather than relying on module re-isolation.
export function __resetRateLimitStateForTests(): void {
  windows.clear();
}
