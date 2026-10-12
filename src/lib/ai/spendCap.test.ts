import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_USER_EMAIL } from "@/lib/demoAccount";

const aggregateMock = vi.fn();
const countMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    aiCallLog: {
      aggregate: (...args: unknown[]) => aggregateMock(...args),
      count: (...args: unknown[]) => countMock(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

const {
  AiSpendCapError,
  assertWithinSpendCap,
  dailyCallCap,
  evaluateSpendCap,
  monthlySpendCapUsd,
} = await import("./spendCap");

beforeEach(() => {
  aggregateMock
    .mockReset()
    .mockResolvedValue({ _sum: { estimatedCostUsd: 0 } });
  countMock.mockReset().mockResolvedValue(0);
  findUniqueMock
    .mockReset()
    .mockResolvedValue({ email: "someone@example.com" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("evaluateSpendCap (pure)", () => {
  it("allows a call well under both caps", () => {
    expect(
      evaluateSpendCap({
        monthSpendUsd: 1,
        monthCapUsd: 20,
        dailyCallCount: 1,
        dailyCallCapValue: 40,
      }),
    ).toEqual({ allowed: true });
  });

  it("blocks on the monthly cap once spend reaches it, even with daily calls to spare", () => {
    expect(
      evaluateSpendCap({
        monthSpendUsd: 20,
        monthCapUsd: 20,
        dailyCallCount: 0,
        dailyCallCapValue: 40,
      }),
    ).toEqual({ allowed: false, kind: "monthly" });
  });

  it("blocks on the daily cap once reached, even with monthly budget to spare", () => {
    expect(
      evaluateSpendCap({
        monthSpendUsd: 0,
        monthCapUsd: 20,
        dailyCallCount: 40,
        dailyCallCapValue: 40,
      }),
    ).toEqual({ allowed: false, kind: "daily" });
  });

  it("the monthly cap takes priority when both are simultaneously exceeded", () => {
    const verdict = evaluateSpendCap({
      monthSpendUsd: 25,
      monthCapUsd: 20,
      dailyCallCount: 50,
      dailyCallCapValue: 40,
    });
    expect(verdict).toEqual({ allowed: false, kind: "monthly" });
  });

  it("allows a call exactly one under each cap", () => {
    expect(
      evaluateSpendCap({
        monthSpendUsd: 19.99,
        monthCapUsd: 20,
        dailyCallCount: 39,
        dailyCallCapValue: 40,
      }),
    ).toEqual({ allowed: true });
  });
});

describe("monthlySpendCapUsd / dailyCallCap env overrides", () => {
  it("uses the default monthly cap with no env override", () => {
    expect(monthlySpendCapUsd()).toBe(20);
  });

  it("honors a valid AI_MONTHLY_SPEND_CAP_USD override", () => {
    vi.stubEnv("AI_MONTHLY_SPEND_CAP_USD", "5");
    expect(monthlySpendCapUsd()).toBe(5);
  });

  it("falls back to the default for an invalid override", () => {
    vi.stubEnv("AI_MONTHLY_SPEND_CAP_USD", "not-a-number");
    expect(monthlySpendCapUsd()).toBe(20);
  });

  it("gives the demo account a tighter daily cap than a real account by default", () => {
    expect(dailyCallCap(true)).toBeLessThan(dailyCallCap(false));
  });
});

describe("assertWithinSpendCap (integration, mocked Prisma)", () => {
  it("resolves silently when under both caps", async () => {
    await expect(assertWithinSpendCap("user-1")).resolves.toBeUndefined();
  });

  it("throws AiSpendCapError('monthly') once the global monthly spend is reached, regardless of which user is asking", async () => {
    aggregateMock.mockResolvedValue({ _sum: { estimatedCostUsd: 20 } });

    const err = await assertWithinSpendCap("user-1").catch((e) => e);
    expect(err).toBeInstanceOf(AiSpendCapError);
    expect(err.kind).toBe("monthly");
    expect(err.message).toMatch(/monthly/i);
  });

  it("throws AiSpendCapError('daily') once this user's own daily call count is reached", async () => {
    countMock.mockResolvedValue(40);

    const err = await assertWithinSpendCap("user-1").catch((e) => e);
    expect(err).toBeInstanceOf(AiSpendCapError);
    expect(err.kind).toBe("daily");
  });

  it("applies the demo account's tighter daily cap, not the normal one", async () => {
    findUniqueMock.mockResolvedValue({ email: DEMO_USER_EMAIL });
    countMock.mockResolvedValue(8); // over the demo cap, under the normal one

    await expect(assertWithinSpendCap("demo-user-id")).rejects.toThrow(
      AiSpendCapError,
    );
  });

  it("does not apply the demo account's tighter cap to a real account with the same call count", async () => {
    findUniqueMock.mockResolvedValue({ email: "real-user@example.com" });
    countMock.mockResolvedValue(8); // under the normal cap of 40

    await expect(assertWithinSpendCap("real-user-id")).resolves.toBeUndefined();
  });

  it("skips the per-user daily check (but still applies the monthly cap) when no userId is given", async () => {
    await expect(assertWithinSpendCap(undefined)).resolves.toBeUndefined();
    expect(countMock).not.toHaveBeenCalled();
    expect(aggregateMock).toHaveBeenCalled();
  });
});
