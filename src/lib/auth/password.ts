import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// Node's built-in scrypt instead of bcrypt/argon2: no native addon to compile
// (bcrypt's node-gyp step is a common source of friction on Windows dev
// machines), no extra dependency, and scrypt is a Node-recommended KDF for
// exactly this purpose.
const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

// Stored as "<salt-hex>:<hash-hex>" — one column, self-describing, no need for
// a separate salt column.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  // Constant-time compare so a failed check can't leak timing information
  // about how much of the hash matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
