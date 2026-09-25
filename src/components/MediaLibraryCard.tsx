"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { ImageAsset } from "@/types";
import type { AltText } from "@/lib/ai";
import type { AltTextAssessment } from "@/lib/images";
import { generateAltTextAction } from "@/lib/images/generateAltTextAction";
import { saveAltTextAction } from "@/lib/images/saveAltTextAction";

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

// Every state this card can be in — a plain union rather than several
// booleans so "generating and reviewing at once" or "saving with no draft
// text" can't happen as an invalid combination of independently-set flags.
type CardPhase =
  | { name: "idle" }
  | { name: "generating" }
  | { name: "reviewing"; suggestion: AltText; draft: string }
  | { name: "saving"; suggestion: AltText; draft: string };

interface MediaLibraryCardProps {
  image: ImageAsset;
  assessment: AltTextAssessment;
  page: { title: string; slug: string } | null;
}

export function MediaLibraryCard({ image, assessment, page }: MediaLibraryCardProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<CardPhase>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setPhase({ name: "generating" });
    const result = await generateAltTextAction({ imageUrl: image.url, pageTitle: page?.title });

    if ("error" in result) {
      setError(result.error);
      setPhase({ name: "idle" });
      return;
    }
    setPhase({ name: "reviewing", suggestion: result.altText, draft: result.altText.altText });
  }

  function handleDraftChange(value: string) {
    setPhase((current) =>
      current.name === "reviewing" ? { ...current, draft: value } : current,
    );
  }

  function handleDiscard() {
    setError(null);
    setPhase({ name: "idle" });
  }

  async function handleAccept() {
    if (phase.name !== "reviewing") return;
    setError(null);
    const { suggestion, draft } = phase;
    setPhase({ name: "saving", suggestion, draft });

    const cmsAssetId = image.cmsAssetId ?? image.id;
    const edited = draft.trim() !== suggestion.altText.trim();
    const result = await saveAltTextAction({ cmsAssetId, altText: draft, edited });

    if ("error" in result) {
      setError(result.error);
      setPhase({ name: "reviewing", suggestion, draft });
      return;
    }
    setPhase({ name: "idle" });
    router.refresh();
  }

  const isReviewing = phase.name === "reviewing" || phase.name === "saving";

  return (
    <li
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
        {assessment.flagged && !isReviewing && (
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

        {isReviewing && (
          <div className="mt-2 space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-2 dark:border-violet-900/50 dark:bg-violet-950/40">
            <p className="text-xs font-medium text-violet-800 dark:text-violet-300">
              AI suggestion — review or edit before saving
            </p>
            <textarea
              value={phase.draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              disabled={phase.name === "saving"}
              rows={3}
              className="w-full rounded-lg border border-violet-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:opacity-60 dark:border-violet-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {(phase.suggestion.needsReview || phase.suggestion.confidence === "low") && (
              <p className="text-xs text-violet-700 dark:text-violet-400">
                {phase.suggestion.confidence === "low"
                  ? "Low confidence — "
                  : ""}
                Worth a careful read before accepting.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={phase.name === "saving" || !phase.draft.trim()}
                className="rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {phase.name === "saving" ? "Saving…" : "Accept"}
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={phase.name === "saving"}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {!isReviewing && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={phase.name === "generating"}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {phase.name === "generating" ? "Generating…" : "Generate alt text"}
          </button>
        )}

        {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
      </div>
    </li>
  );
}
