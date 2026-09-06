import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// No real Sanity project/token is available in this environment to exercise
// the happy path live (see SPEC.md §8) — this mocks the Sanity client so the
// *wiring* (validate-then-encrypt-then-persist-then-redirect) is still
// covered even though the failure paths were verified against the real API.
const getPagesMock = vi.fn();
vi.mock("next-sanity", () => ({
  createClient: vi.fn(() => ({})),
}));
vi.mock("./sanityAdapter", () => ({
  SanityAdapter: vi.fn().mockImplementation(function FakeSanityAdapter(this: {
    getPages: typeof getPagesMock;
  }) {
    this.getPages = getPagesMock;
  }),
}));

const requireUserMock = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUserMock() }));

const siteCreateMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { site: { create: (...args: unknown[]) => siteCreateMock(...args) } },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { connectSiteAction } = await import("./connectSiteAction");

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("connectSiteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SITE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    requireUserMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
    });
  });

  it("validates via a real adapter call, then encrypts the token and persists before redirecting", async () => {
    getPagesMock.mockResolvedValue([]);

    await expect(
      connectSiteAction(
        undefined,
        formDataFor({
          name: "Client Site",
          projectId: "abc123",
          dataset: "production",
          token: "sk_real_token_value",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/pages");

    expect(getPagesMock).toHaveBeenCalledTimes(1);
    expect(siteCreateMock).toHaveBeenCalledTimes(1);

    const { data } = siteCreateMock.mock.calls[0][0];
    expect(data.userId).toBe("user-1");
    expect(data.sanityProjectId).toBe("abc123");
    expect(data.sanityTokenCiphertext).not.toContain("sk_real_token_value");
  });

  it("does not persist a Site when the validation call fails", async () => {
    getPagesMock.mockRejectedValue(new Error("Unauthorized"));

    const result = await connectSiteAction(
      undefined,
      formDataFor({
        name: "Client Site",
        projectId: "abc123",
        dataset: "production",
        token: "wrong-token",
      }),
    );

    expect(result?.error).toMatch(/Couldn't connect/);
    expect(siteCreateMock).not.toHaveBeenCalled();
  });

  it("rejects an obviously malformed project ID before ever calling Sanity", async () => {
    const result = await connectSiteAction(
      undefined,
      formDataFor({
        name: "Client Site",
        projectId: "not a valid id!",
        dataset: "production",
        token: "token",
      }),
    );

    expect(result?.error).toMatch(/project ID/);
    expect(getPagesMock).not.toHaveBeenCalled();
    expect(siteCreateMock).not.toHaveBeenCalled();
  });
});
