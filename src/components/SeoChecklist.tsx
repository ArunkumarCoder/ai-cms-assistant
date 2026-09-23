import type { SeoAnalysis, SeoCheckCategory, SeoCheckResult, SeoCheckStatus } from "@/lib/seo";
import type { SeoSuggestions } from "@/lib/ai";

function PassIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.03-9.47a.75.75 0 00-1.06-1.06L9 10.44 7.03 8.47a.75.75 0 00-1.06 1.06l2.5 2.5a.75.75 0 001.06 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function WarnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M9.401 2.25c.916-1.5 3.283-1.5 4.198 0l7.398 12.15c.94 1.542-.164 3.5-1.973 3.5H3.976c-1.81 0-2.913-1.958-1.973-3.5L9.4 2.25zM10 8a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 0110 8zm0 8a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function FailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function NotApplicableIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9.25a.75.75 0 000 1.5h6a.75.75 0 000-1.5H7z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9 4.5a.5.5 0 01.474.342l.808 2.421a3 3 0 001.955 1.955l2.421.808a.5.5 0 010 .948l-2.421.808a3 3 0 00-1.955 1.955l-.808 2.421a.5.5 0 01-.948 0l-.808-2.421a3 3 0 00-1.955-1.955l-2.421-.808a.5.5 0 010-.948l2.421-.808A3 3 0 007.666 7.263l.808-2.421A.5.5 0 019 4.5zM16 2a.4.4 0 01.38.276l.31.93a1.2 1.2 0 00.782.782l.93.31a.4.4 0 010 .76l-.93.31a1.2 1.2 0 00-.782.782l-.31.93a.4.4 0 01-.76 0l-.31-.93a1.2 1.2 0 00-.782-.782l-.93-.31a.4.4 0 010-.76l.93-.31a1.2 1.2 0 00.782-.782l.31-.93A.4.4 0 0116 2z" />
    </svg>
  );
}

const STATUS_STYLES: Record<SeoCheckStatus, { icon: typeof PassIcon; className: string }> = {
  pass: { icon: PassIcon, className: "text-emerald-600 dark:text-emerald-400" },
  warn: { icon: WarnIcon, className: "text-amber-600 dark:text-amber-400" },
  fail: { icon: FailIcon, className: "text-red-600 dark:text-red-400" },
  "not-applicable": { icon: NotApplicableIcon, className: "text-zinc-400 dark:text-zinc-500" },
};

function scoreClassName(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

interface Group {
  label: string;
  categories: SeoCheckCategory[];
}

// "Titles & meta" folds in keywordUsage alongside metaTags — keyword density
// is really a title/meta-copy concern in practice, and the brief's own
// example groups ("Titles & meta", "Structure", "Readability") only name
// three buckets for four check categories.
const GROUPS: Group[] = [
  { label: "Titles & meta", categories: ["metaTags", "keywordUsage"] },
  { label: "Structure", categories: ["headingStructure"] },
  { label: "Readability", categories: ["readability"] },
];

// AI suggestion `category` is a free-text string (seoSuggestionSchema), not
// constrained to SeoCheckCategory's literal keys — matched loosely rather
// than exactly so a model saying "Meta Tags" or "meta description" both land
// under the right group.
const GROUP_MATCH_KEYWORDS: Record<SeoCheckCategory, string[]> = {
  metaTags: ["meta", "title"],
  keywordUsage: ["keyword"],
  headingStructure: ["heading", "structure", "hierarchy"],
  readability: ["read"],
};

function groupMatchesSuggestion(group: Group, suggestionCategory: string): boolean {
  const lower = suggestionCategory.toLowerCase();
  return group.categories.some((category) =>
    GROUP_MATCH_KEYWORDS[category].some((keyword) => lower.includes(keyword)),
  );
}

interface SeoChecklistProps {
  analysis: SeoAnalysis;
  suggestions: SeoSuggestions | null;
  onCheckClick: (check: SeoCheckResult) => void;
  onApplyTitle: (value: string) => void;
  onApplyMetaDescription: (value: string) => void;
}

export function SeoChecklist({
  analysis,
  suggestions,
  onCheckClick,
  onApplyTitle,
  onApplyMetaDescription,
}: SeoChecklistProps) {
  const matchedSuggestionIndexes = new Set<number>();

  const groupRows = GROUPS.map((group) => {
    const checks = analysis.checks.filter((c) => group.categories.includes(c.category));
    const matchedSuggestions = (suggestions?.suggestions ?? [])
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => groupMatchesSuggestion(group, s.category));
    matchedSuggestions.forEach(({ index }) => matchedSuggestionIndexes.add(index));
    return { group, checks, matchedSuggestions: matchedSuggestions.map(({ s }) => s) };
  });

  const otherSuggestions = (suggestions?.suggestions ?? []).filter(
    (_, index) => !matchedSuggestionIndexes.has(index),
  );

  return (
    <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-zinc-700 dark:text-zinc-300">SEO checks</h2>
        <span className={`text-xs font-medium ${scoreClassName(analysis.score)}`}>
          Score: {analysis.score}/100
        </span>
      </div>

      <div className="mt-3 space-y-5">
        {groupRows.map(({ group, checks, matchedSuggestions }) => (
          <div key={group.label}>
            <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              {group.label}
            </h3>
            <ul className="mt-2 space-y-2">
              {checks.map((check) => {
                const { icon: Icon, className } = STATUS_STYLES[check.status];
                const clickable = check.status !== "not-applicable" || check.id === "keywordDensity";
                const suggestedValue =
                  check.id === "titleLength"
                    ? suggestions?.suggestedMetaTitle
                    : check.id === "metaDescriptionLength"
                      ? suggestions?.suggestedMetaDescription
                      : null;

                return (
                  <li key={check.id}>
                    <button
                      type="button"
                      onClick={clickable ? () => onCheckClick(check) : undefined}
                      disabled={!clickable}
                      className={`flex w-full items-start gap-3 rounded-lg p-2 text-left ${
                        clickable ? "hover:bg-zinc-50 dark:hover:bg-zinc-900" : "cursor-default"
                      }`}
                    >
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${className}`} />
                      <div>
                        <p className="font-medium text-zinc-700 dark:text-zinc-300">{check.label}</p>
                        <p className="text-zinc-600 dark:text-zinc-400">{check.reason}</p>
                      </div>
                    </button>

                    {suggestedValue && (
                      <div className="mt-1 ml-8 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300">
                        <AiIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">AI suggests a change</p>
                          <p className="mt-0.5">{suggestedValue}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            check.id === "titleLength"
                              ? onApplyTitle(suggestedValue)
                              : onApplyMetaDescription(suggestedValue)
                          }
                          className="shrink-0 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {matchedSuggestions.length > 0 && (
              <ul className="mt-2 space-y-2">
                {matchedSuggestions.map((s, i) => (
                  <li
                    key={i}
                    className="ml-8 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300"
                  >
                    <AiIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">AI suggests a change</p>
                      <p className="mt-0.5">{s.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {(otherSuggestions.length > 0 || (suggestions?.keywordGaps.length ?? 0) > 0) && (
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Other AI suggestions
            </h3>
            <ul className="mt-2 space-y-2">
              {otherSuggestions.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300"
                >
                  <AiIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{s.message}</p>
                </li>
              ))}
              {suggestions && suggestions.keywordGaps.length > 0 && (
                <li className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300">
                  <AiIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Keyword gaps: {suggestions.keywordGaps.join(", ")}</p>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
