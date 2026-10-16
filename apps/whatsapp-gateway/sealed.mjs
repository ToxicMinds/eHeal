// The gateway's WhatsApp pairing is kept in Watson's database, because Render's free plan wipes the
// disk at every restart (owner, 16 Oct 2026). Each value is sealed here with AES-256-GCM under a key
// only the gateway holds, and bound to its name, so the database holds nothing usable.
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

export function seal(text, key, name) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce).setAAD(Buffer.from(name));
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString("base64");
}

export function unseal(sealed, key, name) {
  const bytes = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12)).setAAD(Buffer.from(name));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

/** Whether a request carries the pairing page's password (HTTP Basic, user "watson"). */
export function mayPair(authorization, password) {
  if (!password) return false;
  const expected = Buffer.from(`Basic ${Buffer.from(`watson:${password}`).toString("base64")}`);
  const given = Buffer.from(authorization ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
