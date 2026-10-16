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
