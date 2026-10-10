import { describe, expect, it } from "vitest";
import { CmsAdapterError } from "./errors";
import { describeCmsActionFailure } from "./errorMessage";

describe("describeCmsActionFailure", () => {
  it("never leaks a raw auth failure — points at reconnecting the Site instead", () => {
    const err = new CmsAdapterError(
      "sanity",
      "auth",
      "401 Unauthorized: invalid token xyz123",
    );
    const message = describeCmsActionFailure(err, "fallback");
    expect(message).not.toContain("xyz123");
    expect(message).not.toContain("401");
    expect(message).toMatch(/reconnect/i);
  });

  it("gives a plain network-failure message", () => {
    const err = new CmsAdapterError(
      "wordpress",
      "network",
      "ECONNREFUSED 10.0.0.1:443",
    );
    const message = describeCmsActionFailure(err, "fallback");
    expect(message).not.toContain("ECONNREFUSED");
    expect(message).toMatch(/couldn.t reach/i);
  });

  it("gives a plain rate-limit message", () => {
    const err = new CmsAdapterError(
      "sanity",
      "rate-limited",
      "429 Too Many Requests",
    );
    expect(describeCmsActionFailure(err, "fallback")).toMatch(/rate-limiting/i);
  });

  it("gives a plain malformed-response message", () => {
    const err = new CmsAdapterError(
      "wordpress",
      "malformed-response",
      "Unexpected token < in JSON",
    );
    const message = describeCmsActionFailure(err, "fallback");
    expect(message).not.toContain("Unexpected token");
    expect(message).toMatch(/didn.t expect/i);
  });

  it("passes through a plain Error's message unchanged — a legitimate, already user-facing domain error", () => {
    expect(
      describeCmsActionFailure(
        new Error("No image found with that id."),
        "fallback",
      ),
    ).toBe("No image found with that id.");
  });

  it("uses the fallback for a non-Error thrown value", () => {
    expect(describeCmsActionFailure("not an error", "fallback")).toBe(
      "fallback",
    );
  });
});
