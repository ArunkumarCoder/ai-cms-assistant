import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { qualityScoreHistory: { findMany: (...args: unknown[]) => findManyMock(...args) } },
}));

const { getLatestScoresForSite } = await import("./scoreHistory");

function row(overrides: Partial<{ pageId: string; score: number; createdAt: Date }> = {}) {
  return {
    pageId: overrides.pageId ?? "page-1",
    siteId: "site-1",
    score: overrides.score ?? 70,
    subScores: {
      seo: { score: 70, reason: "x" },
      readability: { score: 70, reason: "x" },
      structure: { score: 70, reason: "x" },
    },
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  findManyMock.mockReset();
});

describe("getLatestScoresForSite", () => {
  it("returns one entry per page, using only the most recent row", async () => {
    // findMany is already queried ordered newest-first — the most recent row
    // for page-1 is the first one this mock returns.
    findManyMock.mockResolvedValue([
      row({ pageId: "page-1", score: 90, createdAt: new Date("2026-02-01T00:00:00.000Z") }),
      row({ pageId: "page-1", score: 40, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      row({ pageId: "page-2", score: 60, createdAt: new Date("2026-01-15T00:00:00.000Z") }),
    ]);

    const result = await getLatestScoresForSite("site-1");

    expect(result).toHaveLength(2);
    const page1 = result.find((r) => r.pageId === "page-1");
    expect(page1?.score).toBe(90);
  });

  it("returns an empty array for a Site with no history yet", async () => {
    findManyMock.mockResolvedValue([]);
    expect(await getLatestScoresForSite("site-1")).toEqual([]);
  });

  it("degrades to an empty array instead of throwing when the query fails", async () => {
    findManyMock.mockRejectedValue(new Error("db unreachable"));
    await expect(getLatestScoresForSite("site-1")).resolves.toEqual([]);
  });
});
