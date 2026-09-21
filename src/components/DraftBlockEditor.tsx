"use client";

import type { PageDraftBlock } from "@/lib/ai/schemas/pageDraft";

const fieldClass =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// One block's editable fields + its own Regenerate action. Setting `edited`
// on any manual change (via onChange, not here — GeneratePageForm owns that
// flag) is what lets the parent warn before an AI regeneration overwrites a
// hand-edited block.
export function DraftBlockEditor({
  block,
  pending,
  error,
  onChange,
  onRegenerate,
}: {
  block: PageDraftBlock;
  pending: boolean;
  error: string | null;
  onChange: (block: PageDraftBlock) => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {block.type}
        </span>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={pending}
          className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {pending ? "Regenerating…" : "Regenerate"}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {block.type === "heading" && (
          <>
            <select
              value={block.level}
              onChange={(e) =>
                onChange({ ...block, level: Number(e.target.value) as 2 | 3 | 4 })
              }
              className={fieldClass}
            >
              <option value={2}>Heading 2</option>
              <option value={3}>Heading 3</option>
              <option value={4}>Heading 4</option>
            </select>
            <textarea
              value={block.content}
              onChange={(e) => onChange({ ...block, content: e.target.value })}
              rows={2}
              className={fieldClass}
            />
          </>
        )}

        {block.type === "paragraph" && (
          <textarea
            value={block.content}
            onChange={(e) => onChange({ ...block, content: e.target.value })}
            rows={4}
            className={fieldClass}
          />
        )}

        {block.type === "cta" && (
          <>
            <input
              value={block.content}
              onChange={(e) => onChange({ ...block, content: e.target.value })}
              placeholder="Button text"
              className={fieldClass}
            />
            <input
              value={block.href}
              onChange={(e) => onChange({ ...block, href: e.target.value })}
              placeholder="Link (e.g. /contact)"
              className={fieldClass}
            />
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={block.openInNewTab}
                onChange={(e) => onChange({ ...block, openInNewTab: e.target.checked })}
              />
              Open in new tab
            </label>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
