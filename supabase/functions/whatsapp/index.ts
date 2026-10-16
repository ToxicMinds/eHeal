// WhatsApp through Meta's official Cloud API (owner's decision of 14 October), after Meta's guides:
// https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks and
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started (signatures).
// Meta calls this with every message sent to Watson's number. Nothing here trusts the request:
// each call must carry Meta's signature, made with the app secret only Meta and Watson hold.
// The database's schedule calls it too, with its own secret, to send the reminders that are due.
import { admin, env, SITE, sameSecret } from "../_shared/server.ts";
import * as say from "./messages.ts";

const GRAPH = "https://graph.facebook.com/v26.0";
const READABLE = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

async function signedByMeta(body: Uint8Array, header: string | null): Promise<boolean> {
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

/** Sends one WhatsApp message and records it, delivered or not. `text` is what the patient reads. */
async function send(phone: string, consultationId: string | null, message: Record<string, unknown>, text: string): Promise<void> {
  let id: string | null = null;
  let error: string | null = null;
  try {
    const response = await graph(`${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone.slice(1), ...message }),
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
}

/** Sends a text inside the 24 hours that follow the patient's own message, and records it. */
function reply(phone: string, view: say.View | null, body: string): Promise<void> {
  return send(phone, view?.consultation_id ?? null, { type: "text", text: { body, preview_url: false } }, body);
}

/**
 * The reminders due now (an hour before the call). A template, because the patient may not have
 * written in the last 24 hours; its button opens the patient's own link.
 */
async function remind(): Promise<number> {
  const { data } = await admin.rpc("whatsapp_due_reminders");
  const due = (data?.reminders ?? []) as (say.View & { phone: string })[];
  for (const view of due) {
    const { language, first, time, text } = say.reminder(view);
    await send(view.phone, view.consultation_id, {
      type: "template",
      template: {
        name: "watson_today", language: { code: language },
        components: [
          { type: "body", parameters: [{ type: "text", text: first }, { type: "text", text: time }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: view.invite_token }] },
        ],
      },
    }, text);
    await admin.rpc("whatsapp_reminder_sent", { p_consultation: view.consultation_id });
  }
  return due.length;
}

type Message = {
  id: string; from: string; type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
};

/** A photo or PDF from a linked patient: fetched from Meta, stored as their document. */
async function keep(message: Message, phone: string, view: say.View): Promise<void> {
  const media = message.image ?? message.document!;
  const mediaType = media.mime_type.split(";")[0].trim().toLowerCase();
  if (!READABLE.includes(mediaType)) return reply(phone, view, say.notAFileWeRead(view));
  const info = await (await graph(media.id)).json();
  if (!info?.url) return reply(phone, view, say.notAFileWeRead(view));
  if (Number(info.file_size) > MAX_BYTES) return reply(phone, view, say.tooLarge(view));
  const bytes = new Uint8Array(await (await graph(info.url)).arrayBuffer());
  if (bytes.length > MAX_BYTES) return reply(phone, view, say.tooLarge(view));

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const extension = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mediaType];
  const fileName = (message.document?.filename ?? `Photo ${stamp}.${extension}`).slice(0, 200);
  const { data: started } = await admin.rpc("whatsapp_add_document", {
    p_phone: phone, p_file_name: fileName, p_media_type: mediaType, p_size_bytes: bytes.length,
  });
  if (!started?.ok) return;
  const { error } = await admin.storage.from("documents").upload(started.path, bytes, { contentType: mediaType });
  if (error) return;
  const { data: confirmed } = await admin.rpc("whatsapp_confirm_document", { p_document_id: started.document_id });
  if (confirmed?.ok) await reply(phone, view, say.received(view, fileName));
}

async function handle(message: Message, profileName: string | undefined): Promise<void> {
  const phone = `+${message.from}`;
  const kind = ["text", "image", "document", "audio"].includes(message.type) ? message.type : "other";
  const body = message.text?.body ?? message.image?.caption ?? message.document?.caption ?? message.document?.filename ?? null;
  const { data: seen } = await admin.rpc("whatsapp_receive", {
    p_wa_message_id: message.id, p_phone: phone, p_profile_name: profileName ?? null, p_kind: kind, p_body: body,
  });
  if (!seen?.ok || seen.duplicate) return;
  const view = seen.consultation as say.View | null;
  if (seen.linked && view) return reply(phone, view, say.welcome(view, SITE));
  if (!view) return reply(phone, null, say.stranger);
  if (kind === "image" || kind === "document") return keep(message, phone, view);
  if (kind === "audio") return reply(phone, view, say.noVoiceYet(view));
  // Other texts are kept for the practitioner, without an answer from Watson.
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
  // The database's schedule, every five minutes: send the reminders that are due.
  const cron = request.headers.get("x-watson-cron");
  if (cron !== null) {
    if (!sameSecret(cron, env("CRON_SECRET"))) return new Response("Forbidden", { status: 403 });
    return Response.json({ ok: true, sent: await remind() });
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
          await handle(message, names.get(message.from) || undefined);
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
