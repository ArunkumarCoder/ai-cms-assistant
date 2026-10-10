import { describe, expect, it } from "vitest";
import { buildDemoAiCallLogRows } from "./demoCallLog";

const BASE_DATE = new Date("2026-10-10T12:00:00Z");

describe("buildDemoAiCallLogRows", () => {
  it("is deterministic — same inputs always produce the exact same rows", () => {
    const a = buildDemoAiCallLogRows(BASE_DATE, "site-1", "user-1");
    const b = buildDemoAiCallLogRows(BASE_DATE, "site-1", "user-1");
    expect(a).toEqual(b);
  });

  it("every row has a unique, stable id", () => {
    const rows = buildDemoAiCallLogRows(BASE_DATE, "site-1", "user-1");
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes more than one call type and provider", () => {
    const rows = buildDemoAiCallLogRows(BASE_DATE, "site-1", "user-1");
    expect(new Set(rows.map((r) => r.callType)).size).toBeGreaterThan(1);
    expect(new Set(rows.map((r) => r.provider)).size).toBeGreaterThan(1);
  });

  it("includes at least one failure with no cost or tokens", () => {
    const rows = buildDemoAiCallLogRows(BASE_DATE, "site-1", "user-1");
    const failures = rows.filter((r) => !r.success);
    expect(failures.length).toBeGreaterThan(0);
    for (const failure of failures) {
      expect(failure.estimatedCostUsd).toBe(0);
      expect(failure.errorMessage).toBeTruthy();
    }
  });

  it("includes a fallback row tagged with fallbackFrom, paired with a prior failure on that provider", () => {
    const rows = buildDemoAiCallLogRows(BASE_DATE, "site-1", "user-1");
    const fallback = rows.find((r) => r.fallbackFrom);
    expect(fallback).toBeDefined();
    expect(fallback?.success).toBe(true);
    expect(fallback?.estimatedCostUsd).toBeGreaterThan(0);

    const primaryFailure = rows.find(
      (r) =>
        r.provider === fallback?.fallbackFrom &&
        !r.success &&
        r.callType === fallback?.callType,
    );
    expect(primaryFailure).toBeDefined();
  });

  it("spreads rows across more than one calendar day, all before baseDate", () => {
    const rows = buildDemoAiCallLogRows(BASE_DATE, "site-1", "user-1");
    const days = new Set(
      rows.map((r) => r.createdAt.toISOString().slice(0, 10)),
    );
    expect(days.size).toBeGreaterThan(5);
    for (const row of rows) {
      expect(row.createdAt.getTime()).toBeLessThanOrEqual(BASE_DATE.getTime());
    }
  });

  it("stamps every row with the given siteId/userId", () => {
    const rows = buildDemoAiCallLogRows(BASE_DATE, "site-xyz", "user-xyz");
    expect(
      rows.every((r) => r.siteId === "site-xyz" && r.userId === "user-xyz"),
    ).toBe(true);
  });

  it("gives every successful row a real, positive estimated cost", () => {
    const rows = buildDemoAiCallLogRows(BASE_DATE, "site-1", "user-1");
    for (const row of rows.filter((r) => r.success)) {
      expect(row.estimatedCostUsd).toBeGreaterThan(0);
    }
  });
});
