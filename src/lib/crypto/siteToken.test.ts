import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptSiteToken, encryptSiteToken } from "./siteToken";

describe("siteToken encryption", () => {
  beforeEach(() => {
    process.env.SITE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips a token through encrypt/decrypt", () => {
    const token = "sk_live_super_secret_sanity_token";
    const ciphertext = encryptSiteToken(token);

    expect(ciphertext).not.toContain(token);
    expect(decryptSiteToken(ciphertext)).toBe(token);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const token = "same-token";
    expect(encryptSiteToken(token)).not.toBe(encryptSiteToken(token));
  });

  it("throws instead of returning garbage when the ciphertext is tampered with", () => {
    const ciphertext = encryptSiteToken("a-real-token");
    const [iv, authTag, body] = ciphertext.split(".");
    const tampered = [iv, authTag, `${body}xx`].join(".");

    expect(() => decryptSiteToken(tampered)).toThrow();
  });

  it("throws on a malformed stored value", () => {
    expect(() => decryptSiteToken("not-a-valid-ciphertext")).toThrow(
      /Malformed/,
    );
  });

  it("throws when the encryption key env var is missing", () => {
    delete process.env.SITE_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSiteToken("token")).toThrow(
      /SITE_TOKEN_ENCRYPTION_KEY/,
    );
  });

  it("throws when the encryption key isn't 32 bytes", () => {
    process.env.SITE_TOKEN_ENCRYPTION_KEY =
      Buffer.from("too-short").toString("base64");
    expect(() => encryptSiteToken("token")).toThrow(/32 bytes/);
  });
});
