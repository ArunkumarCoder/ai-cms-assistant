import { prisma } from "@/lib/db";
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
}

// Foundation for the Phase 5 cost dashboard (today's task item 4) — every AI
// call goes through here via ./client.ts, success or failure. Logging
// failures matters as much as successes: a dashboard that only saw
// successful calls would undercount what a flaky/rate-limited provider
// actually cost in retries before giving up (see ./retry.ts).
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
      },
    });
  } catch (err) {
    console.error("Failed to write AI call log:", err);
  }
}
