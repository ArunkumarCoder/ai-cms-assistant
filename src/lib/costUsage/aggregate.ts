export interface CallLogEntry {
  provider: string;
  callType: string;
  estimatedCostUsd: number;
  success: boolean;
  createdAt: Date;
  fallbackFrom?: string | null;
}

export interface ProviderBreakdown {
  provider: string;
  callCount: number;
  totalCostUsd: number;
}

export interface CallTypeBreakdown {
  callType: string;
  callCount: number;
  totalCostUsd: number;
}

export interface DailySpend {
  date: string; // YYYY-MM-DD, UTC
  callCount: number;
  totalCostUsd: number;
}

export interface DominantProvider {
  provider: string;
  percentOfCalls: number;
}

export interface CostUsageSummary {
  totalCalls: number;
  failedCalls: number;
  totalCostUsd: number;
  byProvider: ProviderBreakdown[];
  byCallType: CallTypeBreakdown[];
  byDay: DailySpend[];
  // Which provider is actually handling the bulk of calls in practice
  // (task item 3) — a sanity check on Day 9's Groq-default routing, not just
  // a repeat of `byProvider` (that's sorted by cost; this is specifically
  // about call *volume*, since routing is a volume decision, not a cost
  // one — the whole point of Groq-by-default is "most calls are free/cheap
  // regardless of what the few paid vision calls cost").
  dominantProvider: DominantProvider | null;
  // How many rows are fallback attempts (client.ts sets `fallbackFrom` only
  // on those) — a real, visible count for "log that a fallback occurred,
  // don't silently swap providers" (Day 21's task item 4), surfaced in the
  // dashboard UI itself rather than only sitting queryable in Postgres.
  fallbackCalls: number;
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// One pass over already-logged rows (src/lib/ai/logging.ts's logAiCall,
// running since Day 9) into every breakdown this screen shows — no new AI
// calls, no per-row recomputation of anything already stored (task item 5).
// An empty log (a brand-new Site, or one that's never made an AI call yet)
// produces all-zero/empty results, never a crash — same "handle a small
// Site gracefully" standard Day 23's health dashboard already set.
export function summarizeCostUsage(entries: readonly CallLogEntry[]): CostUsageSummary {
  const totalCalls = entries.length;
  const failedCalls = entries.filter((e) => !e.success).length;
  const totalCostUsd = entries.reduce((sum, e) => sum + e.estimatedCostUsd, 0);

  const providerTotals = new Map<string, { callCount: number; totalCostUsd: number }>();
  const callTypeTotals = new Map<string, { callCount: number; totalCostUsd: number }>();
  const dayTotals = new Map<string, { callCount: number; totalCostUsd: number }>();

  for (const entry of entries) {
    const provider = providerTotals.get(entry.provider) ?? { callCount: 0, totalCostUsd: 0 };
    provider.callCount++;
    provider.totalCostUsd += entry.estimatedCostUsd;
    providerTotals.set(entry.provider, provider);

    const callType = callTypeTotals.get(entry.callType) ?? { callCount: 0, totalCostUsd: 0 };
    callType.callCount++;
    callType.totalCostUsd += entry.estimatedCostUsd;
    callTypeTotals.set(entry.callType, callType);

    const dayKey = utcDateKey(entry.createdAt);
    const day = dayTotals.get(dayKey) ?? { callCount: 0, totalCostUsd: 0 };
    day.callCount++;
    day.totalCostUsd += entry.estimatedCostUsd;
    dayTotals.set(dayKey, day);
  }

  const byProvider = Array.from(providerTotals, ([provider, totals]) => ({ provider, ...totals })).sort(
    (a, b) => b.totalCostUsd - a.totalCostUsd,
  );
  const byCallType = Array.from(callTypeTotals, ([callType, totals]) => ({ callType, ...totals })).sort(
    (a, b) => b.totalCostUsd - a.totalCostUsd,
  );
  const byDay = Array.from(dayTotals, ([date, totals]) => ({ date, ...totals })).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const dominantProvider =
    totalCalls > 0
      ? (() => {
          const [top] = [...byProvider].sort((a, b) => b.callCount - a.callCount);
          return { provider: top.provider, percentOfCalls: Math.round((top.callCount / totalCalls) * 100) };
        })()
      : null;

  const fallbackCalls = entries.filter((e) => e.fallbackFrom).length;

  return {
    totalCalls,
    failedCalls,
    totalCostUsd,
    byProvider,
    byCallType,
    byDay,
    dominantProvider,
    fallbackCalls,
  };
}
