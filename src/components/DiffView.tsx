"use client";

import type { ReactNode } from "react";
import type { DiffEntry } from "@/lib/diff";

interface DiffViewProps<T> {
  // Callers pass only entries still awaiting a decision — this component has
  // no internal accept/reject bookkeeping of its own. Once a caller decides
  // an entry (via onAccept/onReject), it drops out of the next `entries` it
  // passes down, which is what actually removes it from view; DiffView never
  // renders a lingering "accepted"/"rejected" state for that reason (this
  // task's "single review pass" is naturally satisfied by each decision
  // shrinking the list, not by tracking a decision history here).
  entries: DiffEntry<T>[];
  renderValue: (value: T) => ReactNode;
  labelFor?: (entry: DiffEntry<T>) => string;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

// The one before/after review surface every AI edit to existing content
// goes through — block regeneration and applied SEO suggestions today,
// whatever comes next tomorrow. Generic over T so the same component renders
// a content-block diff and a plain-string field diff without caring which;
// callers supply `renderValue` for how one entry's before/after should look.
export function DiffView<T>({ entries, renderValue, labelFor, onAccept, onReject }: DiffViewProps<T>) {
  const reviewable = entries.filter((entry) => entry.status !== "unchanged");
  if (reviewable.length === 0) return null;

  return (
    <div className="space-y-3">
      {reviewable.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/50 dark:bg-violet-950/30"
        >
          {labelFor && (
            <p className="text-xs font-medium tracking-wide text-violet-700 uppercase dark:text-violet-400">
              {labelFor(entry)}
              {entry.status === "added" && " · new"}
              {entry.status === "removed" && " · removed"}
            </p>
          )}

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {entry.before !== null && (
              <div>
                <p className="text-xs font-medium text-red-700 dark:text-red-400">Current</p>
                <div className="mt-1 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-zinc-700 line-through decoration-red-400/70 dark:border-red-900/40 dark:bg-red-950/20 dark:text-zinc-300">
                  {renderValue(entry.before)}
                </div>
              </div>
            )}
            {entry.after !== null && (
              <div>
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {entry.status === "added" ? "New" : "Suggested"}
                </p>
                <div className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-zinc-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-zinc-300">
                  {renderValue(entry.after)}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAccept(entry.id)}
              aria-label={labelFor ? `Accept ${labelFor(entry)}` : undefined}
              className="rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => onReject(entry.id)}
              aria-label={labelFor ? `Reject ${labelFor(entry)}` : undefined}
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
