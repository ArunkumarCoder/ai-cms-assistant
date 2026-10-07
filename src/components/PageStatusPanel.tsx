"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Page } from "@/types";
import {
  availablePageStatusActions,
  PAGE_STATUS_ACTION_LABEL,
  type PageStatusAction,
} from "@/lib/pages/pageStatusTransitions";
import { transitionPageStatusAction } from "@/lib/pages/transitionPageStatusAction";

const STATUS_LABEL: Record<Page["status"], string> = {
  draft: "Draft",
  "in-review": "In review",
  approved: "Approved",
  published: "Published",
};

const STATUS_CLASS: Record<Page["status"], string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "in-review": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const ACTION_BUTTON_CLASS: Record<PageStatusAction, string> = {
  submit: "border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800",
  approve: "bg-blue-600 text-white hover:bg-blue-700",
  reject:
    "border border-red-300 text-red-800 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40",
  publish: "bg-emerald-600 text-white hover:bg-emerald-700",
};

// The one place a page's review-workflow state is shown and moved (SPEC.md
// §18) — never rendering a button pageStatusTransitions.ts's own table would
// reject server-side, so what's visible here always matches what's actually
// allowed, not just what the UI happens to let you click.
export function PageStatusPanel({ page }: { page: Page }) {
  const router = useRouter();
  const [pending, setPending] = useState<PageStatusAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actions = availablePageStatusActions(page.status);

  async function handleTransition(action: PageStatusAction) {
    setError(null);
    setPending(action);
    const result = await transitionPageStatusAction({
      cmsDocumentId: page.cmsDocumentId ?? page.id,
      currentStatus: page.status,
      action,
    });
    setPending(null);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Status
        </span>
        <span
          role="status"
          className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CLASS[page.status]}`}
        >
          {STATUS_LABEL[page.status]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions.length === 0 ? (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">No further transitions.</span>
        ) : (
          actions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => handleTransition(action)}
              disabled={pending !== null}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${ACTION_BUTTON_CLASS[action]}`}
            >
              {pending === action ? "Working…" : PAGE_STATUS_ACTION_LABEL[action]}
            </button>
          ))
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}
