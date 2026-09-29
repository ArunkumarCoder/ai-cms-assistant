import { prisma } from "@/lib/db";

export interface LatestScoreEntry {
  pageId: string;
  score: number;
  subScores: { seo: { score: number }; readability: { score: number }; structure: { score: number } };
}

// One query, reduced to "the most recent row per page" in JS rather than a
// raw DISTINCT ON — plenty fast at this project's real scale (a handful of
// demo pages per Site) and stays readable without dropping out of Prisma's
// query builder. Feeds the Day 23 dashboard's sub-score averages (SPEC.md
// §19) — pure read of what Day 15's auto-scoring already recorded, no
// recomputation. Resilient like every other Postgres read helper in this
// app (src/lib/audit/pageActivity.ts's getPageActivity): a hiccup here
// degrades that one dashboard card, not the whole page.
export async function getLatestScoresForSite(siteId: string): Promise<LatestScoreEntry[]> {
  try {
    const rows = await prisma.qualityScoreHistory.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
    });

    const seen = new Set<string>();
    const latest: LatestScoreEntry[] = [];
    for (const row of rows) {
      if (seen.has(row.pageId)) continue;
      seen.add(row.pageId);
      latest.push({
        pageId: row.pageId,
        score: row.score,
        subScores: row.subScores as LatestScoreEntry["subScores"],
      });
    }
    return latest;
  } catch (err) {
    console.error("Failed to load quality score history:", err);
    return [];
  }
}
