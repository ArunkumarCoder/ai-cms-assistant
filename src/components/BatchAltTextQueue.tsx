"use client";

import Image from "next/image";
import type { MediaLibraryItem } from "./MediaLibrary";
import { computeBatchProgress, phaseFor, type CardPhase } from "@/lib/images";

const STATUS_TEXT: Record<CardPhase["name"], string> = {
  idle: "Pending",
  generating: "Generating…",
  reviewing: "Suggested",
  saving: "Saving…",
  saved: "Saved",
  failed: "Failed",
};

const STATUS_DOT_CLASS: Record<CardPhase["name"], string> = {
  idle: "bg-zinc-300 dark:bg-zinc-600",
  generating: "bg-amber-500 animate-pulse",
  reviewing: "bg-emerald-500",
  saving: "bg-emerald-500 animate-pulse",
  saved: "bg-emerald-600",
  failed: "bg-red-500",
};

interface BatchAltTextQueueProps {
  items: MediaLibraryItem[];
  ids: string[];
  phases: Record<string, CardPhase>;
  running: boolean;
  accepting: boolean;
  onRetryFailed: () => void;
  onAcceptAllSuggested: () => void;
}

// The one place "read clearly even with dozens of images queued" (task item
// 2) lives — a compact, scrollable roster distinct from the full-size review
// cards in the grid below. This panel never shows a textarea or lets anyone
// edit a suggestion; that's still exclusively MediaLibraryCard's job, driven
// by the exact same `phases` map this panel only reads.
export function BatchAltTextQueue({
  items,
  ids,
  phases,
  running,
  accepting,
  onRetryFailed,
  onAcceptAllSuggested,
}: BatchAltTextQueueProps) {
  const progress = computeBatchProgress(ids, phases);
  const itemById = new Map(items.map((item) => [item.image.id, item]));
  const processed = progress.suggested + progress.saved + progress.failed;

  return (
    <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {running
              ? `Generating alt text — ${processed} of ${progress.total} processed`
              : `Batch finished — ${progress.suggested} awaiting review, ${progress.saved} saved, ${progress.failed} failed of ${progress.total}`}
          </p>
          {progress.failed > 0 && !running && (
            <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
              {progress.failed} image{progress.failed === 1 ? "" : "s"} failed — retry below, the rest
              are unaffected.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {progress.failed > 0 && (
            <button
              type="button"
              onClick={onRetryFailed}
              disabled={running}
              className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Retry {progress.failed} failed
            </button>
          )}
          {progress.suggested > 0 && (
            <button
              type="button"
              onClick={onAcceptAllSuggested}
              disabled={running || accepting}
              className="rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {accepting ? "Saving…" : `Accept all ${progress.suggested} suggested`}
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width]"
          style={{ width: `${progress.total === 0 ? 0 : Math.round((processed / progress.total) * 100)}%` }}
        />
      </div>

      <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
        {ids.map((id) => {
          const item = itemById.get(id);
          if (!item) return null;
          const phase = phaseFor(id, phases);
          return (
            <li key={id} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[phase.name]}`} />
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                <Image src={item.image.url} alt="" fill sizes="32px" className="object-cover" />
              </div>
              <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-400">
                {item.page?.title ?? item.image.url.split("/").pop()}
              </span>
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                {phase.name === "failed" ? phase.message : STATUS_TEXT[phase.name]}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
