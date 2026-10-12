import { beforeEach, describe, expect, it } from "vitest";
import { __resetAuthRateLimitForTests, checkAuthRateLimit } from "./rateLimit";

beforeEach(() => {
  __resetAuthRateLimitForTests();
});

describe("checkAuthRateLimit", () => {
  it("allows the first attempt from a fresh identifier", () => {
    expect(checkAuthRateLimit("login", "1.2.3.4", 0)).toEqual({
      allowed: true,
    });
  });

  it("allows up to the login limit (10) within one window", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkAuthRateLimit("login", "1.2.3.4", 0).allowed).toBe(true);
    }
  });

  it("blocks the 11th login attempt within the same window", () => {
    for (let i = 0; i < 10; i++) checkAuthRateLimit("login", "1.2.3.4", 0);
    const verdict = checkAuthRateLimit("login", "1.2.3.4", 0);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("blocks the 6th signup attempt — a tighter limit than login", () => {
    for (let i = 0; i < 5; i++) checkAuthRateLimit("signup", "1.2.3.4", 0);
    expect(checkAuthRateLimit("signup", "1.2.3.4", 0).allowed).toBe(false);
  });

  it("tracks login and signup limits independently for the same identifier", () => {
    for (let i = 0; i < 10; i++) checkAuthRateLimit("login", "1.2.3.4", 0);
    expect(checkAuthRateLimit("login", "1.2.3.4", 0).allowed).toBe(false);
    // Signup has its own, separate budget — exhausting login doesn't touch it.
    expect(checkAuthRateLimit("signup", "1.2.3.4", 0).allowed).toBe(true);
  });

  it("tracks different identifiers independently — one IP maxing out doesn't block another", () => {
    for (let i = 0; i < 10; i++) checkAuthRateLimit("login", "1.2.3.4", 0);
    expect(checkAuthRateLimit("login", "1.2.3.4", 0).allowed).toBe(false);
    expect(checkAuthRateLimit("login", "5.6.7.8", 0).allowed).toBe(true);
  });

  it("resets the window once it has fully elapsed", () => {
    for (let i = 0; i < 10; i++) checkAuthRateLimit("login", "1.2.3.4", 0);
    expect(checkAuthRateLimit("login", "1.2.3.4", 0).allowed).toBe(false);

    // 60_000ms window — one tick past it is a fresh window.
    expect(checkAuthRateLimit("login", "1.2.3.4", 60_001).allowed).toBe(true);
  });

  it("does not reset early — just under the window boundary still counts against the same bucket", () => {
    for (let i = 0; i < 10; i++) checkAuthRateLimit("login", "1.2.3.4", 0);
    expect(checkAuthRateLimit("login", "1.2.3.4", 59_999).allowed).toBe(false);
  });
});
