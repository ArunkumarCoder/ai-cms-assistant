import { describe, expect, it } from "vitest";
import { checkSeedTargetSafety, redactTarget } from "./safety";

describe("checkSeedTargetSafety", () => {
  it("is safe for an obviously local target with no flag needed", () => {
    const result = checkSeedTargetSafety(
      [{ label: "Database", value: "postgres://u:p@localhost:5432/app" }],
      false,
    );
    expect(result).toEqual({ safe: true, reasons: [] });
  });

  it("is safe for an obviously staging/demo-labeled target", () => {
    const result = checkSeedTargetSafety(
      [{ label: "WordPress", value: "https://staging.example.com" }],
      false,
    );
    expect(result.safe).toBe(true);
  });

  it("refuses a target containing an explicit production marker, even with no flag", () => {
    const result = checkSeedTargetSafety(
      [
        {
          label: "Database",
          value: "postgres://u:p@prod-db.example.com:5432/app",
        },
      ],
      false,
    );
    expect(result.safe).toBe(false);
    expect(result.reasons).toHaveLength(1);
  });

  it("refuses an ambiguous target (no marker either way) without the force flag", () => {
    const result = checkSeedTargetSafety(
      [
        {
          label: "Database",
          value: "postgres://u:p@db.prisma.io:5432/postgres",
        },
      ],
      false,
    );
    expect(result.safe).toBe(false);
  });

  it("the force flag overrides a risky verdict", () => {
    const result = checkSeedTargetSafety(
      [
        {
          label: "Database",
          value: "postgres://u:p@prod-db.example.com:5432/app",
        },
      ],
      true,
    );
    expect(result.safe).toBe(true);
    // Still reports what *would* have been flagged, so the override is an
    // informed one, not a silent bypass.
    expect(result.reasons).toHaveLength(1);
  });

  it("is unsafe overall if even one of several targets is risky", () => {
    const result = checkSeedTargetSafety(
      [
        { label: "Database", value: "postgres://u:p@localhost:5432/app" },
        { label: "WordPress", value: "https://my-real-business.com" },
      ],
      false,
    );
    expect(result.safe).toBe(false);
    expect(result.reasons).toHaveLength(1);
  });
});

describe("redactTarget", () => {
  it("strips credentials from a connection string", () => {
    const redacted = redactTarget(
      "postgres://myuser:supersecret@db.example.com:5432/app?sslmode=require",
    );
    expect(redacted).not.toContain("myuser");
    expect(redacted).not.toContain("supersecret");
    expect(redacted).toContain("db.example.com");
  });

  it("redacts query string values too", () => {
    const redacted = redactTarget("https://example.com/api?token=abc123");
    expect(redacted).not.toContain("abc123");
  });
});
