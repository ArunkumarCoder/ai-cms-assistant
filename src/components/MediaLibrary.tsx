"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AltTextAssessment } from "@/lib/images";
import type { ImageAsset } from "@/types";

export interface MediaLibraryItem {
  image: ImageAsset;
  assessment: AltTextAssessment;
  // null when usedOnPageIds points at a page getPages() didn't return (a
  // deleted/renamed page slipping in between the two reads) — the interface
  // doesn't guarantee these two calls see a perfectly consistent snapshot,
  // same "no caching" tradeoff SPEC.md §5 already accepts elsewhere.
  page: { title: string; slug: string } | null;
}

type Filter = "all" | "flagged";
type Sort = "recent" | "flagged-first";
const PAGE_SIZE = 24;

const STATUS_LABEL: Record<ImageAsset["altTextStatus"], string> = {
  missing: "Missing",
  "ai-generated": "AI-suggested",
  reviewed: "Reviewed",
};

const STATUS_CLASS: Record<ImageAsset["altTextStatus"], string> = {
  missing: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "ai-generated": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  reviewed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function sortItems(items: MediaLibraryItem[], sort: Sort): MediaLibraryItem[] {
  if (sort === "recent") {
    return [...items].sort((a, b) => b.image.updatedAt.localeCompare(a.image.updatedAt));
  }
  // Stable-ish: flagged first, ties broken by recency — lets someone working
  // through a backlog start at the top without the list reshuffling wildly
  // between page loads.
  return [...items].sort((a, b) => {
    if (a.assessment.flagged !== b.assessment.flagged) {
      return a.assessment.flagged ? -1 : 1;
    }
    return b.image.updatedAt.localeCompare(a.image.updatedAt);
  });
}

export function MediaLibrary({ items }: { items: MediaLibraryItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("flagged-first");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const flaggedCount = items.filter((item) => item.assessment.flagged).length;
  const filtered = filter === "flagged" ? items.filter((item) => item.assessment.flagged) : items;
  const sorted = sortItems(filtered, sort);
  const visible = sorted.slice(0, visibleCount);

  function updateFilter(next: Filter) {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
  }

  function updateSort(next: Sort) {
    setSort(next);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {items.length} image{items.length === 1 ? "" : "s"}
          {flaggedCount > 0 && (
            <>
              {" · "}
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {flaggedCount} flagged
              </span>
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
            {(["all", "flagged"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => updateFilter(value)}
                className={`rounded-md px-3 py-1 font-medium ${
                  filter === value
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {value === "all" ? "All" : `Flagged (${flaggedCount})`}
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={(e) => updateSort(e.target.value as Sort)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="flagged-first">Flagged first</option>
            <option value="recent">Recently updated</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {filter === "flagged"
            ? "No flagged images — every image here has real alt text."
            : "No images match this filter."}
        </div>
      ) : (
        <>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(({ image, assessment, page }) => (
              <li
                key={image.id}
                className={`overflow-hidden rounded-lg border text-sm ${
                  assessment.flagged
                    ? "border-amber-300 dark:border-amber-900/60"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-900">
                  <Image
                    src={image.url}
                    alt={image.altText ?? ""}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="space-y-2 p-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[image.altTextStatus]}`}
                  >
                    {STATUS_LABEL[image.altTextStatus]}
                  </span>
                  <p className="text-zinc-700 dark:text-zinc-300">
                    {image.altText ? (
                      `"${image.altText}"`
                    ) : (
                      <span className="italic text-zinc-400 dark:text-zinc-500">No alt text</span>
                    )}
                  </p>
                  {assessment.flagged && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{assessment.reason}</p>
                  )}
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Used on{" "}
                    {page ? (
                      <Link href={`/pages/${page.slug}`} className="underline hover:no-underline">
                        {page.title}
                      </Link>
                    ) : (
                      "an unknown page"
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {visible.length < sorted.length && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Show {Math.min(PAGE_SIZE, sorted.length - visible.length)} more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
