import { describe, expect, it } from "vitest";
import { summarizeCostUsage, type CallLogEntry } from "./aggregate";

function entry(overrides: Partial<CallLogEntry> = {}): CallLogEntry {
  return {
    provider: overrides.provider ?? "groq",
    callType: overrides.callType ?? "page-generation",
    estimatedCostUsd: overrides.estimatedCostUsd ?? 0.001,
    success: overrides.success ?? true,
    createdAt: overrides.createdAt ?? new Date("2026-09-01T12:00:00.000Z"),
    fallbackFrom: overrides.fallbackFrom,
  };
}

describe("summarizeCostUsage", () => {
  it("handles an empty log gracefully — a brand-new Site with no AI calls yet", () => {
    const summary = summarizeCostUsage([]);
    expect(summary).toEqual({
      totalCalls: 0,
      failedCalls: 0,
      totalCostUsd: 0,
      byProvider: [],
      byCallType: [],
      byDay: [],
      dominantProvider: null,
      fallbackCalls: 0,
    });
  });

  it("totals calls, failures, and cost across every entry", () => {
    const summary = summarizeCostUsage([
      entry({ estimatedCostUsd: 0.01, success: true }),
      entry({ estimatedCostUsd: 0.02, success: false }),
    ]);
    expect(summary.totalCalls).toBe(2);
    expect(summary.failedCalls).toBe(1);
    expect(summary.totalCostUsd).toBeCloseTo(0.03);
  });

  it("breaks spend and call count down per provider, sorted by cost descending", () => {
    const summary = summarizeCostUsage([
      entry({ provider: "groq", estimatedCostUsd: 0.001 }),
      entry({ provider: "groq", estimatedCostUsd: 0.001 }),
      entry({ provider: "openai", estimatedCostUsd: 0.05 }),
    ]);
    expect(summary.byProvider).toEqual([
      { provider: "openai", callCount: 1, totalCostUsd: 0.05 },
      { provider: "groq", callCount: 2, totalCostUsd: 0.002 },
    ]);
  });

  it("breaks spend and call count down per call type", () => {
    const summary = summarizeCostUsage([
      entry({ callType: "page-generation", estimatedCostUsd: 0.001 }),
      entry({ callType: "alt-text-single", estimatedCostUsd: 0.05 }),
    ]);
    expect(summary.byCallType.map((c) => c.callType)).toEqual(["alt-text-single", "page-generation"]);
  });

  it("groups spend by UTC calendar day, sorted chronologically", () => {
    const summary = summarizeCostUsage([
      entry({ createdAt: new Date("2026-09-02T00:00:00.000Z"), estimatedCostUsd: 0.01 }),
      entry({ createdAt: new Date("2026-09-01T23:59:00.000Z"), estimatedCostUsd: 0.02 }),
      entry({ createdAt: new Date("2026-09-01T01:00:00.000Z"), estimatedCostUsd: 0.03 }),
    ]);
    expect(summary.byDay).toEqual([
      { date: "2026-09-01", callCount: 2, totalCostUsd: 0.05 },
      { date: "2026-09-02", callCount: 1, totalCostUsd: 0.01 },
    ]);
  });

  it("identifies the dominant provider by call volume, not by cost", () => {
    // groq handles far more calls but openai's one call costs more overall —
    // dominantProvider should still say groq, since routing is a volume
    // decision (task item 3), not a cost one.
    const summary = summarizeCostUsage([
      entry({ provider: "groq", estimatedCostUsd: 0.001 }),
      entry({ provider: "groq", estimatedCostUsd: 0.001 }),
      entry({ provider: "groq", estimatedCostUsd: 0.001 }),
      entry({ provider: "openai", estimatedCostUsd: 0.5 }),
    ]);
    expect(summary.dominantProvider).toEqual({ provider: "groq", percentOfCalls: 75 });
  });

  it("counts rows marked as a fallback attempt (client.ts's fallbackFrom), and only those", () => {
    const summary = summarizeCostUsage([
      entry({ provider: "groq", success: false }),
      entry({ provider: "openai", fallbackFrom: "groq" }),
      entry({ provider: "groq" }),
    ]);
    expect(summary.fallbackCalls).toBe(1);
  });
});
