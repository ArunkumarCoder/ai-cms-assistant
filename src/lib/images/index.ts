// Deliberately no re-export of generateAltTextAction.ts/saveAltTextAction.ts
// here — this codebase's "use server" actions are always imported directly
// from their own file (see e.g. SeoPanel.tsx importing
// "@/lib/pages/saveDraftPageAction" rather than through a lib/pages barrel,
// which doesn't exist), never through a feature-area index like this one.
export { assessAltText } from "./altTextQuality";
export type { AltTextAssessment } from "./altTextQuality";
export { buildAltTextPrompt } from "./prompt";
export type { AltTextPromptContext } from "./prompt";
export { runWithConcurrency } from "./concurrency";
export {
  computeBatchProgress,
  IDLE_PHASE,
  phaseFor,
  selectByPhase,
  selectEligibleForBatch,
} from "./batchQueue";
export type { BatchProgress, CardPhase } from "./batchQueue";
