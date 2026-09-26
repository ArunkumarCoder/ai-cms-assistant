"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AltTextAssessment, CardPhase } from "@/lib/images";
import { IDLE_PHASE, runWithConcurrency, selectByPhase, selectEligibleForBatch } from "@/lib/images";
import { generateAltTextAction } from "@/lib/images/generateAltTextAction";
import { saveAltTextAction } from "@/lib/images/saveAltTextAction";
import type { ImageAsset } from "@/types";
import { MediaLibraryCard } from "./MediaLibraryCard";
import { BatchAltTextQueue } from "./BatchAltTextQueue";

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
// Vision calls are the slowest, priciest thing this app does — this is the
// batch queue's whole rate-limiting strategy against the provider (SPEC.md
// §14): at most this many generateAltTextAction calls in flight at once, on
// top of (not instead of) ../ai/retry.ts's own 429 backoff underneath.
const GENERATE_CONCURRENCY = 2;
// Sanity patches are cheap and fast — a bulk "accept all" can afford a wider
// pool than vision generation without needing the same caution.
const ACCEPT_CONCURRENCY = 4;

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
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("flagged-first");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // One phase per image, shared by every entry point that can generate or
  // save alt text for it — a single card's own "Generate alt text" button
  // and the batch queue both call the exact same runGenerate/runAccept
  // below, never a parallel implementation (this task's item 3).
  const [phases, setPhases] = useState<Record<string, CardPhase>>({});
  // The batch's fixed roster, set once when a batch starts and never
  // narrowed by a retry (see handleRetryFailed) — null means no batch has
  // run yet this session, so the queue panel stays hidden entirely.
  const [batchIds, setBatchIds] = useState<string[] | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const itemById = new Map(items.map((item) => [item.image.id, item]));

  function setPhase(id: string, phase: CardPhase) {
    setPhases((prev) => ({ ...prev, [id]: phase }));
  }

  async function runGenerate(item: MediaLibraryItem): Promise<void> {
    setPhase(item.image.id, { name: "generating" });
    const result = await generateAltTextAction({
      imageUrl: item.image.url,
      pageTitle: item.page?.title,
    });
    if ("error" in result) {
      setPhase(item.image.id, { name: "failed", message: result.error });
      return;
    }
    setPhase(item.image.id, {
      name: "reviewing",
      suggestion: result.altText,
      draft: result.altText.altText,
    });
  }

  async function runAccept(item: MediaLibraryItem): Promise<void> {
    const phase = phases[item.image.id] ?? IDLE_PHASE;
    if (phase.name !== "reviewing") return;
    const { suggestion, draft } = phase;
    setPhase(item.image.id, { name: "saving", suggestion, draft });

    const cmsAssetId = item.image.cmsAssetId ?? item.image.id;
    const edited = draft.trim() !== suggestion.altText.trim();
    const result = await saveAltTextAction({ cmsAssetId, altText: draft, edited });

    if ("error" in result) {
      setPhase(item.image.id, { name: "reviewing", suggestion, draft, error: result.error });
      return;
    }
    setPhase(item.image.id, { name: "saved" });
  }

  function handleDraftChange(id: string, value: string) {
    setPhases((prev) => {
      const phase = prev[id];
      if (!phase || phase.name !== "reviewing") return prev;
      return { ...prev, [id]: { ...phase, draft: value, error: undefined } };
    });
  }

  function handleDiscard(id: string) {
    setPhase(id, { name: "idle" });
  }

  async function handleSingleAccept(item: MediaLibraryItem) {
    await runAccept(item);
    router.refresh();
  }

  async function processIds(ids: string[]): Promise<void> {
    const targets = ids
      .map((id) => itemById.get(id))
      .filter((item): item is MediaLibraryItem => item !== undefined);
    setBatchRunning(true);
    await runWithConcurrency(targets, GENERATE_CONCURRENCY, (item) => runGenerate(item));
    setBatchRunning(false);
  }

  const eligibleForBatch = selectEligibleForBatch(
    items.map((item) => ({ id: item.image.id, flagged: item.assessment.flagged })),
    phases,
  );

  function handleGenerateAllFlagged() {
    if (eligibleForBatch.length === 0) return;
    setBatchIds(eligibleForBatch);
    void processIds(eligibleForBatch);
  }

  function handleRetryFailed() {
    if (!batchIds) return;
    const failed = selectByPhase(batchIds, phases, "failed");
    if (failed.length === 0) return;
    // Deliberately does not touch batchIds — the roster stays fixed so the
    // progress panel keeps counting everything the original batch covered,
    // not just this retry's narrower subset.
    void processIds(failed);
  }

  async function handleAcceptAllSuggested() {
    if (!batchIds) return;
    const reviewingIds = selectByPhase(batchIds, phases, "reviewing");
    const targets = reviewingIds
      .map((id) => itemById.get(id))
      .filter((item): item is MediaLibraryItem => item !== undefined);
    if (targets.length === 0) return;
    setAccepting(true);
    await runWithConcurrency(targets, ACCEPT_CONCURRENCY, (item) => runAccept(item));
    setAccepting(false);
    router.refresh();
  }

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
          {eligibleForBatch.length > 0 && (
            <button
              type="button"
              onClick={handleGenerateAllFlagged}
              disabled={batchRunning || accepting}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
            >
              Generate alt text for all flagged ({eligibleForBatch.length})
            </button>
          )}

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

      {batchIds && batchIds.length > 0 && (
        <div className="mt-6">
          <BatchAltTextQueue
            items={items}
            ids={batchIds}
            phases={phases}
            running={batchRunning}
            accepting={accepting}
            onRetryFailed={handleRetryFailed}
            onAcceptAllSuggested={handleAcceptAllSuggested}
          />
        </div>
      )}

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
              <MediaLibraryCard
                key={image.id}
                image={image}
                assessment={assessment}
                page={page}
                phase={phases[image.id] ?? IDLE_PHASE}
                onGenerate={() => runGenerate({ image, assessment, page })}
                onDraftChange={(value) => handleDraftChange(image.id, value)}
                onAccept={() => handleSingleAccept({ image, assessment, page })}
                onDiscard={() => handleDiscard(image.id)}
              />
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
