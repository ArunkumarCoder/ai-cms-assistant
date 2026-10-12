import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAuthRateLimitForTests } from "./rateLimit";

const headersGetMock = vi.fn().mockReturnValue("1.2.3.4");
vi.mock("next/headers", () => ({
  headers: async () => ({ get: headersGetMock }),
}));

const signInMock = vi.fn().mockResolvedValue(undefined);
const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

// The real `next-auth` package transitively imports `next/server`, which
// doesn't resolve outside Next's own bundler — same category of issue as
// `server-only` elsewhere in this codebase's tests. Only `AuthError` is
// actually used by actions.ts, so that's all this needs to provide.
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

const findUniqueMock = vi.fn().mockResolvedValue(null);
const createMock = vi.fn().mockResolvedValue({ id: "user-1" });
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

vi.mock("./password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
}));

const { loginAction, signupAction } = await import("./actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  __resetAuthRateLimitForTests();
  headersGetMock.mockReturnValue("1.2.3.4");
  signInMock.mockReset().mockResolvedValue(undefined);
  findUniqueMock.mockReset().mockResolvedValue(null);
  createMock.mockReset().mockResolvedValue({ id: "user-1" });
});

describe("loginAction rate limiting", () => {
  const credentials = formData({
    email: "a@example.com",
    password: "password123",
  });

  it("allows up to 10 attempts from the same IP within a minute", async () => {
    for (let i = 0; i < 10; i++) {
      await loginAction(undefined, credentials);
    }
    expect(signInMock).toHaveBeenCalledTimes(10);
  });

  it("blocks the 11th attempt from the same IP with a clear message, never calling signIn", async () => {
    for (let i = 0; i < 10; i++) await loginAction(undefined, credentials);
    signInMock.mockClear();

    const result = await loginAction(undefined, credentials);

    expect(result?.error).toMatch(/too many attempts/i);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("does not rate-limit a different IP after one IP is exhausted", async () => {
    for (let i = 0; i < 10; i++) await loginAction(undefined, credentials);
    signInMock.mockClear();
    headersGetMock.mockReturnValue("9.9.9.9");

    await loginAction(undefined, credentials);

    expect(signInMock).toHaveBeenCalledTimes(1);
  });
});

describe("signupAction rate limiting", () => {
  const credentials = formData({
    email: "new@example.com",
    password: "password123",
  });

  it("allows up to 5 attempts from the same IP within a minute", async () => {
    for (let i = 0; i < 5; i++) {
      await signupAction(undefined, credentials);
    }
    expect(signInMock).toHaveBeenCalledTimes(5);
  });

  it("blocks the 6th attempt with a clear message, never touching the database", async () => {
    for (let i = 0; i < 5; i++) await signupAction(undefined, credentials);
    createMock.mockClear();
    findUniqueMock.mockClear();

    const result = await signupAction(undefined, credentials);

    expect(result?.error).toMatch(/too many attempts/i);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("signup's tighter limit (5) is independent of login's (10) for the same IP", async () => {
    for (let i = 0; i < 5; i++) await signupAction(undefined, credentials);
    const blockedSignup = await signupAction(undefined, credentials);
    expect(blockedSignup?.error).toMatch(/too many attempts/i);

    // Login's own, separate budget is untouched.
    const loginResult = await loginAction(
      undefined,
      formData({ email: "a@example.com", password: "password123" }),
    );
    expect(loginResult).toBeUndefined(); // signIn mock resolves, no error state
  });
});
