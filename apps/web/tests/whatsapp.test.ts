// WhatsApp (owner's decision of 14 October): a patient links their number by sending their
// consultation's code; their photos and PDFs become their documents; Meta's repeated deliveries
// and late status updates change nothing. Only the server's key may call these functions.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, browserClient, localStack, newPractitioner, rpc, type Practitioner } from "./local-stack";

const stack = localStack();
const server = adminClient(stack);
let eva: Practitioner;
beforeAll(async () => {
  eva = await newPractitioner(stack, "eva");
});

async function serverCall(name: string, args: object): Promise<Record<string, unknown>> {
  const { data, error } = await server.rpc(name as never, args as never);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as Record<string, unknown>;
}

async function consultation() {
  const made = await rpc(eva.client, "create_consultation", {
    p_synthetic_patient_ref: "SYN-0091", p_scheduled_at: "2026-10-20T07:30:00Z", p_language: "sk", p_consent_recorded: true, p_fee_cents: 4000,
  });
  return (await eva.client.from("consultations").select("id, whatsapp_code, invite_token").eq("id", made.consultation_id!).single()).data!;
}

const phone = () => `+4219${Math.floor(Math.random() * 9e7 + 1e7)}`;
const receive = (number: string, body: string, kind = "text", id = `wamid.${randomUUID()}`) =>
  serverCall("whatsapp_receive", { p_wa_message_id: id, p_phone: number, p_profile_name: "Jana Nováková", p_kind: kind, p_body: body });

describe("a patient's WhatsApp number", () => {
  it("links itself to the consultation whose code it sends, and makes the patient known by it", async () => {
    const { id, whatsapp_code: code, invite_token: token } = await consultation();
    expect(code).toMatch(/^[0-9A-F]{8}$/);
    const number = phone();
    const linked = await receive(number, `Watson ${code.toLowerCase()}`);
    expect(linked).toEqual({
      ok: true, linked: true,
      consultation: { consultation_id: id, scheduled_at: "2026-10-20T07:30:00+00:00", language: "sk", invite_token: token, must_pay: true, patient_name: "Jana Nováková" },
    });
    const { data: patient } = await eva.client.from("patients").select("name, phone").single();
    expect(patient).toEqual({ name: "Jana Nováková", phone: number });
    expect((await eva.client.from("whatsapp_contacts").select("phone, consultation_id")).data).toEqual([{ phone: number, consultation_id: id }]);

    // Later messages are recognised by the number alone; a delivery Meta repeats is recorded once.
    const again = await receive(number, "Thank you!", "text", "wamid.repeated");
    expect(again).toMatchObject({ ok: true, linked: false, consultation: { consultation_id: id } });
    expect(await receive(number, "Thank you!", "text", "wamid.repeated")).toEqual({ ok: true, duplicate: true });
    const messages = (await eva.client.from("whatsapp_messages").select("direction, body").eq("consultation_id", id).order("created_at")).data;
    expect(messages).toEqual([{ direction: "in", body: `Watson ${code.toLowerCase()}` }, { direction: "in", body: "Thank you!" }]);
  });

  it("from a stranger without a code links nothing", async () => {
    expect(await receive(phone(), "Hello?")).toEqual({ ok: true, linked: false, consultation: null });
    expect(await receive(phone(), "Watson 00000000")).toEqual({ ok: true, linked: false, consultation: null });
  });
});

describe("a photo or PDF sent in the chat", () => {
  it("becomes a document of the linked patient, which Watson then reads", async () => {
    const { id, whatsapp_code: code } = await consultation();
    const number = phone();
    expect(await serverCall("whatsapp_add_document", { p_phone: number, p_file_name: "x.jpg", p_media_type: "image/jpeg", p_size_bytes: 3 }))
      .toEqual({ ok: false, error_category: "NOT_FOUND" });
    await receive(number, `Watson ${code}`);
    const added = await serverCall("whatsapp_add_document", { p_phone: number, p_file_name: "Prescription.jpg", p_media_type: "image/jpeg", p_size_bytes: 3 });
    expect((await server.storage.from("documents").upload(added.path as string, Buffer.from("abc"), { contentType: "image/jpeg" })).error).toBeNull();
    expect(await serverCall("whatsapp_confirm_document", { p_document_id: added.document_id })).toEqual({ ok: true });
    const { data } = await eva.client.from("patient_documents").select("consultation_id, source, reading").eq("id", added.document_id as string).single();
    expect(data).toEqual({ consultation_id: id, source: "whatsapp", reading: "waiting" });
  });
});

describe("what Watson sends", () => {
  it("is recorded, and Meta's status updates move it forward but never back", async () => {
    const { id } = await consultation();
    const number = phone();
    const sent = `wamid.${randomUUID()}`;
    await serverCall("whatsapp_sent", { p_wa_message_id: sent, p_phone: number, p_consultation_id: id, p_body: "Hello" });
    await serverCall("whatsapp_status", { p_wa_message_id: sent, p_status: "read" });
    await serverCall("whatsapp_status", { p_wa_message_id: sent, p_status: "delivered" }); // late
    const status = async () => (await eva.client.from("whatsapp_messages").select("status").eq("wa_message_id", sent).single()).data!.status;
    expect(await status()).toBe("read");
    await serverCall("whatsapp_sent", { p_wa_message_id: null, p_phone: number, p_consultation_id: id, p_body: "Hi", p_error: "Recipient phone number not in allowed list" });
    const failed = (await eva.client.from("whatsapp_messages").select("status, error").eq("consultation_id", id).eq("body", "Hi").single()).data;
    expect(failed).toEqual({ status: "failed", error: "Recipient phone number not in allowed list" });
  });
});

describe("the WhatsApp functions", () => {
  it("refuse the browser's key and signed-in practitioners", async () => {
    const args = { p_wa_message_id: "wamid.x", p_phone: "+421900000000", p_profile_name: "x", p_kind: "text", p_body: "x" };
    expect((await browserClient(stack).rpc("whatsapp_receive", args)).error).not.toBeNull();
    expect((await eva.client.rpc("whatsapp_receive", args)).error).not.toBeNull();
    expect((await eva.client.rpc("whatsapp_add_document", { p_phone: "+421900000000", p_file_name: "x", p_media_type: "image/jpeg", p_size_bytes: 1 })).error).not.toBeNull();
  });
});
