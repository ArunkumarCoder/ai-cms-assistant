import type { CostUsageSummary } from "@/lib/costUsage";

const PROVIDER_LABEL: Record<string, string> = {
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
};

// Every AiCallType this app's routing table (src/lib/ai/routing.ts) knows
// about — including two ("alt-text-batch", "content-quality") that never
// actually get logged in practice today: batch alt-text reuses the single-
// image call type (Day 18's "same logic, not a parallel path"), and quality
// scoring was resolved deterministically instead of via AI (Day 14). Kept
// here anyway so a real future call under either type is labeled correctly
// on day one rather than falling back to a raw enum value.
const CALL_TYPE_LABEL: Record<string, string> = {
  "page-generation": "Page generation",
  "block-regeneration": "Block regeneration",
  "seo-scoring": "SEO suggestions",
  "alt-text-single": "Alt text",
  "alt-text-batch": "Alt text (batch)",
  "faq-generation": "FAQ generation",
  "faq-schema": "FAQ schema (JSON-LD)",
  "content-quality": "Quality scoring",
};

function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

// Plain server-rendered section, no "use client" — every number here was
// already computed by summarizeCostUsage before this renders; there's
// nothing interactive to ship to the browser for it.
export function CostUsagePanel({ summary }: { summary: CostUsageSummary }) {
  if (summary.totalCalls === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No AI calls logged yet for this Site — this fills in the moment you generate a page, run an
        SEO suggestion, or process an image.
      </p>
    );
  }

  const maxDaySpend = Math.max(...summary.byDay.map((day) => day.totalCostUsd), 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total spend" value={formatUsd(summary.totalCostUsd)} />
        <StatCard label="Total calls" value={String(summary.totalCalls)} />
        <StatCard
          label="Dominant provider"
          value={summary.dominantProvider ? PROVIDER_LABEL[summary.dominantProvider.provider] ?? summary.dominantProvider.provider : "—"}
          hint={summary.dominantProvider ? `${summary.dominantProvider.percentOfCalls}% of calls` : undefined}
        />
        <StatCard
          label="Failed calls"
          value={String(summary.failedCalls)}
          hint={summary.totalCalls > 0 ? `${Math.round((summary.failedCalls / summary.totalCalls) * 100)}% of total` : undefined}
        />
      </div>

      {summary.fallbackCalls > 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          {summary.fallbackCalls} call{summary.fallbackCalls === 1 ? "" : "s"} fell back to a different
          provider after the configured one failed — never silent, always logged (SPEC.md §21).
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Spend by provider
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {summary.byProvider.map((p) => (
              <li key={p.provider} className="flex items-center justify-between gap-3">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {PROVIDER_LABEL[p.provider] ?? p.provider}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {formatUsd(p.totalCostUsd)} · {p.callCount} call{p.callCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Spend by feature
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {summary.byCallType.map((c) => (
              <li key={c.callType} className="flex items-center justify-between gap-3">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {CALL_TYPE_LABEL[c.callType] ?? c.callType}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {formatUsd(c.totalCostUsd)} · {c.callCount} call{c.callCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Spend per day
        </p>
        <div className="mt-3 space-y-1.5">
          {summary.byDay.map((day) => (
            <div key={day.date} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">{day.date}</span>
              <div className="h-3.5 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded bg-violet-500"
                  style={{ width: `${maxDaySpend > 0 ? (day.totalCostUsd / maxDaySpend) * 100 : 0}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-zinc-600 dark:text-zinc-400">
                {formatUsd(day.totalCostUsd)}
              </span>
              <span className="w-16 shrink-0 text-right text-zinc-500 dark:text-zinc-400">
                {day.callCount} call{day.callCount === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
