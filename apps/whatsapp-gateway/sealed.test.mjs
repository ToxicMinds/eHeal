// The gateway's WhatsApp pairing lives in Watson's database, sealed by the gateway (Render's free plan
// wipes the disk at every restart). Whoever reads the database sees nothing usable.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { mayPair, seal, unseal } from "./sealed.mjs";

const key = randomBytes(32);
const pairing = JSON.stringify({ noiseKey: { private: "secret-bytes" }, me: { id: "421905111222:3@s.whatsapp.net" } });

test("a sealed value opens with the key and the name it was sealed under, and shows nothing", () => {
  const sealed = seal(pairing, key, "creds");
  assert.equal(unseal(sealed, key, "creds"), pairing);
  assert.ok(!sealed.includes("secret-bytes") && !Buffer.from(sealed, "base64").toString("latin1").includes("secret-bytes"));
  assert.notEqual(seal(pairing, key, "creds"), sealed); // a new nonce every time
});

test("a wrong key, a value moved to another name, or a changed byte does not open", () => {
  const sealed = seal(pairing, key, "creds");
  assert.throws(() => unseal(sealed, randomBytes(32), "creds"));
  assert.throws(() => unseal(sealed, key, "session-421905111222"));
  const bytes = Buffer.from(sealed, "base64");
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => unseal(bytes.toString("base64"), key, "creds"));
});

test("the pairing page opens only with its password, and never without one set", () => {
  const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
  assert.equal(mayPair(basic("watson", "p4ss"), "p4ss"), true);
  assert.equal(mayPair(basic("watson", "wrong"), "p4ss"), false);
  assert.equal(mayPair(basic("someone", "p4ss"), "p4ss"), false);
  assert.equal(mayPair(undefined, "p4ss"), false);
  assert.equal(mayPair(basic("watson", ""), ""), false);
});
