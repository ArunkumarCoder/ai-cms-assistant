import type { AltText } from "@/lib/ai";

// Every state a single image's alt-text generation/review can be in — shared
// between the single-image flow (a card's own "Generate alt text" button)
// and the batch queue (src/components/BatchAltTextQueue.tsx), since batch
// mode is explicitly "run the single-image flow many times," not a second
// state machine. `"failed"` is a real, visible phase rather than bouncing
// back to `"idle"` with a side-channel error string — a failed batch item
// needs to stay identifiable as failed until retried, not disappear back
// into "hasn't been touched yet."
// "saved" is a distinct terminal state from "idle" (never touched) — without
// it, an item that was successfully suggested-then-accepted mid-batch would
// look, to computeBatchProgress below, exactly like one nobody has started
// yet, undercounting a batch's own completed total the moment anyone accepts
// something before the page refreshes with fresh server data.
export type CardPhase =
  | { name: "idle" }
  | { name: "generating" }
  | { name: "reviewing"; suggestion: AltText; draft: string; error?: string }
  | { name: "saving"; suggestion: AltText; draft: string }
  | { name: "saved" }
  | { name: "failed"; message: string };

export const IDLE_PHASE: CardPhase = { name: "idle" };

export function phaseFor(id: string, phases: Record<string, CardPhase>): CardPhase {
  return phases[id] ?? IDLE_PHASE;
}

export interface BatchProgress {
  total: number;
  queued: number;
  generating: number;
  suggested: number;
  saved: number;
  failed: number;
}

// Which of `items` are worth including in a fresh "generate all flagged"
// run: actually flagged, and not already mid-flight or already holding an
// unsaved suggestion a fresh call would silently clobber (a card sitting in
// "reviewing" with a hand-edited, not-yet-saved draft stays untouched until
// the user accepts or discards it themselves). A previously failed item is
// eligible again — that's exactly what a retry re-selects.
export function selectEligibleForBatch(
  items: readonly { id: string; flagged: boolean }[],
  phases: Record<string, CardPhase>,
): string[] {
  return items
    .filter((item) => item.flagged)
    .filter((item) => {
      const phase = phaseFor(item.id, phases);
      return phase.name === "idle" || phase.name === "failed";
    })
    .map((item) => item.id);
}

export function selectByPhase(
  ids: readonly string[],
  phases: Record<string, CardPhase>,
  phaseName: CardPhase["name"],
): string[] {
  return ids.filter((id) => phaseFor(id, phases).name === phaseName);
}

// Derives the whole progress panel from `ids` (the batch's fixed roster,
// set once when a batch starts and never narrowed by a retry — see
// MediaLibrary.tsx) plus the live `phases` map, rather than tracking a
// separate parallel "queue status" — one source of truth per image.
export function computeBatchProgress(
  ids: readonly string[],
  phases: Record<string, CardPhase>,
): BatchProgress {
  const progress: BatchProgress = {
    total: ids.length,
    queued: 0,
    generating: 0,
    suggested: 0,
    saved: 0,
    failed: 0,
  };
  for (const id of ids) {
    const phase = phaseFor(id, phases);
    if (phase.name === "idle") progress.queued++;
    else if (phase.name === "generating") progress.generating++;
    else if (phase.name === "reviewing" || phase.name === "saving") progress.suggested++;
    else if (phase.name === "saved") progress.saved++;
    else if (phase.name === "failed") progress.failed++;
  }
  return progress;
}
