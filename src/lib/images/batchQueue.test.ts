import { describe, expect, it } from "vitest";
import {
  computeBatchProgress,
  selectByPhase,
  selectEligibleForBatch,
  type CardPhase,
} from "./batchQueue";

const SUGGESTION = { altText: "A red bike.", confidence: "high" as const, needsReview: false };

describe("selectEligibleForBatch", () => {
  it("includes flagged images with no phase entry yet", () => {
    const ids = selectEligibleForBatch(
      [{ id: "a", flagged: true }, { id: "b", flagged: false }],
      {},
    );
    expect(ids).toEqual(["a"]);
  });

  it("includes a previously-failed flagged image (this is what a retry re-selects)", () => {
    const phases: Record<string, CardPhase> = { a: { name: "failed", message: "boom" } };
    const ids = selectEligibleForBatch([{ id: "a", flagged: true }], phases);
    expect(ids).toEqual(["a"]);
  });

  it("excludes an image already mid-flight or holding an unsaved suggestion", () => {
    const phases: Record<string, CardPhase> = {
      a: { name: "generating" },
      b: { name: "reviewing", suggestion: SUGGESTION, draft: "A red bike." },
      c: { name: "saving", suggestion: SUGGESTION, draft: "A red bike." },
    };
    const ids = selectEligibleForBatch(
      [
        { id: "a", flagged: true },
        { id: "b", flagged: true },
        { id: "c", flagged: true },
      ],
      phases,
    );
    expect(ids).toEqual([]);
  });

  it("excludes unflagged images even if idle", () => {
    const ids = selectEligibleForBatch([{ id: "a", flagged: false }], {});
    expect(ids).toEqual([]);
  });
});

describe("selectByPhase", () => {
  it("filters a fixed id list down to the ones currently in a given phase", () => {
    const phases: Record<string, CardPhase> = {
      a: { name: "failed", message: "x" },
      b: { name: "reviewing", suggestion: SUGGESTION, draft: "A red bike." },
    };
    expect(selectByPhase(["a", "b", "c"], phases, "failed")).toEqual(["a"]);
    expect(selectByPhase(["a", "b", "c"], phases, "reviewing")).toEqual(["b"]);
    // "c" has no phase entry at all -> defaults to idle, matched by neither.
    expect(selectByPhase(["a", "b", "c"], phases, "idle")).toEqual(["c"]);
  });
});

describe("computeBatchProgress", () => {
  it("buckets every id in the fixed roster by its current phase", () => {
    const phases: Record<string, CardPhase> = {
      a: { name: "idle" },
      b: { name: "generating" },
      c: { name: "reviewing", suggestion: SUGGESTION, draft: "A red bike." },
      d: { name: "saving", suggestion: SUGGESTION, draft: "A red bike." },
      e: { name: "failed", message: "boom" },
      f: { name: "saved" },
    };
    const progress = computeBatchProgress(["a", "b", "c", "d", "e", "f"], phases);
    expect(progress).toEqual({
      total: 6,
      queued: 1,
      generating: 1,
      suggested: 2,
      saved: 1,
      failed: 1,
    });
  });

  it("keeps counting a roster's total even after a retry only reprocesses the failed subset", () => {
    // Simulates: batch of 3 ran, 2 succeeded and 1 failed, then only the
    // failed one was retried and is now generating again — the roster
    // (`ids`) passed in never shrank, so the other two still count.
    const ids = ["a", "b", "c"];
    const phases: Record<string, CardPhase> = {
      a: { name: "reviewing", suggestion: SUGGESTION, draft: "A red bike." },
      b: { name: "reviewing", suggestion: SUGGESTION, draft: "A red bike." },
      c: { name: "generating" },
    };
    expect(computeBatchProgress(ids, phases)).toEqual({
      total: 3,
      queued: 0,
      generating: 1,
      suggested: 2,
      saved: 0,
      failed: 0,
    });
  });

  it("counts an accepted item as 'saved', not back to 'queued' — a batch's completed total must not shrink as items get individually accepted", () => {
    const ids = ["a", "b"];
    const phases: Record<string, CardPhase> = {
      a: { name: "saved" },
      b: { name: "failed", message: "boom" },
    };
    const progress = computeBatchProgress(ids, phases);
    expect(progress.saved).toBe(1);
    expect(progress.queued).toBe(0);
  });
});
