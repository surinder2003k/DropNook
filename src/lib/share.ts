import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Helpers for the shareable-link features.
 *
 * - slug: short, URL-safe token used as the public share link (/s/<slug>)
 * - password: hashed with scrypt; never stored or returned in plaintext
 */

const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"; // no l/0/1 confusion
const SLUG_LENGTH = 8;

/** Generate a short, random, URL-safe share slug (e.g. `k7mq2xrn`). */
export function generateSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

/** Hash a share password with scrypt. Returns `salt:hash` (hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scrypt(password, salt);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Verify a plaintext password against a stored `salt:hash` value. */
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return true; // no password set → open access
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scrypt(password, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function scrypt(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
}
