import type { QualityScore } from "@/lib/quality";

function scoreClassName(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBarClassName(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

const SUB_SCORE_LABELS: { key: keyof QualityScore["subScores"]; label: string }[] = [
  { key: "seo", label: "SEO" },
  { key: "readability", label: "Readability" },
  { key: "structure", label: "Structure" },
];

interface QualityScorePanelProps {
  quality: QualityScore;
}

// The composite quality score front and center, with each contributing
// sub-score visible right below it and its own short "why" — a score never
// appears here without an explanation attached. See SPEC.md §10 for exactly
// how the composite and each sub-score are weighted; the reasons themselves
// are computed text reused from src/lib/quality/score.ts, not written here.
export function QualityScorePanel({ quality }: QualityScorePanelProps) {
  return (
    <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-zinc-700 dark:text-zinc-300">Quality score</h2>
        <span className={`text-2xl font-semibold ${scoreClassName(quality.score)}`}>
          {quality.score}
          <span className="text-sm font-normal text-zinc-400">/100</span>
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {SUB_SCORE_LABELS.map(({ key, label }) => {
          const sub = quality.subScores[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
                <span className={`shrink-0 text-xs font-medium ${scoreClassName(sub.score)}`}>
                  {sub.score}/100
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full ${scoreBarClassName(sub.score)}`}
                  style={{ width: `${sub.score}%` }}
                />
              </div>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{sub.reason}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
