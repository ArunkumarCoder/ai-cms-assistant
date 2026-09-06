import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// How a connected Site's Sanity API token is stored at rest: AES-256-GCM, not
// a hash — the app has to hand the real token back to Sanity on every read/
// write, so a one-way hash (right choice for user passwords, see
// src/lib/auth/password.ts) can't work here. GCM's auth tag also means a
// tampered ciphertext fails to decrypt loudly instead of silently returning
// garbage that gets sent to Sanity as a bearer token.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is the GCM-recommended size.

function getKey(): Buffer {
  const raw = process.env.SITE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Missing SITE_TOKEN_ENCRYPTION_KEY. Generate one with `openssl rand -base64 32` " +
        "and add it to .env.local.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "SITE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded).",
    );
  }
  return key;
}

// One opaque string per token: base64(iv) + "." + base64(authTag) +
// "." + base64(ciphertext). Whatever stores this (Site.sanityTokenCiphertext)
// never sees the plaintext token — only encryptSiteToken/decryptSiteToken do.
export function encryptSiteToken(token: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64"))
    .join(".");
}

export function decryptSiteToken(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error(
      "Malformed encrypted site token (expected 3 dot-separated segments).",
    );
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
