import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const findManyMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    aiCallLog: {
      create: (...args: unknown[]) => createMock(...args),
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

const { getCallLogForSite, logAiCall } = await import("./logging");

beforeEach(() => {
  createMock.mockReset().mockResolvedValue(undefined);
  findManyMock.mockReset();
});

describe("logAiCall", () => {
  it("writes every field through to the log row", async () => {
    await logAiCall({
      callType: "page-generation",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      usage: { inputTokens: 100, outputTokens: 50 },
      estimatedCostUsd: 0.001,
      durationMs: 500,
      success: true,
      siteId: "site-1",
      userId: "user-1",
    });

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callType: "page-generation",
        provider: "groq",
        inputTokens: 100,
        outputTokens: 50,
        siteId: "site-1",
        userId: "user-1",
      }),
    });
  });

  it("passes fallbackFrom through when set, and omits it (undefined) otherwise", async () => {
    await logAiCall({
      callType: "page-generation",
      provider: "openai",
      model: "gpt-4o-mini",
      usage: { inputTokens: 10, outputTokens: 10 },
      estimatedCostUsd: 0.001,
      durationMs: 100,
      success: true,
      fallbackFrom: "groq",
    });

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: "openai", fallbackFrom: "groq" }),
    });
  });

  it("never throws when the write fails — a logging hiccup must not fail the caller's own AI call", async () => {
    createMock.mockRejectedValue(new Error("db unreachable"));

    await expect(
      logAiCall({
        callType: "page-generation",
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        usage: { inputTokens: 1, outputTokens: 1 },
        estimatedCostUsd: 0,
        durationMs: 1,
        success: true,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("getCallLogForSite", () => {
  it("returns the logged rows for a site", async () => {
    findManyMock.mockResolvedValue([{ id: "log-1", siteId: "site-1" }]);

    const result = await getCallLogForSite("site-1");

    expect(findManyMock).toHaveBeenCalledWith({ where: { siteId: "site-1" }, orderBy: { createdAt: "asc" } });
    expect(result).toEqual([{ id: "log-1", siteId: "site-1" }]);
  });

  it("degrades to an empty array instead of throwing when the query fails", async () => {
    findManyMock.mockRejectedValue(new Error("db unreachable"));
    await expect(getCallLogForSite("site-1")).resolves.toEqual([]);
  });
});
