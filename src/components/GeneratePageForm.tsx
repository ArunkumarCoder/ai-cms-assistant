"use client";

import { useState } from "react";
import Link from "next/link";
import type { ContentBlock, PageType } from "@/types";
import type { PageDraftBlock } from "@/lib/ai/schemas/pageDraft";
import type { PageBrief } from "@/lib/pages/prompt";
import { generatePageDraftAction } from "@/lib/pages/generatePageDraftAction";
import { saveDraftPageAction } from "@/lib/pages/saveDraftPageAction";
import { regenerateBlockAction } from "@/lib/pages/regenerateBlockAction";
import { draftBlockToContentBlock } from "@/lib/pages/mapping";
import { DraftBlockEditor } from "./DraftBlockEditor";

const fieldClass =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const PAGE_TYPES: { value: PageType; label: string }[] = [
  { value: "landing", label: "Landing page" },
  { value: "blog", label: "Blog post" },
  { value: "service", label: "Service page" },
  { value: "other", label: "Other" },
];

const EMPTY_BRIEF: PageBrief = {
  title: "",
  targetKeyword: "",
  audience: "",
  keyPoints: "",
  tone: "",
  pageType: "landing",
};

interface DraftBlockState {
  localId: string;
  block: PageDraftBlock;
  // Set on any manual edit, cleared on any AI-sourced write (initial
  // generation or a successful regeneration) — gates the "you'll overwrite
  // a hand edit" confirmation before regenerating.
  edited: boolean;
  pending: boolean;
  error: string | null;
}

interface DraftState {
  title: string;
  slug: string;
  metaDescription: string;
  targetKeyword: string | null;
  pageType: PageType;
  blocks: DraftBlockState[];
}

function toDraftBlocks(blocks: PageDraftBlock[]): DraftBlockState[] {
  return blocks.map((block) => ({
    localId: crypto.randomUUID(),
    block,
    edited: false,
    pending: false,
    error: null,
  }));
}

// This id is assigned once, on first generation, and reused as the
// ContentBlock/Sanity-`_key` id for that block's entire lifetime (including
// through later regenerations) — so unrelated blocks' identity never
// churns when only one block changes.
function toContentBlocks(blocks: DraftBlockState[]): ContentBlock[] {
  return blocks.map((b, order) => draftBlockToContentBlock(b.block, b.localId, order));
}

function updateBlock(
  draft: DraftState,
  localId: string,
  patch: Partial<DraftBlockState>,
): DraftState {
  return {
    ...draft,
    blocks: draft.blocks.map((b) => (b.localId === localId ? { ...b, ...patch } : b)),
  };
}

export function GeneratePageForm() {
  const [brief, setBrief] = useState<PageBrief>(EMPTY_BRIEF);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [cmsDocumentId, setCmsDocumentId] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  const [generatePending, setGeneratePending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerateError(null);
    setGeneratePending(true);
    const result = await generatePageDraftAction(brief);
    setGeneratePending(false);

    if ("error" in result) {
      setGenerateError(result.error);
      return;
    }
    setDraft({
      title: result.draft.title,
      slug: result.draft.slug,
      metaDescription: result.draft.metaDescription,
      targetKeyword: result.draft.targetKeyword,
      pageType: brief.pageType,
      blocks: toDraftBlocks(result.draft.contentBlocks),
    });
    setCmsDocumentId(null);
    setSavedSlug(null);
    setSaveError(null);
  }

  function handleStartOver() {
    if (!window.confirm("Discard this draft and start over?")) return;
    setDraft(null);
    setCmsDocumentId(null);
    setSavedSlug(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!draft) return;
    setSaveError(null);
    setSavePending(true);
    const result = await saveDraftPageAction({
      cmsDocumentId: cmsDocumentId ?? undefined,
      title: draft.title,
      slug: draft.slug,
      metaDescription: draft.metaDescription,
      targetKeyword: draft.targetKeyword,
      pageType: draft.pageType,
      contentBlocks: toContentBlocks(draft.blocks),
    });
    setSavePending(false);

    if ("error" in result) {
      setSaveError(result.error);
      return;
    }
    setCmsDocumentId(result.page.cmsDocumentId ?? result.page.id);
    setSavedSlug(result.page.slug);
  }

  async function handleRegenerate(localId: string) {
    if (!draft) return;
    const current = draft.blocks.find((b) => b.localId === localId);
    if (!current) return;
    if (
      current.edited &&
      !window.confirm("This block was edited by hand — regenerate and overwrite it?")
    ) {
      return;
    }

    setDraft((prev) => prev && updateBlock(prev, localId, { pending: true, error: null }));

    const result = await regenerateBlockAction({
      cmsDocumentId: cmsDocumentId ?? undefined,
      pageTitle: draft.title,
      metaDescription: draft.metaDescription,
      targetKeyword: draft.targetKeyword,
      pageType: draft.pageType,
      audience: brief.audience,
      tone: brief.tone,
      contentBlocks: toContentBlocks(draft.blocks),
      targetBlockId: localId,
    });

    setDraft((prev) => {
      if (!prev) return prev;
      if ("error" in result) {
        return updateBlock(prev, localId, { pending: false, error: result.error });
      }
      return updateBlock(prev, localId, {
        pending: false,
        error: null,
        edited: false,
        block: result.block,
      });
    });
  }

  if (!draft) {
    return (
      <form onSubmit={handleGenerate} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium">Working title</label>
          <input
            required
            value={brief.title}
            onChange={(e) => setBrief({ ...brief, title: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Page type</label>
          <select
            value={brief.pageType}
            onChange={(e) => setBrief({ ...brief, pageType: e.target.value as PageType })}
            className={fieldClass}
          >
            {PAGE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Target keyword</label>
          <input
            value={brief.targetKeyword}
            onChange={(e) => setBrief({ ...brief, targetKeyword: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Audience</label>
          <input
            value={brief.audience}
            onChange={(e) => setBrief({ ...brief, audience: e.target.value })}
            placeholder="Who is this page for?"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Tone</label>
          <input
            value={brief.tone}
            onChange={(e) => setBrief({ ...brief, tone: e.target.value })}
            placeholder="e.g. friendly, professional, urgent"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Key points</label>
          <textarea
            value={brief.keyPoints}
            onChange={(e) => setBrief({ ...brief, keyPoints: e.target.value })}
            rows={4}
            placeholder="One per line"
            className={fieldClass}
          />
        </div>

        {generateError && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {generateError}
          </p>
        )}

        <button
          type="submit"
          disabled={generatePending}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {generatePending ? "Generating…" : "Generate draft"}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        {savedSlug ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Saved as draft.{" "}
            <Link href={`/pages/${savedSlug}`} className="underline">
              View page
            </Link>
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleStartOver}
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Start over
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Slug</label>
          <input
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Meta description</label>
          <textarea
            value={draft.metaDescription}
            onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
            rows={2}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Target keyword</label>
          <input
            value={draft.targetKeyword ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, targetKeyword: e.target.value || null })
            }
            className={fieldClass}
          />
        </div>
      </div>

      <div className="space-y-3">
        {draft.blocks.map((b) => (
          <DraftBlockEditor
            key={b.localId}
            block={b.block}
            pending={b.pending}
            error={b.error}
            onChange={(block) =>
              setDraft((prev) => prev && updateBlock(prev, b.localId, { block, edited: true }))
            }
            onRegenerate={() => handleRegenerate(b.localId)}
          />
        ))}
      </div>

      {saveError && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {saveError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={savePending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
      >
        {savePending ? "Saving…" : cmsDocumentId ? "Save changes" : "Save to Sanity as draft"}
      </button>
    </div>
  );
}
