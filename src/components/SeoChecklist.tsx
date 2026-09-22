import type { SeoAnalysis, SeoCheckStatus } from "@/lib/seo";

const STATUS_LABELS: Record<SeoCheckStatus, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
  "not-applicable": "N/A",
};

const STATUS_STYLES: Record<SeoCheckStatus, string> = {
  pass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  fail: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  "not-applicable": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

// Deterministic, rule-based checks from src/lib/seo/ — no AI involved. Tomorrow's
// AI-suggestion layer renders alongside this, not instead of it.
export function SeoChecklist({ analysis }: { analysis: SeoAnalysis }) {
  return (
    <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-zinc-700 dark:text-zinc-300">SEO checks</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Score: {analysis.score}/100
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {analysis.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[check.status]}`}
            >
              {STATUS_LABELS[check.status]}
            </span>
            <div>
              <p className="font-medium text-zinc-700 dark:text-zinc-300">{check.label}</p>
              <p className="text-zinc-600 dark:text-zinc-400">{check.reason}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
