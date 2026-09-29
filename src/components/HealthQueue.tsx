"use client";

import { useState } from "react";
import Link from "next/link";
import {
  attentionReasonsFor,
  type AttentionReasonType,
  type PageHealthInput,
} from "@/lib/dashboard";

type Filter = "attention" | "all";
type Sort = "score" | "images" | "review";

// Task item 3: each reason links to the screen that actually addresses it,
// not just the generic page editor. "unscored"/"low-score" open the SEO
// panel (the composite score and its breakdown live there); "in-review"/
// "approved" open the status panel (PageStatusPanel.tsx, where the
// transition buttons live); "flagged-images" opens Media Library
// pre-filtered to this page (media/page.tsx's own `?page=` param, not a
// generic "go look through everything" link.
function hrefForReason(page: PageHealthInput, type: AttentionReasonType): string {
  switch (type) {
    case "unscored":
    case "low-score":
      return `/pages/${page.slug}#seo-panel`;
    case "in-review":
    case "approved":
      return `/pages/${page.slug}#status-panel`;
    case "flagged-images":
      return `/media?page=${encodeURIComponent(page.slug)}`;
  }
}

const REASON_CLASS: Record<AttentionReasonType, string> = {
  unscored: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "low-score": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "in-review": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "flagged-images": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

const REVIEW_RANK: Record<PageHealthInput["status"], number> = {
  "in-review": 0,
  approved: 1,
  draft: 2,
  published: 3,
};

function sortPages<T extends PageHealthInput>(pages: T[], sort: Sort): T[] {
  if (sort === "images") {
    return [...pages].sort((a, b) => b.flaggedImageCount - a.flaggedImageCount);
  }
  if (sort === "review") {
    return [...pages].sort((a, b) => REVIEW_RANK[a.status] - REVIEW_RANK[b.status]);
  }
  // "score" — unscored pages sort as if they scored below everything real,
  // since "we don't know" is itself worth looking at first.
  return [...pages].sort((a, b) => (a.qualityScore ?? -1) - (b.qualityScore ?? -1));
}

export function HealthQueue({ pages }: { pages: PageHealthInput[] }) {
  const [filter, setFilter] = useState<Filter>("attention");
  const [sort, setSort] = useState<Sort>("score");

  const withReasons = pages.map((page) => ({ page, reasons: attentionReasonsFor(page) }));
  const attentionCount = withReasons.filter((item) => item.reasons.length > 0).length;
  const filtered = filter === "attention" ? withReasons.filter((item) => item.reasons.length > 0) : withReasons;
  const sorted = sortPages(
    filtered.map((item) => item.page),
    sort,
  ).map((page) => withReasons.find((item) => item.page.id === page.id)!);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
          {(["attention", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-md px-3 py-1 font-medium ${
                filter === value
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {value === "attention" ? `Needs attention (${attentionCount})` : `All pages (${pages.length})`}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="score">Lowest quality score first</option>
          <option value="images">Most flagged images first</option>
          <option value="review">Review state</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {filter === "attention"
            ? "Nothing needs attention right now — every page is scored, reviewed, and clean."
            : "No pages match this filter."}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          {sorted.map(({ page, reasons }) => (
            <li key={page.id} className="py-4">
              <Link href={`/pages/${page.slug}`} className="font-medium hover:underline">
                {page.title}
              </Link>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {reasons.length === 0 ? (
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">Looking good</span>
                ) : (
                  reasons.map((reason) => (
                    <Link
                      key={reason.type}
                      href={hrefForReason(page, reason.type)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium hover:opacity-80 ${REASON_CLASS[reason.type]}`}
                    >
                      {reason.label}
                    </Link>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
