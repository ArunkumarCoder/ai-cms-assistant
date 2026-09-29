"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FaqItemSource, Page } from "@/types";
import { generateFaqListAction } from "@/lib/pages/generateFaqListAction";
import { saveFaqItemsAction } from "@/lib/pages/saveFaqItemsAction";

const fieldClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

interface FaqDraftItem {
  id: string;
  question: string;
  answer: string;
  source: FaqItemSource;
}

function fromPage(page: Page): FaqDraftItem[] {
  return page.faqItems
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => ({ id: item.id, question: item.question, answer: item.answer, source: item.source }));
}

export function FaqEditor({ page }: { page: Page }) {
  const router = useRouter();
  const [faqItems, setFaqItems] = useState<FaqDraftItem[]>(() => fromPage(page));

  const [generatePending, setGeneratePending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function markDirty() {
    setSaved(false);
  }

  async function handleGenerate() {
    setGenerateError(null);
    setGeneratePending(true);
    const result = await generateFaqListAction({
      title: page.title,
      pageType: page.pageType,
      contentBlocks: page.contentBlocks,
    });
    setGeneratePending(false);

    if ("error" in result) {
      setGenerateError(result.error);
      return;
    }
    // Appends rather than replaces — generating again never silently
    // discards FAQs already sitting in this draft (saved or not); the user
    // deletes what they don't want (task item 5 explicitly allows going all
    // the way down to zero, so there's no floor to protect either way).
    setFaqItems((prev) => [
      ...prev,
      ...result.faqItems.map((draft) => ({
        id: crypto.randomUUID(),
        question: draft.question,
        answer: draft.answer,
        source: "ai-generated" as const,
      })),
    ]);
    markDirty();
  }

  function handleQuestionChange(id: string, value: string) {
    setFaqItems((prev) => prev.map((item) => (item.id === id ? { ...item, question: value } : item)));
    markDirty();
  }

  function handleAnswerChange(id: string, value: string) {
    setFaqItems((prev) => prev.map((item) => (item.id === id ? { ...item, answer: value } : item)));
    markDirty();
  }

  function handleDelete(id: string) {
    setFaqItems((prev) => prev.filter((item) => item.id !== id));
    markDirty();
  }

  function handleMove(id: string, direction: -1 | 1) {
    setFaqItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    markDirty();
  }

  async function handleSave() {
    setSaveError(null);
    setSavePending(true);
    const result = await saveFaqItemsAction({
      cmsDocumentId: page.cmsDocumentId ?? page.id,
      faqItems: faqItems.map((item, order) => ({
        id: item.id,
        pageId: page.id,
        question: item.question,
        answer: item.answer,
        order,
        source: item.source,
      })),
      previousFaqItems: page.faqItems,
    });
    setSavePending(false);

    if ("error" in result) {
      setSaveError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">FAQs</h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generatePending}
          className="rounded-full border border-violet-300 px-4 py-2 text-xs font-medium text-violet-700 disabled:opacity-60 dark:border-violet-800 dark:text-violet-300"
        >
          {generatePending ? "Generating…" : "Generate FAQs"}
        </button>
      </div>

      {generateError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {generateError}
        </p>
      )}

      {faqItems.length === 0 ? (
        <p className="mt-4 text-zinc-500 dark:text-zinc-400">
          No FAQs yet. Click &quot;Generate FAQs&quot; to draft some from this page&apos;s content, or
          save with none — that&apos;s a valid choice too.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {faqItems.map((item, index) => (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {item.source === "ai-generated" ? "AI-generated" : "Manual"}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMove(item.id, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(item.id, 1)}
                    disabled={index === faqItems.length - 1}
                    aria-label="Move down"
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    aria-label="Delete this FAQ"
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-2 space-y-2">
                <input
                  value={item.question}
                  onChange={(e) => handleQuestionChange(item.id, e.target.value)}
                  placeholder="Question"
                  className={`${fieldClass} font-medium`}
                />
                <textarea
                  value={item.answer}
                  onChange={(e) => handleAnswerChange(item.id, e.target.value)}
                  placeholder="Answer"
                  rows={2}
                  className={fieldClass}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {saveError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {saveError}
        </p>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={savePending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {savePending ? "Saving…" : "Save FAQs"}
        </button>
        {saved && !savePending && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">Saved.</span>
        )}
      </div>
    </section>
  );
}
