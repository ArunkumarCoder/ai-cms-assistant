"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Page } from "@/types";
import { analyzeSeoContent, type SeoCheckResult } from "@/lib/seo";
import { computeQualityScore } from "@/lib/quality";
import type { SeoSuggestions } from "@/lib/ai";
import { generateSeoSuggestionsAction } from "@/lib/pages/generateSeoSuggestionsAction";
import { saveDraftPageAction } from "@/lib/pages/saveDraftPageAction";
import { SerpPreview } from "./SerpPreview";
import { SeoChecklist } from "./SeoChecklist";
import { QualityScorePanel } from "./QualityScorePanel";

const fieldClass =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

type HighlightedField = "title" | "metaDescription" | "targetKeyword" | null;

const CONTENT_BLOCKS_ANCHOR_ID = "page-content-blocks";
const HIGHLIGHT_MS = 1500;

function highlightClass(field: HighlightedField, current: HighlightedField): string {
  return field === current ? " ring-2 ring-violet-400" : "";
}

// `Element.scrollIntoView({ behavior: "smooth" })` isn't consistently
// downgraded to instant scrolling by every browser's own
// `prefers-reduced-motion` handling when a script explicitly requests
// "smooth" — checking this directly, rather than relying only on
// globals.css's CSS-level override, means a user with that preference set
// never gets an unrequested scrolling animation from this button regardless
// of browser behavior.
function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "smooth";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

interface SeoPanelProps {
  page: Page;
}

export function SeoPanel({ page }: SeoPanelProps) {
  const router = useRouter();

  const [title, setTitle] = useState(page.title);
  const [metaDescription, setMetaDescription] = useState(page.metaDescription);
  const [targetKeyword, setTargetKeyword] = useState(page.targetKeyword ?? "");

  const [suggestions, setSuggestions] = useState<SeoSuggestions | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Which suggestion diffs (keyed by check.id) the user has explicitly
  // rejected this round — reset on every fresh "Get AI suggestions" call.
  // Accepting a suggestion needs no entry here: once `title`/`metaDescription`
  // equal the suggested value, the diff itself reads as unchanged and
  // SeoChecklist's DiffView stops rendering it on its own.
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());

  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [highlightedField, setHighlightedField] = useState<HighlightedField>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const metaDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const targetKeywordRef = useRef<HTMLInputElement>(null);

  const analysis = useMemo(
    () =>
      analyzeSeoContent({
        title,
        metaDescription,
        targetKeyword: targetKeyword || undefined,
        contentBlocks: page.contentBlocks,
      }),
    [title, metaDescription, targetKeyword, page.contentBlocks],
  );

  // Recomputed live from the same in-progress edits as `analysis` above, so
  // the score reflects what "Save changes" is about to persist, not
  // yesterday's saved snapshot. contentBlocks/faqItems aren't editable from
  // this screen, so only title/metaDescription/targetKeyword ever change it.
  const quality = useMemo(
    () =>
      computeQualityScore({
        title,
        metaDescription,
        targetKeyword: targetKeyword || undefined,
        contentBlocks: page.contentBlocks,
        faqItems: page.faqItems,
      }),
    [title, metaDescription, targetKeyword, page.contentBlocks, page.faqItems],
  );

  function flashHighlight(field: HighlightedField) {
    setHighlightedField(field);
    window.setTimeout(() => {
      setHighlightedField((current) => (current === field ? null : current));
    }, HIGHLIGHT_MS);
  }

  function scrollAndFocus(el: HTMLElement | null, field: HighlightedField) {
    if (!el) return;
    el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    el.focus();
    flashHighlight(field);
  }

  function handleCheckClick(check: SeoCheckResult) {
    if (check.id === "titleLength") return scrollAndFocus(titleRef.current, "title");
    if (check.id === "metaDescriptionLength") {
      return scrollAndFocus(metaDescriptionRef.current, "metaDescription");
    }
    if (check.id === "keywordDensity") {
      return scrollAndFocus(targetKeywordRef.current, "targetKeyword");
    }

    // headingHierarchy / readability point at body content, which lives
    // outside this component's subtree (rendered by the server component in
    // page.tsx) — targeted by DOM id rather than a React ref. `contentEl`
    // needs `tabIndex={-1}` (set on the element itself in page.tsx) for
    // `.focus()` to work on a plain `<div>` — without moving focus there,
    // a keyboard/screen-reader user who triggered this from the checklist
    // would see the page scroll but have no idea where focus actually is,
    // and get no announcement at all.
    const contentEl = document.getElementById(CONTENT_BLOCKS_ANCHOR_ID);
    if (!contentEl) return;
    contentEl.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    contentEl.focus();
    contentEl.classList.add("ring-2", "ring-violet-400", "rounded-lg");
    window.setTimeout(() => {
      contentEl.classList.remove("ring-2", "ring-violet-400", "rounded-lg");
    }, HIGHLIGHT_MS);
  }

  async function handleGetSuggestions() {
    setAiError(null);
    setAiPending(true);
    const result = await generateSeoSuggestionsAction({
      title,
      metaDescription,
      targetKeyword: targetKeyword || undefined,
      pageType: page.pageType,
      contentBlocks: page.contentBlocks,
    });
    setAiPending(false);

    if ("error" in result) {
      setAiError(result.error);
      return;
    }
    setSuggestions(result.suggestions);
    setDismissedSuggestionIds(new Set());
  }

  function handleDismissSuggestion(id: string) {
    setDismissedSuggestionIds((prev) => new Set(prev).add(id));
  }

  function handleApplyTitle(value: string) {
    setTitle(value);
    setSaved(false);
  }

  function handleApplyMetaDescription(value: string) {
    setMetaDescription(value);
    setSaved(false);
  }

  async function handleSave() {
    setSaveError(null);
    setSavePending(true);
    // Derived, not tracked through every keystroke/click: if the currently
    // fetched suggestions still match what's about to be saved, an AI
    // suggestion is part of this save — same "read it back from the final
    // data, don't track intent separately" approach FaqEditor's own
    // AI-generated-FAQ detection already uses (SPEC.md §18).
    const viaAiSuggestion =
      suggestions !== null &&
      (title === suggestions.suggestedMetaTitle || metaDescription === suggestions.suggestedMetaDescription);
    const result = await saveDraftPageAction({
      cmsDocumentId: page.cmsDocumentId ?? page.id,
      title,
      slug: page.slug,
      metaDescription,
      targetKeyword: targetKeyword || null,
      pageType: page.pageType,
      contentBlocks: page.contentBlocks,
      previousContent: {
        title: page.title,
        metaDescription: page.metaDescription,
        targetKeyword: page.targetKeyword,
        contentBlocks: page.contentBlocks,
      },
      viaAiSuggestion,
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
    <div className="space-y-4">
      <QualityScorePanel quality={quality} />

      <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="space-y-3">
          <div>
            <label htmlFor="seo-title" className="block text-sm font-medium">
              Title
            </label>
            <input
              id="seo-title"
              ref={titleRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
              className={fieldClass + highlightClass("title", highlightedField)}
            />
          </div>
          <div>
            <label htmlFor="seo-meta-description" className="block text-sm font-medium">
              Meta description
            </label>
            <textarea
              id="seo-meta-description"
              ref={metaDescriptionRef}
              value={metaDescription}
              onChange={(e) => {
                setMetaDescription(e.target.value);
                setSaved(false);
              }}
              rows={2}
              className={fieldClass + highlightClass("metaDescription", highlightedField)}
            />
          </div>
          <div>
            <label htmlFor="seo-target-keyword" className="block text-sm font-medium">
              Target keyword
            </label>
            <input
              id="seo-target-keyword"
              ref={targetKeywordRef}
              value={targetKeyword}
              onChange={(e) => {
                setTargetKeyword(e.target.value);
                setSaved(false);
              }}
              className={fieldClass + highlightClass("targetKeyword", highlightedField)}
            />
          </div>
        </div>

        <div className="mt-4">
          <SerpPreview title={title} metaDescription={metaDescription} slug={page.slug} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleGetSuggestions}
            disabled={aiPending}
            className="rounded-full border border-violet-300 px-4 py-2 text-xs font-medium text-violet-700 disabled:opacity-60 dark:border-violet-800 dark:text-violet-300"
          >
            {aiPending ? "Getting suggestions…" : "Get AI suggestions"}
          </button>
          {saved && (
            <span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
              Saved.
            </span>
          )}
        </div>
        {aiError && (
          <p
            role="alert"
            className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {aiError}
          </p>
        )}
      </div>

      <SeoChecklist
        analysis={analysis}
        title={title}
        metaDescription={metaDescription}
        suggestions={suggestions}
        dismissedSuggestionIds={dismissedSuggestionIds}
        onCheckClick={handleCheckClick}
        onApplyTitle={handleApplyTitle}
        onApplyMetaDescription={handleApplyMetaDescription}
        onDismissSuggestion={handleDismissSuggestion}
      />

      {saveError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        >
          {saveError}
        </p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={savePending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
      >
        {savePending ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
