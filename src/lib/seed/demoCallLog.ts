import { estimateCostUsd } from "@/lib/ai/pricing";
import type { AiCallType, AiProviderName } from "@/lib/ai/types";

// Backfills the Cost & Usage dashboard and the AI side of the Health
// dashboard with a believable multi-week history — without ever calling a
// real (paid) AI provider. Every row is deterministic: same `baseDate` in,
// same rows out, every time, each with a fixed `id` the caller `upsert()`s
// on — re-running the seed converges to the same ~40 rows rather than
// appending more, the same idempotency guarantee the page content gets.
//
// Only the five call types that have a real call site today (src/lib/ai/
// routing.ts's own table, cross-referenced against actual Server Action
// call sites as of Day 34's SPEC note) — "content-quality" and "faq-schema"
// have routing entries but nothing in the live app currently triggers them,
// so including them here would make the demo's own logged history look more
// complete than the real app's ever could be.
const CALL_TYPES: {
  type: AiCallType;
  provider: AiProviderName;
  model: string;
  inputRange: [number, number];
  outputRange: [number, number];
}[] = [
  {
    type: "page-generation",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    inputRange: [900, 1600],
    outputRange: [700, 1300],
  },
  {
    type: "block-regeneration",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    inputRange: [500, 900],
    outputRange: [200, 450],
  },
  {
    type: "seo-scoring",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    inputRange: [400, 750],
    outputRange: [150, 320],
  },
  {
    type: "faq-generation",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    inputRange: [600, 1050],
    outputRange: [300, 550],
  },
  {
    type: "alt-text-single",
    provider: "openai",
    model: "gpt-4o-mini",
    inputRange: [500, 950],
    outputRange: [60, 160],
  },
];

const FALLBACK_MODEL: Record<string, string> = {
  openai: "gpt-4o-mini",
};

const DAYS_OF_HISTORY = 21;

// A tiny seeded PRNG (mulberry32) instead of Math.random() — every value
// this produces has to be reproducible across runs for the rows to actually
// be idempotent, not just plausible-looking.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intInRange(rand: () => number, [min, max]: [number, number]): number {
  return Math.floor(min + rand() * (max - min + 1));
}

export interface DemoAiCallLogRow {
  id: string;
  callType: AiCallType;
  provider: AiProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  fallbackFrom?: AiProviderName;
  siteId: string;
  userId: string;
  createdAt: Date;
}

// `baseDate` is "now" from the caller's perspective — every row's
// `createdAt` is `baseDate` minus some number of days/hours, so the backfill
// always ends just before the present moment regardless of when the seed
// script actually runs.
export function buildDemoAiCallLogRows(
  baseDate: Date,
  siteId: string,
  userId: string,
): DemoAiCallLogRow[] {
  const rows: DemoAiCallLogRow[] = [];
  const rand = mulberry32(20260101);

  for (let dayOffset = DAYS_OF_HISTORY; dayOffset >= 0; dayOffset--) {
    const callsToday = 1 + Math.floor(rand() * 4); // 1-4 calls most days
    for (let callIndex = 0; callIndex < callsToday; callIndex++) {
      const spec = CALL_TYPES[Math.floor(rand() * CALL_TYPES.length)];
      const hour = 8 + Math.floor(rand() * 10); // roughly business hours
      const createdAt = new Date(baseDate);
      createdAt.setDate(createdAt.getDate() - dayOffset);
      createdAt.setHours(
        hour,
        Math.floor(rand() * 60),
        Math.floor(rand() * 60),
        0,
      );

      const inputTokens = intInRange(rand, spec.inputRange);
      const outputTokens = intInRange(rand, spec.outputRange);
      // Roughly 1 in 14 calls fails outright (a timeout or a transient
      // 5xx) — "a few failures," not so many the dashboard reads as broken.
      const isFailure = rand() < 0.07;

      rows.push({
        id: `demo-aicalllog-${dayOffset}-${callIndex}`,
        callType: spec.type,
        provider: spec.provider,
        model: isFailure ? "unknown" : spec.model,
        inputTokens: isFailure ? 0 : inputTokens,
        outputTokens: isFailure ? 0 : outputTokens,
        estimatedCostUsd: isFailure
          ? 0
          : estimateCostUsd(spec.provider, spec.model, {
              inputTokens,
              outputTokens,
            }),
        durationMs: isFailure ? 30_000 : intInRange(rand, [700, 4200]),
        success: !isFailure,
        errorMessage: isFailure
          ? `${spec.provider} request timed out.`
          : undefined,
        siteId,
        userId,
        createdAt,
      });
    }
  }

  // One explicit, clearly-visible fallback example (task: "a few failures
  // and a fallback") — a groq page-generation call fails, then the same
  // logical request succeeds on OpenAI a moment later, tagged
  // `fallbackFrom: "groq"` exactly like client.ts's own real fallback
  // logging (runLogged in src/lib/ai/client.ts).
  const fallbackAt = new Date(baseDate);
  fallbackAt.setDate(fallbackAt.getDate() - 3);
  fallbackAt.setHours(10, 15, 0, 0);
  rows.push({
    id: "demo-aicalllog-fallback-primary",
    callType: "page-generation",
    provider: "groq",
    model: "unknown",
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    durationMs: 30_000,
    success: false,
    errorMessage: "groq request timed out.",
    siteId,
    userId,
    createdAt: fallbackAt,
  });
  const fallbackResultAt = new Date(fallbackAt.getTime() + 2_000);
  const fallbackInput = 1200;
  const fallbackOutput = 950;
  rows.push({
    id: "demo-aicalllog-fallback-result",
    callType: "page-generation",
    provider: "openai",
    model: FALLBACK_MODEL.openai,
    inputTokens: fallbackInput,
    outputTokens: fallbackOutput,
    estimatedCostUsd: estimateCostUsd("openai", FALLBACK_MODEL.openai, {
      inputTokens: fallbackInput,
      outputTokens: fallbackOutput,
    }),
    durationMs: 2_100,
    success: true,
    fallbackFrom: "groq",
    siteId,
    userId,
    createdAt: fallbackResultAt,
  });

  return rows;
}
