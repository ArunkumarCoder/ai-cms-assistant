import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: () => requireUserMock() }));

const findFirstMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    site: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const setActiveSiteCookieMock = vi.fn();
vi.mock("./activeSite", () => ({
  setActiveSiteCookie: (...args: unknown[]) => setActiveSiteCookieMock(...args),
}));

const { updateSiteBrandVoiceAction } = await import("./actions");

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  findFirstMock.mockReset();
  updateMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("updateSiteBrandVoiceAction", () => {
  it("updates the brand voice when the site belongs to the current user", async () => {
    findFirstMock.mockResolvedValue({ id: "site-1", userId: "user-1" });

    await updateSiteBrandVoiceAction(
      formDataFor({ siteId: "site-1", brandVoice: "Friendly and conversational." }),
    );

    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: "site-1", userId: "user-1" },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "site-1" },
      data: { brandVoice: "Friendly and conversational." },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/sites");
  });

  it("clears the brand voice (stores null) when submitted blank", async () => {
    findFirstMock.mockResolvedValue({ id: "site-1", userId: "user-1" });

    await updateSiteBrandVoiceAction(formDataFor({ siteId: "site-1", brandVoice: "   " }));

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "site-1" },
      data: { brandVoice: null },
    });
  });

  it("never updates a site that doesn't belong to the current user", async () => {
    findFirstMock.mockResolvedValue(null);

    await updateSiteBrandVoiceAction(
      formDataFor({ siteId: "someone-elses-site", brandVoice: "Hijacked" }),
    );

    expect(updateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/sites");
  });
});
