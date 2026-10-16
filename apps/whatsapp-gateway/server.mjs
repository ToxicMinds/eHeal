// Watson's own WhatsApp (owner's decision of 16 Oct 2026, while there is no registered business for
// Meta to verify): a copy of Synculariti's Baileys sidecar, on the owner's own Google Cloud. It links
// one WhatsApp number the way WhatsApp Web does, and only ever calls out, to Watson's whatsapp function:
// - what arrives: a link-up code from anyone, photos and PDFs from Watson's patients (filter.mjs).
//   Nothing else on the number leaves this machine, and nothing of a message is logged.
// - what to send: Watson's answer to each message, and every minute the reminders that are due.
// The QR code that links the number is served inside the machine only: reach it over an SSH tunnel.
import { readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import makeWASocket, {
  Browsers, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { forWatson, senderPhone } from "./filter.mjs";

const WATSON_URL = process.env.WATSON_URL ?? ""; // https://<project>.supabase.co/functions/v1/whatsapp
const SECRET = process.env.WATSON_GATEWAY_SECRET ?? "";
if (!WATSON_URL || !SECRET) {
  console.error("[gateway] WATSON_URL and WATSON_GATEWAY_SECRET must be set.");
  process.exit(1);
}
const SESSION_DIR = "/sessions"; // the pairing: keep it, or the number has to be linked again
const MAX_BYTES = 10 * 1024 * 1024;
const READABLE = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const logger = pino({ level: "silent" });

let sock = null;
let status = "STARTING";
let qr = null;
let patients = new Set(); // numbers (digits) Watson may receive photos from; Watson refreshes it with every answer

/** One call to Watson; then sends whatever Watson answers, one message a second. */
async function tell(body) {
  const response = await fetch(WATSON_URL, {
    method: "POST", headers: { "Content-Type": "application/json", "x-watson-gateway": SECRET }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Watson answered ${response.status}`);
  const answer = await response.json();
  patients = new Set((answer.contacts ?? []).map((phone) => phone.replace(/^\+/, "")));
  for (const { id, to, text } of answer.send ?? []) {
    try {
      if (status !== "CONNECTED") throw new Error("Not connected");
      await sock.sendMessage(`${to.replace(/^\+/, "")}@s.whatsapp.net`, { text });
    } catch (error) {
      await tell({ event: "failed", id, error: String(error).slice(0, 200) }).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** A message's text, or its photo or document; null for anything else (stickers, voice, video…). */
function contentOf(message) {
  const m = message.message;
  if (!m) return null;
  const text = m.conversation ?? m.extendedTextMessage?.text;
  if (typeof text === "string") return { text };
  const media = m.imageMessage ?? m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
  if (!media) return null;
  return { media: { type: String(media.mimetype ?? "").split(";")[0], fileName: media.fileName ?? undefined, size: Number(String(media.fileLength ?? 0)) } };
}

async function passOn(message) {
  const phone = senderPhone(message.key);
  const content = contentOf(message);
  const passed = content && forWatson(phone, content, patients);
  if (!passed) return;
  const out = { id: message.key.id, from: phone, name: message.pushName ?? undefined };
  if (passed.text !== undefined) {
    out.text = passed.text;
  } else {
    const { type, fileName, size } = passed.media;
    if (!READABLE.test(type)) out.media = { type, fileName }; // Watson answers that it reads photos and PDFs
    else if (size > MAX_BYTES) out.media = { type, fileName, tooLarge: true };
    else {
      const bytes = await downloadMediaMessage(message, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
      out.media = bytes.length > MAX_BYTES ? { type, fileName, tooLarge: true } : { type, fileName, data: bytes.toString("base64") };
    }
  }
  await tell({ event: "message", message: out });
}

async function connect() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  sock = makeWASocket({
    version, logger,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    browser: Browsers.ubuntu("Watson"),
    // The number is the owner's own: their phone keeps its notifications, and old chats are not fetched.
    markOnlineOnConnect: false, syncFullHistory: false,
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return; // history and the number's own sends are not new messages
    for (const message of messages ?? []) {
      await passOn(message).catch((error) => console.log("[gateway] a message was not passed on:", String(error).slice(0, 200)));
    }
  });
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr: code }) => {
    if (code) {
      qr = await QRCode.toDataURL(code);
      status = "SCAN_QR";
    }
    if (connection === "open") {
      status = "CONNECTED";
      qr = null;
      console.log("[gateway] connected");
      tell({ event: "poll" }).catch((error) => console.log("[gateway] poll failed:", String(error).slice(0, 200)));
    }
    if (connection === "close") {
      const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      status = loggedOut ? "LOGGED_OUT" : "RECONNECTING";
      console.log(`[gateway] ${status.toLowerCase()}`);
      // Unlinked from the phone: forget the old pairing and offer a new QR code.
      if (loggedOut) for (const name of readdirSync(SESSION_DIR)) rmSync(`${SESSION_DIR}/${name}`, { recursive: true, force: true });
      setTimeout(() => connect().catch((error) => console.log("[gateway] connect failed:", String(error))), loggedOut ? 1000 : 5000);
    }
  });
}

setInterval(() => {
  if (status === "CONNECTED") tell({ event: "poll" }).catch((error) => console.log("[gateway] poll failed:", String(error).slice(0, 200)));
}, 60_000);

// The pairing page. Published on the machine's own 127.0.0.1 only (see scripts/deploy-whatsapp-gateway.sh).
createServer((_, response) => {
  const body = status === "CONNECTED"
    ? "<h1>Watson's WhatsApp is linked</h1><p>You can close this window.</p>"
    : `<h1>Link Watson's WhatsApp</h1><p>On the phone: WhatsApp, Settings, Linked devices, Link a device. Then scan:</p>
       ${qr ? `<img src="${qr}" width="300" height="300" alt="QR code to link the number">` : "<p>Preparing a code…</p>"}
       <p>Status: ${status}. This page refreshes every 5 seconds.</p>`;
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><meta http-equiv="refresh" content="5"><body style="font-family:sans-serif;text-align:center;padding:40px">${body}</body>`);
}).listen(8080, "0.0.0.0");

connect().catch((error) => console.log("[gateway] connect failed:", String(error)));
