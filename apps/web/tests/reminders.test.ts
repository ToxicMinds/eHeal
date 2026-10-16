// Reminders Watson sends by itself on WhatsApp (owner, 16 October): about an hour before the call,
// once, to a patient who asked for it when booking or who linked their number by messaging Watson.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { reminder } from "../../../supabase/functions/whatsapp/messages";
import { adminClient, browserClient, localStack, newPractitioner, rpc, sqlAsOwner, type Practitioner } from "./local-stack";

const stack = localStack();
const server = adminClient(stack);
const patient = browserClient(stack);


const always = Object.fromEntries(["1", "2", "3", "4", "5", "6", "7"].map((d) => [d, ["00:00", "24:00"]]));
let who: Practitioner;
let slug: string;
beforeAll(async () => {
  who = await newPractitioner(stack, "remind");
  const saved = await rpc(who.client, "save_booking_page", {
    p_display_name: "Dr. Remind", p_offer: "", p_about: "", p_languages: ["sk", "en"], p_hours: always,
    p_length_minutes: 30, p_gap_minutes: 0, p_fee_cents: null,
  });
  slug = saved.slug as string;
});

const phone = () => `+4219${Math.floor(Math.random() * 9e7 + 1e7)}`;
/** Books the next open time, then moves it to start `minutes` from now. */
async function booked(minutes: number, options: { remind: boolean; contact?: string }) {
  const { times } = await rpc(patient, "booking_times", { p_slug: slug, p_from: new Date().toISOString(), p_to: new Date(Date.now() + 2 * 86_400_000).toISOString() });
  const contact = options.contact ?? phone();
  const made = await rpc(patient, "book_time", {
    p_slug: slug, p_starts_at: (times as string[])[0], p_name: "Jana Nováková", p_contact: contact, p_language: "sk", p_remind_whatsapp: options.remind,
  });
  const at = new Date(Date.now() + minutes * 60_000).toISOString();
  const id = sqlAsOwner(`update public.consultations set scheduled_at = '${at}' where invite_token = '${made.token}' returning id;`).split("\n")[0];
  return { id, token: made.token as string, contact };
}
const due = async () => ((await rpc(server, "whatsapp_due_reminders", {})).reminders as { consultation_id: string }[]);
const isDue = async (id: string) => (await due()).some((r) => r.consultation_id === id);

describe("a WhatsApp reminder", () => {
  it("is due within the hour before the call, for a patient who asked for one, with what the message needs", async () => {
    const soon = await booked(50, { remind: true });
    const later = await booked(180, { remind: true });
    const all = await due();
    expect(all.find((r) => r.consultation_id === soon.id)).toEqual({
      consultation_id: soon.id, phone: soon.contact, scheduled_at: expect.any(String), language: "sk",
      invite_token: soon.token, short_code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{8}$/), must_pay: false, patient_name: "Jana Nováková",
    });
    expect(await isDue(later.id)).toBe(false);
  });

  it("goes only to a patient who asked, or who linked their number by messaging Watson", async () => {
    const quiet = await booked(40, { remind: false });
    expect(await isDue(quiet.id)).toBe(false);
    const code = sqlAsOwner(`select whatsapp_code from public.consultations where id = '${quiet.id}';`);
    await rpc(server, "whatsapp_receive", { p_wa_message_id: `wamid.${randomUUID()}`, p_phone: quiet.contact, p_profile_name: "Jana", p_kind: "text", p_body: `Watson ${code}` });
    expect(await isDue(quiet.id)).toBe(true);
    const byEmail = await booked(40, { remind: true, contact: `jana-${randomUUID().slice(0, 6)}@example.com` });
    expect(await isDue(byEmail.id)).toBe(false);
  });

  it("is sent once: after it is recorded it is no longer due", async () => {
    const soon = await booked(30, { remind: true });
    expect(await rpc(server, "whatsapp_reminder_sent", { p_consultation: soon.id })).toEqual({ ok: true });
    expect(await isDue(soon.id)).toBe(false);
  });

  it("is claimed once, so two runs of the schedule at the same moment cannot both send it", async () => {
    const soon = await booked(20, { remind: true });
    const claims = await Promise.all([1, 2, 3].map(() => rpc(server, "whatsapp_reminder_sent", { p_consultation: soon.id })));
    expect(claims.filter((c) => c.ok)).toHaveLength(1);
    expect(claims.filter((c) => !c.ok)).toEqual([{ ok: false, error_category: "ALREADY_SENT" }, { ok: false, error_category: "ALREADY_SENT" }]);
  });

  it("is for the server only", async () => {
    expect((await patient.rpc("whatsapp_due_reminders" as never)).error).not.toBeNull();
    expect((await who.client.rpc("whatsapp_due_reminders" as never)).error).not.toBeNull();
  });

  it("names the patient by first name and the time on the practitioner's clock, in the consultation's language", () => {
    const view = { consultation_id: "c", scheduled_at: "2026-10-26T08:00:00+00:00", language: "sk", invite_token: "t", short_code: "K7P4QX9M", must_pay: false, patient_name: "Jana Nováková" };
    expect(reminder(view)).toEqual({ language: "sk", first: "Jana", time: "09:00", text: "Dobrý deň, Jana, tu je Watson. Vaša videokonzultácia je dnes o 09:00. Pripojiť sa môžete tlačidlom nižšie." });
    expect(reminder({ ...view, language: "auto", patient_name: null }).language).toBe("en");
  });
});

describe("the schedule", () => {
  it("knocks on the Google and WhatsApp functions every five minutes, and does nothing where it is not set up", () => {
    expect(sqlAsOwner("select jobname || ' ' || schedule from cron.job order by jobname;").split("\n"))
      .toEqual(["watson-google-calendars */5 * * * *", "watson-whatsapp-reminders */5 * * * *"]);
    expect(sqlAsOwner("select private.knock('google', '{}'::jsonb);")).toBe(""); // ran, sent nothing
  });
});
