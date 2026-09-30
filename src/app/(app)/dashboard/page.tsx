import { redirect } from "next/navigation";
import { getActiveSiteForCurrentUser, getAdapterForCurrentUser, NoSiteConnectedError } from "@/lib/cms";
import { assessAltText } from "@/lib/images";
import { getLatestScoresForSite } from "@/lib/quality";
import { getCallLogForSite } from "@/lib/ai";
import { summarizeCostUsage, type CostUsageSummary } from "@/lib/costUsage";
import {
  averageSubScores,
  summarizeSiteHealth,
  type PageHealthInput,
  type SiteHealthSummary,
  type SubScoreAverages,
} from "@/lib/dashboard";
import { HealthQueue } from "@/components/HealthQueue";
import { CostUsagePanel } from "@/components/CostUsagePanel";

export const metadata = { title: "Dashboard" };

type DashboardResult =
  | {
      kind: "ok";
      summary: SiteHealthSummary;
      subScoreAverages: SubScoreAverages | null;
      pages: PageHealthInput[];
      costUsage: CostUsageSummary;
    }
  | { kind: "error"; message: string };

// Everything here is a read of data this app already computes and stores —
// PageSummary's own persisted qualityScore/faqCount (Day 14/19), listImages()
// + assessAltText (the exact function Media Library already uses, Day 16),
// and getLatestScoresForSite reading Day 15's QualityScoreHistory. No AI
// calls, no per-page recomputation — this task's own "read-heavy and fast"
// requirement (item 4).
async function getDashboardData(): Promise<DashboardResult> {
  try {
    const [adapter, site] = await Promise.all([getAdapterForCurrentUser(), getActiveSiteForCurrentUser()]);
    const [pages, images] = await Promise.all([adapter.getPages(), adapter.listImages()]);

    const flaggedImagesByPageId = new Map<string, number>();
    let flaggedImages = 0;
    for (const image of images) {
      if (!assessAltText(image).flagged) continue;
      flaggedImages++;
      const pageId = image.usedOnPageIds[0];
      if (pageId) flaggedImagesByPageId.set(pageId, (flaggedImagesByPageId.get(pageId) ?? 0) + 1);
    }

    const healthPages: PageHealthInput[] = pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      status: page.status,
      qualityScore: page.qualityScore,
      faqCount: page.faqCount,
      flaggedImageCount: flaggedImagesByPageId.get(page.id) ?? 0,
    }));

    const latestScores = site ? await getLatestScoresForSite(site.id) : [];
    const subScoreAverages = averageSubScores(
      latestScores.map((entry) => ({
        seo: entry.subScores.seo.score,
        readability: entry.subScores.readability.score,
        structure: entry.subScores.structure.score,
      })),
    );

    // src/lib/ai/logging.ts's AiCallLog, running since Day 9 — a second,
    // independent read alongside the page/image data above, not something
    // that gates on there being any pages at all (a Site can have AI call
    // history from pages that were since deleted, or simply no pages yet).
    const callLog = site ? await getCallLogForSite(site.id) : [];
    const costUsage = summarizeCostUsage(
      callLog.map((row) => ({
        provider: row.provider,
        callType: row.callType,
        estimatedCostUsd: row.estimatedCostUsd,
        success: row.success,
        createdAt: row.createdAt,
        fallbackFrom: row.fallbackFrom,
      })),
    );

    return {
      kind: "ok",
      summary: summarizeSiteHealth(healthPages, images.length, flaggedImages),
      subScoreAverages,
      pages: healthPages,
      costUsage,
    };
  } catch (err) {
    if (err instanceof NoSiteConnectedError) {
      redirect("/sites");
    }
    console.error("Failed to build the dashboard:", err);
    return { kind: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
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

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  "in-review": "In review",
  approved: "Approved",
  published: "Published",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  draft: "bg-zinc-400",
  "in-review": "bg-amber-500",
  approved: "bg-blue-500",
  published: "bg-emerald-500",
};

export default async function DashboardPage() {
  const result = await getDashboardData();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Everything this app already knows about this Site&apos;s content, in one place.
        </p>
      </div>

      {result.kind === "error" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">Couldn&apos;t build the dashboard.</p>
          <p className="mt-1 text-sm opacity-80">{result.message}</p>
        </div>
      )}

      {result.kind === "ok" && result.summary.totalPages === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No pages yet on this Site — there&apos;s nothing to aggregate until there is.
        </div>
      )}

      {result.kind === "ok" && result.summary.totalPages > 0 && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Pages" value={String(result.summary.totalPages)} />
            <StatCard
              label="Avg. quality score"
              value={result.summary.averageQualityScore !== null ? `${result.summary.averageQualityScore}/100` : "—"}
              hint={result.summary.averageQualityScore === null ? "No scored pages yet" : undefined}
            />
            <StatCard
              label="Flagged images"
              value={`${result.summary.flaggedImages} / ${result.summary.totalImages}`}
              hint="need alt text"
            />
            <StatCard
              label="Pages with FAQs"
              value={`${result.summary.pagesWithFaqs} / ${result.summary.totalPages}`}
            />
          </div>

          <section className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Review state
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((status) => (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {result.summary.statusCounts[status as keyof typeof result.summary.statusCounts]}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">{STATUS_LABEL[status]}</span>
                </div>
              ))}
            </div>
          </section>

          {result.subScoreAverages && (
            <section className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Average quality sub-scores
              </p>
              <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xl font-semibold">{result.subScoreAverages.seo}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">SEO</p>
                </div>
                <div>
                  <p className="text-xl font-semibold">{result.subScoreAverages.readability}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Readability</p>
                </div>
                <div>
                  <p className="text-xl font-semibold">{result.subScoreAverages.structure}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Structure</p>
                </div>
              </div>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Needs attention</h2>
            <div className="mt-4">
              <HealthQueue pages={result.pages} />
            </div>
          </section>
        </>
      )}

      {result.kind === "ok" && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Cost &amp; usage</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Every AI call this Site has made, logged since Day 9 — not gated on there being any
            pages right now.
          </p>
          <div className="mt-4">
            <CostUsagePanel summary={result.costUsage} />
          </div>
        </section>
      )}
    </div>
  );
}
