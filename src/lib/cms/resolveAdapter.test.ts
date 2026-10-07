import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveAdapter.ts imports the `server-only` sentinel package, which only
// resolves inside Next's own build (it has no real runtime implementation —
// webpack/Next errors on it being reached from a client bundle). Plain
// vitest has no such bundler step, so the bare import fails to resolve at
// all — this is exactly why resolveAdapter.ts had 0% test coverage before
// today (SPEC.md's Day 32 coverage pass).
vi.mock("server-only", () => ({}));

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));

const getUserSitesMock = vi.fn();
const resolveActiveSiteMock = vi.fn();
vi.mock("@/lib/sites/activeSite", () => ({
  getUserSites: (...args: unknown[]) => getUserSitesMock(...args),
  resolveActiveSite: (...args: unknown[]) => resolveActiveSiteMock(...args),
}));

const decryptSiteTokenMock = vi.fn().mockReturnValue("decrypted-secret");
vi.mock("@/lib/crypto/siteToken", () => ({
  decryptSiteToken: (...args: unknown[]) => decryptSiteTokenMock(...args),
}));

vi.mock("next-sanity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-sanity")>();
  return { ...actual, createClient: vi.fn(() => ({})) };
});

const {
  getActiveSiteForCurrentUser,
  getAdapterForCurrentUser,
  buildSanityAdapter,
  buildWordPressAdapter,
  NoSiteConnectedError,
  NotAuthenticatedError,
} = await import("./resolveAdapter");
const { SanityAdapter } = await import("./sanityAdapter");
const { WordPressAdapter } = await import("./wordpressAdapter");

function prismaSite(overrides: Record<string, unknown> = {}) {
  return {
    id: "site-1",
    userId: "user-1",
    name: "Test Site",
    cms: "sanity",
    sanityProjectId: "proj",
    sanityDataset: "production",
    sanityTokenCiphertext: null,
    wordpressUrl: null,
    wordpressUsername: null,
    wordpressAppPasswordCiphertext: null,
    brandVoice: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  authMock.mockReset();
  getUserSitesMock.mockReset();
  resolveActiveSiteMock.mockReset();
  decryptSiteTokenMock.mockClear();
});

describe("getActiveSiteForCurrentUser", () => {
  it("throws NotAuthenticatedError when there's no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(getActiveSiteForCurrentUser()).rejects.toBeInstanceOf(NotAuthenticatedError);
    expect(getUserSitesMock).not.toHaveBeenCalled();
  });

  it("returns null when the user has no connected sites", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserSitesMock.mockResolvedValue([]);
    resolveActiveSiteMock.mockResolvedValue(null);
    await expect(getActiveSiteForCurrentUser()).resolves.toBeNull();
  });

  it("returns the resolved active site for a signed-in user", async () => {
    const site = prismaSite();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserSitesMock.mockResolvedValue([site]);
    resolveActiveSiteMock.mockResolvedValue(site);
    await expect(getActiveSiteForCurrentUser()).resolves.toBe(site);
  });
});

describe("buildSanityAdapter", () => {
  it("builds a working SanityAdapter from a Prisma Site row", () => {
    const adapter = buildSanityAdapter(prismaSite());
    expect(adapter).toBeInstanceOf(SanityAdapter);
  });

  it("decrypts the token when one is present", () => {
    buildSanityAdapter(prismaSite({ sanityTokenCiphertext: "cipher" }));
    expect(decryptSiteTokenMock).toHaveBeenCalledWith("cipher");
  });

  it("throws a clear error when sanityProjectId is missing", () => {
    expect(() => buildSanityAdapter(prismaSite({ sanityProjectId: null }))).toThrow(
      /missing sanityProjectId\/sanityDataset/,
    );
  });

  it("throws a clear error when sanityDataset is missing", () => {
    expect(() => buildSanityAdapter(prismaSite({ sanityDataset: null }))).toThrow(
      /missing sanityProjectId\/sanityDataset/,
    );
  });
});

describe("buildWordPressAdapter", () => {
  function wordpressSite(overrides: Record<string, unknown> = {}) {
    return prismaSite({
      cms: "wordpress",
      sanityProjectId: null,
      sanityDataset: null,
      wordpressUrl: "http://example.test",
      wordpressUsername: "admin",
      wordpressAppPasswordCiphertext: "cipher",
      ...overrides,
    });
  }

  it("builds a working WordPressAdapter from a Prisma Site row", () => {
    const adapter = buildWordPressAdapter(wordpressSite());
    expect(adapter).toBeInstanceOf(WordPressAdapter);
    expect(decryptSiteTokenMock).toHaveBeenCalledWith("cipher");
  });

  it("throws a clear error when wordpressUrl is missing", () => {
    expect(() => buildWordPressAdapter(wordpressSite({ wordpressUrl: null }))).toThrow(
      /missing wordpressUrl/,
    );
  });

  it("throws a clear error when wordpressUsername is missing", () => {
    expect(() => buildWordPressAdapter(wordpressSite({ wordpressUsername: null }))).toThrow(
      /missing wordpressUrl/,
    );
  });

  it("throws a clear error when the application password ciphertext is missing", () => {
    expect(() =>
      buildWordPressAdapter(wordpressSite({ wordpressAppPasswordCiphertext: null })),
    ).toThrow(/missing wordpressUrl/);
  });
});

describe("getAdapterForCurrentUser", () => {
  it("throws NoSiteConnectedError when the user has no connected site", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserSitesMock.mockResolvedValue([]);
    resolveActiveSiteMock.mockResolvedValue(null);
    await expect(getAdapterForCurrentUser()).rejects.toBeInstanceOf(NoSiteConnectedError);
  });

  it("dispatches to buildSanityAdapter for a Sanity-backed site, wrapped in quality scoring", async () => {
    const site = prismaSite({ cms: "sanity" });
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserSitesMock.mockResolvedValue([site]);
    resolveActiveSiteMock.mockResolvedValue(site);

    const adapter = await getAdapterForCurrentUser();

    // withQualityScoring returns a plain object implementing CmsAdapter, not
    // a SanityAdapter instance — asserting every method actually exists is
    // exactly the regression class Day 29's integration walkthrough found
    // (object spread silently dropping prototype methods, SPEC.md §25).
    expect(typeof adapter.getPages).toBe("function");
    expect(typeof adapter.getPage).toBe("function");
    expect(typeof adapter.createPage).toBe("function");
    expect(typeof adapter.updatePage).toBe("function");
    expect(typeof adapter.listImages).toBe("function");
    expect(typeof adapter.updateImage).toBe("function");
  });

  it("dispatches to buildWordPressAdapter for a WordPress-backed site, wrapped in quality scoring", async () => {
    const site = prismaSite({
      cms: "wordpress",
      sanityProjectId: null,
      sanityDataset: null,
      wordpressUrl: "http://example.test",
      wordpressUsername: "admin",
      wordpressAppPasswordCiphertext: "cipher",
    });
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserSitesMock.mockResolvedValue([site]);
    resolveActiveSiteMock.mockResolvedValue(site);

    const adapter = await getAdapterForCurrentUser();

    expect(typeof adapter.getPages).toBe("function");
    expect(typeof adapter.getPage).toBe("function");
    expect(typeof adapter.createPage).toBe("function");
    expect(typeof adapter.updatePage).toBe("function");
    expect(typeof adapter.listImages).toBe("function");
    expect(typeof adapter.updateImage).toBe("function");
  });
});
