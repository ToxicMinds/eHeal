// WhatsApp, one of two ways:
// - Meta's official Cloud API (owner's decision of 14 October), after Meta's guides:
//   https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks and
//   https://developers.facebook.com/docs/graph-api/webhooks/getting-started (signatures).
//   Meta calls this with every message sent to Watson's number, signed with the app secret only
//   Meta and Watson hold. It needs a business Meta has verified.
// - Watson's own gateway (owner's decision of 16 October, while there is no registered business):
//   a linked WhatsApp number on the owner's Google Cloud (apps/whatsapp-gateway). It calls this with
//   its own secret, passes on only what belongs to Watson, and sends what this answers. Setting
//   WHATSAPP_GATEWAY_SECRET switches to it.
// The database's schedule calls too, with its own secret, to send the reminders that are due by Meta;
// the gateway asks for them itself every minute.
import { admin, env, SITE, sameSecret } from "../_shared/server.ts";
import * as say from "./messages.ts";

const GRAPH = "https://graph.facebook.com/v26.0";
const READABLE = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const GATEWAY = env("WHATSAPP_GATEWAY_SECRET") !== "";

async function signedByMeta(body: Uint8Array<ArrayBuffer>, header: string | null): Promise<boolean> {
  const secret = env("META_APP_SECRET");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, body))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sameSecret(header.slice("sha256=".length), expected);
}

async function graph(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(path.startsWith("http") ? path : `${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, ...(init.headers ?? {}) },
  });
}

/**
 * How a message leaves, recorded either way. `text` is what the patient reads; `meta` is Meta's form
 * of it when that differs (a template).
 */
type Channel = (phone: string, consultationId: string | null, text: string, meta?: Record<string, unknown>) => Promise<void>;

const byMeta: Channel = async (phone, consultationId, text, meta = { type: "text", text: { body: text, preview_url: false } }) => {
  let id: string | null = null;
  let error: string | null = null;
  try {
    const response = await graph(`${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone.slice(1), ...meta }),
    });
    const answer = await response.json();
    id = answer?.messages?.[0]?.id ?? null;
    if (!id) error = String(answer?.error?.message ?? `HTTP ${response.status}`).slice(0, 300);
  } catch (exception) {
    error = `Not sent: ${exception instanceof Error ? exception.name : "error"}`;
  }
  await admin.rpc("whatsapp_sent", {
    p_wa_message_id: id, p_phone: phone, p_consultation_id: consultationId, p_body: text, p_error: error,
  });
};

type Outgoing = { id: string; to: string; text: string };

/** The gateway sends what this request answers; each message is recorded first, under Watson's own id. */
function byGateway(outbox: Outgoing[]): Channel {
  return async (phone, consultationId, text) => {
    const id = `watson.${crypto.randomUUID()}`;
    await admin.rpc("whatsapp_sent", { p_wa_message_id: id, p_phone: phone, p_consultation_id: consultationId, p_body: text, p_error: null });
    outbox.push({ id, to: phone, text });
  };
}

/** Answers a patient, inside the 24 hours that follow their own message. */
function reply(send: Channel, phone: string, view: say.View | null, body: string): Promise<void> {
  return send(phone, view?.consultation_id ?? null, body);
}

/**
 * The reminders due now (an hour before the call). By Meta, a template, because the patient may
 * not have written in the last 24 hours; its button opens the patient's own link. By the gateway,
 * plain text with the link, and only to numbers that wrote to Watson themselves (`onlyTo`).
 */
async function remind(send: Channel, onlyTo?: Set<string>): Promise<number> {
  const { data } = await admin.rpc("whatsapp_due_reminders");
  const due = ((data?.reminders ?? []) as (say.View & { phone: string })[]).filter((view) => !onlyTo || onlyTo.has(view.phone));
  for (const view of due) {
    // Claimed first: another run that got here at the same moment skips it.
    const { data: claim } = await admin.rpc("whatsapp_reminder_sent", { p_consultation: view.consultation_id });
    if (!claim?.ok) continue;
    if (onlyTo) {
      await send(view.phone, view.consultation_id, say.reminderWithLink(view, SITE));
      continue;
    }
    const { language, first, time, text } = say.reminder(view);
    await send(view.phone, view.consultation_id, text, {
      type: "template",
      template: {
        name: "watson_today", language: { code: language },
        components: [
          { type: "body", parameters: [{ type: "text", text: first }, { type: "text", text: time }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: view.invite_token }] },
        ],
      },
    });
  }
  return due.length;
}

/** A message that arrived, however it came. `load` fetches a photo or PDF, or says it is too large. */
type Incoming = {
  id: string; phone: string; kind: string; body: string | null; profileName?: string;
  media?: { type: string; fileName?: string; load: () => Promise<Uint8Array | "too large" | null> };
};

type MetaMessage = {
  id: string; from: string; type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
};

function fromMeta(message: MetaMessage, profileName: string | undefined): Incoming {
  const media = message.image ?? message.document;
  return {
    id: message.id, phone: `+${message.from}`, profileName,
    kind: ["text", "image", "document", "audio"].includes(message.type) ? message.type : "other",
    body: message.text?.body ?? message.image?.caption ?? message.document?.caption ?? message.document?.filename ?? null,
    media: media && {
      type: media.mime_type, fileName: message.document?.filename,
      load: async () => {
        const info = await (await graph(media.id)).json();
        if (!info?.url) return null;
        if (Number(info.file_size) > MAX_BYTES) return "too large";
        return new Uint8Array(await (await graph(info.url)).arrayBuffer());
      },
    },
  };
}

type GatewayMessage = {
  id: string; from: string; name?: string; text?: string;
  media?: { type: string; fileName?: string; data?: string; tooLarge?: boolean };
};

function fromGateway(message: GatewayMessage): Incoming {
  const media = message.media;
  return {
    id: `gateway.${message.id}`, phone: `+${message.from}`, profileName: message.name,
    kind: media ? (media.type === "application/pdf" ? "document" : "image") : "text",
    body: message.text ?? media?.fileName ?? null,
    media: media && {
      type: media.type, fileName: media.fileName,
      load: () => Promise.resolve(media.tooLarge ? "too large" : media.data ? Uint8Array.from(atob(media.data), (c) => c.charCodeAt(0)) : null),
    },
  };
}

/** A photo or PDF from a linked patient, stored as their document. */
async function keep(send: Channel, message: Incoming, view: say.View): Promise<void> {
  const { phone, media } = message;
  const mediaType = media!.type.split(";")[0].trim().toLowerCase();
  if (!READABLE.includes(mediaType)) return reply(send, phone, view, say.notAFileWeRead(view));
  const bytes = await media!.load();
  if (bytes === null) return reply(send, phone, view, say.notAFileWeRead(view));
  if (bytes === "too large" || bytes.length > MAX_BYTES) return reply(send, phone, view, say.tooLarge(view));

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const extension = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mediaType];
  const fileName = (media!.fileName ?? `Photo ${stamp}.${extension}`).slice(0, 200);
  const { data: started } = await admin.rpc("whatsapp_add_document", {
    p_phone: phone, p_file_name: fileName, p_media_type: mediaType, p_size_bytes: bytes.length,
  });
  if (!started?.ok) return;
  const { error } = await admin.storage.from("documents").upload(started.path, bytes, { contentType: mediaType });
  if (error) return;
  const { data: confirmed } = await admin.rpc("whatsapp_confirm_document", { p_document_id: started.document_id });
  if (confirmed?.ok) await reply(send, phone, view, say.received(view, fileName));
}

async function handle(send: Channel, message: Incoming): Promise<void> {
  const { phone, kind } = message;
  const { data: seen } = await admin.rpc("whatsapp_receive", {
    p_wa_message_id: message.id, p_phone: phone, p_profile_name: message.profileName ?? null, p_kind: kind, p_body: message.body,
  });
  if (!seen?.ok || seen.duplicate) return;
  const view = seen.consultation as say.View | null;
  // On Watson's own number what patients type stays in the chat; the welcome does not promise otherwise.
  if (seen.linked && view) return reply(send, phone, view, say.welcome(view, SITE, { textsReachPractitioner: !GATEWAY }));
  // The gateway's number is the owner's own: never answer someone Watson does not know.
  if (!view) return GATEWAY ? undefined : reply(send, phone, null, say.stranger);
  if (kind === "image" || kind === "document") return keep(send, message, view);
  if (kind === "audio") return reply(send, phone, view, say.noVoiceYet(view));
  // Other texts are kept for the practitioner, without an answer from Watson.
}

/** The gateway: what it passed on, a minute's check for reminders, or a message it could not send. */
async function fromTheGateway(request: Request): Promise<Response> {
  if (!GATEWAY || !sameSecret(request.headers.get("x-watson-gateway") ?? "", env("WHATSAPP_GATEWAY_SECRET"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const outbox: Outgoing[] = [];
  const send = byGateway(outbox);
  // The numbers it may pass photos on from; sent back with every answer, so a patient who just linked counts at once.
  const contacts = async () => ((await admin.rpc("whatsapp_gateway_contacts")).data?.phones ?? []) as string[];
  if (body?.event === "message" && body.message?.id && body.message?.from) {
    await handle(send, fromGateway(body.message));
  } else if (body?.event === "poll") {
    await remind(send, new Set(await contacts()));
  } else if (body?.event === "failed" && body.id) {
    await admin.rpc("whatsapp_status", { p_wa_message_id: body.id, p_status: "failed", p_error: String(body.error ?? "Not sent") });
  } else {
    return new Response("Bad request", { status: 400 });
  }
  return Response.json({ ok: true, send: outbox, contacts: await contacts() });
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === "GET") {
    // Meta checks the address once, when the webhook is set up.
    const token = env("WHATSAPP_VERIFY_TOKEN");
    const ok = token !== "" && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("Forbidden", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (request.headers.has("x-watson-gateway")) return await fromTheGateway(request);
  // The database's schedule, every five minutes: send the reminders that are due. With the gateway,
  // the gateway asks for them itself.
  const cron = request.headers.get("x-watson-cron");
  if (cron !== null) {
    if (!sameSecret(cron, env("CRON_SECRET"))) return new Response("Forbidden", { status: 403 });
    return Response.json({ ok: true, sent: GATEWAY ? 0 : await remind(byMeta) });
  }
  const raw = new Uint8Array(await request.arrayBuffer());
  if (!(await signedByMeta(raw, request.headers.get("x-hub-signature-256")))) return new Response("Forbidden", { status: 403 });

  const payload = JSON.parse(new TextDecoder().decode(raw));
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (value.metadata?.phone_number_id && value.metadata.phone_number_id !== env("WHATSAPP_PHONE_NUMBER_ID")) continue;
      const names = new Map<string, string>((value.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? ""]));
      for (const message of value.messages ?? []) {
        try {
          await handle(byMeta, fromMeta(message, names.get(message.from) || undefined));
        } catch (exception) {
          // Meta would deliver the message again and again; record nothing about its content here.
          console.error("whatsapp message not handled:", exception instanceof Error ? exception.name : "error");
        }
      }
      for (const status of value.statuses ?? []) {
        await admin.rpc("whatsapp_status", {
          p_wa_message_id: status.id, p_status: status.status, p_error: status.errors?.[0]?.title ?? null,
        });
      }
    }
  }
  return new Response("ok");
});
