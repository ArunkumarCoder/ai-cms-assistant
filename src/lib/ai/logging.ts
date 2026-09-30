import { prisma } from "@/lib/db";
import type { AiCallLog } from "@prisma/client";
import type { AiCallType, AiProviderName, TokenUsage } from "./types";

export interface AiCallLogEntry {
  callType: AiCallType;
  provider: AiProviderName;
  model: string;
  usage: TokenUsage;
  estimatedCostUsd: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  siteId?: string;
  userId?: string;
  // Set only when this row is a fallback attempt (client.ts, SPEC.md §21) —
  // the provider that was actually configured for this call type and failed
  // first. See the Prisma model's own comment for why this is a field on
  // the fallback's row rather than a flag on the primary failure's row.
  fallbackFrom?: AiProviderName;
}

// Foundation for the Phase 5 cost dashboard, now built (Day 24, SPEC.md
// §20 — see getCallLogForSite below, the read side this was always written
// for) — every AI call goes through here via ./client.ts, success or
// failure. Logging failures matters as much as successes: a dashboard that
// only saw successful calls would undercount what a flaky/rate-limited
// provider actually cost in retries before giving up (see ./retry.ts).
//
// Never throws: a logging failure (DB hiccup, etc.) must not take down a
// feature whose AI call itself succeeded. This is the one deliberate
// exception to this codebase's "throw on real failures" convention
// (src/lib/cms/adapter.ts design note 3) — logging is observability, not a
// contract any caller depends on for correctness.
export async function logAiCall(entry: AiCallLogEntry): Promise<void> {
  try {
    await prisma.aiCallLog.create({
      data: {
        callType: entry.callType,
        provider: entry.provider,
        model: entry.model,
        inputTokens: entry.usage.inputTokens,
        outputTokens: entry.usage.outputTokens,
        estimatedCostUsd: entry.estimatedCostUsd,
        durationMs: entry.durationMs,
        success: entry.success,
        errorMessage: entry.errorMessage,
        siteId: entry.siteId,
        userId: entry.userId,
        fallbackFrom: entry.fallbackFrom,
      },
    });
  } catch (err) {
    console.error("Failed to write AI call log:", err);
  }
}

// Read side for the Cost & Usage screen (src/lib/costUsage/) — every logged
// call for a Site, oldest first (summarizeCostUsage groups by day itself, so
// order here doesn't matter for correctness, but a stable order makes this
// easier to reason about while debugging). Resilient like every other
// Postgres read helper in this app (getPageActivity, getLatestScoresForSite):
// a hiccup degrades that dashboard section, not the whole page. Calls logged
// before Day 24's siteId-attribution fix (SPEC.md §20) for page-generation/
// seo-scoring/block-regeneration won't show up here — a known, documented
// gap in old data, not something this function can recover.
export async function getCallLogForSite(siteId: string): Promise<AiCallLog[]> {
  try {
    return await prisma.aiCallLog.findMany({
      where: { siteId },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    console.error("Failed to load the AI call log:", err);
    return [];
  }
}
