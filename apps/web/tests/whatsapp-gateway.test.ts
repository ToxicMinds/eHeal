// Watson's own WhatsApp gateway (owner, 16 October): a linked WhatsApp number, while Meta waits for a
// registered business. The number is the owner's own, so the gateway passes on only what belongs to
// Watson; to know its patients it asks for the numbers linked to a consultation that is still current.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, browserClient, localStack, newPractitioner, rpc, sqlAsOwner, type Practitioner } from "./local-stack";

const stack = localStack();
const server = adminClient(stack);
let eva: Practitioner;
beforeAll(async () => {
  eva = await newPractitioner(stack, "gateway");
});

const phone = () => `+4219${Math.floor(Math.random() * 9e7 + 1e7)}`;
/** A consultation `days` from now (negative: in the past), linked on WhatsApp from a new number. */
async function linked(days: number) {
  const made = await rpc(eva.client, "create_consultation", {
    p_scheduled_at: new Date(Date.now() + days * 86_400_000).toISOString(), p_language: "en", p_consent_recorded: true,
  });
  const code = sqlAsOwner(`select whatsapp_code from public.consultations where id = '${made.consultation_id}';`);
  const number = phone();
  await rpc(server, "whatsapp_receive", { p_wa_message_id: `wamid.${randomUUID()}`, p_phone: number, p_profile_name: "Jana", p_kind: "text", p_body: `Watson ${code}` });
  return { id: made.consultation_id!, number };
}
const contacts = async () => (await rpc(server, "whatsapp_gateway_contacts")).phones as string[];

describe("the patients the WhatsApp gateway may pass messages on from", () => {
  it("are the numbers linked to a consultation ahead, or one that took place in the last three days", async () => {
    const ahead = await linked(2);
    const yesterday = await linked(-1);
    const lastWeek = await linked(-7);
    const all = await contacts();
    expect(all).toContain(ahead.number);
    expect(all).toContain(yesterday.number);
    expect(all).not.toContain(lastWeek.number);
  });

  it("leave out a patient who withdrew consent", async () => {
    const withdrawn = await linked(1);
    sqlAsOwner(`update public.consultations set status = 'consent_withdrawn' where id = '${withdrawn.id}';`);
    expect(await contacts()).not.toContain(withdrawn.number);
  });

  it("are for the server only", async () => {
    const { error } = await browserClient(stack).rpc("whatsapp_gateway_contacts" as never);
    expect(error).not.toBeNull();
    const { error: practitioner } = await eva.client.rpc("whatsapp_gateway_contacts" as never);
    expect(practitioner).not.toBeNull();
  });
});

// On Render's free plan the gateway's disk is wiped at every restart (owner, 16 Oct), so its WhatsApp
// pairing lives here, sealed by the gateway (this sees only ciphertext). Watson's schedule checks on
// it every five minutes and emails the owner when WhatsApp needs linking again or stops answering.
describe("the WhatsApp gateway's pairing and health", () => {
  const read = async () => (await rpc(server, "whatsapp_gateway_state_read")).state as Record<string, string>;

  it("keeps the sealed pairing: written, changed and removed key by key", async () => {
    expect(await rpc(server, "whatsapp_gateway_state_write", { p_changes: { "creds": "sealed-1", "session-a": "sealed-2" } })).toEqual({ ok: true });
    expect(await rpc(server, "whatsapp_gateway_state_write", { p_changes: { "creds": "sealed-3", "session-a": null } })).toEqual({ ok: true });
    const state = await read();
    expect(state.creds).toBe("sealed-3");
    expect(state).not.toHaveProperty("session-a");
    expect(await rpc(server, "whatsapp_gateway_state_write", { p_changes: "creds" })).toMatchObject({ ok: false, error_category: "VALIDATION" });
  });

  it("emails the owner once a day when WhatsApp needs linking again", async () => {
    sqlAsOwner("delete from private.owner_notices where key like 'whatsapp-%';");
    expect(await rpc(server, "whatsapp_gateway_seen", { p_status: "CONNECTED" })).toEqual({ ok: true });
    expect(sqlAsOwner("select count(*) from private.owner_notices where key like 'whatsapp-%';")).toBe("0");
    await rpc(server, "whatsapp_gateway_seen", { p_status: "SCAN_QR" });
    await rpc(server, "whatsapp_gateway_seen", { p_status: "LOGGED_OUT" });
    expect(sqlAsOwner("select key from private.owner_notices where key like 'whatsapp-%';")).toBe(`whatsapp-link-${new Date().toISOString().slice(0, 10)}`);
  });

  it("emails the owner when the gateway has not answered for twenty minutes, not after one missed knock", async () => {
    sqlAsOwner("delete from private.owner_notices where key like 'whatsapp-%';");
    await rpc(server, "whatsapp_gateway_seen", { p_status: "CONNECTED" });
    expect(await rpc(server, "whatsapp_gateway_unreachable")).toEqual({ ok: true });
    expect(sqlAsOwner("select count(*) from private.owner_notices where key like 'whatsapp-%';")).toBe("0");
    sqlAsOwner("update private.whatsapp_gateway_health set seen_at = now() - interval '21 minutes';");
    await rpc(server, "whatsapp_gateway_unreachable");
    expect(sqlAsOwner("select key from private.owner_notices where key like 'whatsapp-%';")).toBe(`whatsapp-down-${new Date().toISOString().slice(0, 10)}`);
    sqlAsOwner("delete from private.owner_notices where key like 'whatsapp-%';");
  });

  it("is for the server only", async () => {
    for (const name of ["whatsapp_gateway_state_read", "whatsapp_gateway_state_write", "whatsapp_gateway_seen", "whatsapp_gateway_unreachable"]) {
      expect((await eva.client.rpc(name as never, {} as never)).error).not.toBeNull();
    }
  });
});

// The number patients message: on the gateway it is the owner's own, so it is given only to someone
// holding a patient's link, never published in the website's code (owner, 16 Oct).
describe("Watson's WhatsApp number", () => {
  it("is given to a patient's link, and to nobody else", async () => {
    const made = await rpc(eva.client, "create_consultation", { p_scheduled_at: "2026-10-20T07:30:00Z", p_language: "en", p_consent_recorded: true });
    const token = sqlAsOwner(`select invite_token from public.consultations where id = '${made.consultation_id}';`);
    const visitor = browserClient(stack);
    expect(await rpc(visitor, "watson_whatsapp", { p_token: token })).toEqual({ ok: true, number: null });
    sqlAsOwner("select vault.create_secret('+421900000123', 'watson_whatsapp_number');");
    try {
      expect(await rpc(visitor, "watson_whatsapp", { p_token: token })).toEqual({ ok: true, number: "+421900000123" });
      expect(await rpc(visitor, "watson_whatsapp", { p_token: "0".repeat(64) })).toEqual({ ok: false, error_category: "NOT_FOUND" });
    } finally {
      sqlAsOwner("delete from vault.secrets where name = 'watson_whatsapp_number';");
    }
  });
});
