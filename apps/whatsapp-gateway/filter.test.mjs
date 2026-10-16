// The gateway runs on the owner's own WhatsApp number: only what belongs to Watson may leave it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forWatson, senderPhone } from "./filter.mjs";

const PATIENT = "421905111222";
const patients = new Set([PATIENT]);
const photo = { type: "image/jpeg", data: "…" };

test("the sender's number comes from a one-to-one chat, also when WhatsApp hides it behind a private id", () => {
  assert.equal(senderPhone({ remoteJid: "421905111222@s.whatsapp.net" }), PATIENT);
  assert.equal(senderPhone({ remoteJid: "123456789012345@lid", remoteJidAlt: "421905111222@s.whatsapp.net" }), PATIENT);
  assert.equal(senderPhone({ remoteJid: "421905111222:3@s.whatsapp.net" }), PATIENT);
});

test("groups, broadcasts, the owner's own messages and hidden ids without a number are nobody's business", () => {
  assert.equal(senderPhone({ remoteJid: "120363025@g.us", participant: "421905111222@s.whatsapp.net" }), null);
  assert.equal(senderPhone({ remoteJid: "status@broadcast" }), null);
  assert.equal(senderPhone({ remoteJid: "421905111222@s.whatsapp.net", fromMe: true }), null);
  assert.equal(senderPhone({ remoteJid: "123456789012345@lid" }), null);
  assert.equal(senderPhone(undefined), null);
});

test("anyone may link their number with a consultation's code", () => {
  assert.deepEqual(forWatson("421900000001", { text: "Watson 383D1528" }, patients), { text: "Watson 383D1528" });
  assert.deepEqual(forWatson("421900000001", { text: " watson 383d1528 " }, patients), { text: " watson 383d1528 " });
});

test("photos and PDFs reach Watson only from its patients", () => {
  assert.deepEqual(forWatson(PATIENT, { media: photo }, patients), { media: photo });
  assert.equal(forWatson("421900000001", { media: photo }, patients), null);
});

test("everything else stays in the owner's WhatsApp: chats with friends, and what patients type", () => {
  assert.equal(forWatson("421900000001", { text: "Are we still on for dinner?" }, patients), null);
  assert.equal(forWatson(PATIENT, { text: "See you tomorrow!" }, patients), null);
  assert.equal(forWatson(PATIENT, { text: "My Watson account is great" }, patients), null);
  assert.equal(forWatson(null, { text: "Watson 383D1528" }, patients), null);
});
