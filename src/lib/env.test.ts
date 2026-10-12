import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetEnvCacheForTests, getEnv } from "./env";

const VALID_ENV = {
  DATABASE_URL: "postgres://user:pass@host:5432/db",
  AUTH_SECRET: "a".repeat(32),
  SITE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  OPENAI_API_KEY: "sk-test",
  GROQ_API_KEY: "gsk-test",
  NEXT_PUBLIC_SANITY_PROJECT_ID: "abc12345",
  NEXT_PUBLIC_SANITY_DATASET: "production",
};

function applyEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
}

beforeEach(() => {
  __resetEnvCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetEnvCacheForTests();
});

describe("getEnv", () => {
  it("returns the parsed env when every required variable is valid", () => {
    applyEnv(VALID_ENV);
    const env = getEnv();
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.NEXT_PUBLIC_SANITY_DATASET).toBe("production");
  });

  it("throws a readable error naming the missing variable", () => {
    applyEnv({ ...VALID_ENV, DATABASE_URL: undefined });
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it("names every missing variable at once, not just the first", () => {
    applyEnv({
      ...VALID_ENV,
      DATABASE_URL: undefined,
      NEXT_PUBLIC_SANITY_PROJECT_ID: undefined,
    });
    try {
      getEnv();
      expect.unreachable("getEnv() should have thrown");
    } catch (err) {
      expect(String(err)).toContain("DATABASE_URL");
      expect(String(err)).toContain("NEXT_PUBLIC_SANITY_PROJECT_ID");
    }
  });

  it("rejects an AUTH_SECRET shorter than 32 characters with a specific message", () => {
    applyEnv({ ...VALID_ENV, AUTH_SECRET: "too-short" });
    expect(() => getEnv()).toThrow(/AUTH_SECRET/);
  });

  it("rejects a SITE_TOKEN_ENCRYPTION_KEY that doesn't decode to exactly 32 bytes", () => {
    applyEnv({
      ...VALID_ENV,
      SITE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64"),
    });
    expect(() => getEnv()).toThrow(/SITE_TOKEN_ENCRYPTION_KEY/);
  });

  it("does not require ANTHROPIC_API_KEY — not on the default routing path", () => {
    applyEnv({ ...VALID_ENV, ANTHROPIC_API_KEY: undefined });
    expect(() => getEnv()).not.toThrow();
  });

  it("does not require any AI provider key — each provider's own getDefaultClient() already checks lazily, per call, not at startup", () => {
    applyEnv({
      ...VALID_ENV,
      OPENAI_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
    });
    expect(() => getEnv()).not.toThrow();
  });

  it("does not require SANITY_API_TOKEN — a read-only setup is legitimate", () => {
    applyEnv({ ...VALID_ENV, SANITY_API_TOKEN: undefined });
    expect(() => getEnv()).not.toThrow();
  });

  it("memoizes the result — a second call doesn't re-validate", () => {
    applyEnv(VALID_ENV);
    const first = getEnv();
    // Mutate the underlying env after the first successful call — if getEnv
    // re-validated, this would now throw; it shouldn't, since the point of
    // memoizing is that env vars can't change mid-process anyway.
    vi.stubEnv("DATABASE_URL", "");
    const second = getEnv();
    expect(second).toBe(first);
  });
});
