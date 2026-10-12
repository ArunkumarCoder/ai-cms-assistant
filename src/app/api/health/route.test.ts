import { describe, expect, it, vi } from "vitest";

const queryRawMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

const fetchMock = vi.fn();
vi.mock("@/sanity/client", () => ({
  client: { fetch: (...args: unknown[]) => fetchMock(...args) },
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  it("returns 200 and status ok when both the database and CMS are reachable", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    fetchMock.mockResolvedValue(42);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: { database: "ok", cms: "ok" },
    });
  });

  it("returns 503 and status degraded when the database is unreachable", async () => {
    queryRawMock.mockRejectedValue(
      new Error("connection refused to db.internal.example:5432"),
    );
    fetchMock.mockResolvedValue(42);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toBe("error");
  });

  it("returns 503 when the CMS is unreachable, independent of the database check", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    fetchMock.mockRejectedValue(new Error("fetch failed"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks).toEqual({ database: "ok", cms: "error" });
  });

  it("never includes the raw error message anywhere in the response body", async () => {
    queryRawMock.mockRejectedValue(
      new Error("password authentication failed for user secret_admin"),
    );
    fetchMock.mockResolvedValue(42);

    const response = await GET();
    const text = JSON.stringify(await response.json());

    expect(text).not.toContain("secret_admin");
    expect(text).not.toContain("password");
  });

  it("includes a timestamp", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    fetchMock.mockResolvedValue(42);

    const body = await (await GET()).json();

    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
  });
});
