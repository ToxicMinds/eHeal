// Patient references (owner, 16 October): Watson numbers consultations itself, so nobody types a
// reference and two consultations never share one.
import { beforeAll, describe, expect, it } from "vitest";
import { browserClient, localStack, newPractitioner, rpc, type Practitioner } from "./local-stack";

const stack = localStack();
let eva: Practitioner;
beforeAll(async () => {
  eva = await newPractitioner(stack, "refs");
});

const reference = async (id: string) =>
  (await eva.client.from("consultations").select("synthetic_patient_ref").eq("id", id).single()).data!.synthetic_patient_ref;
const number = (ref: string) => Number(ref.slice(4));

describe("a consultation's reference", () => {
  it("is given by Watson when none is typed, one higher each time", async () => {
    const args = { p_scheduled_at: "2026-10-20T07:30:00Z", p_language: "en", p_consent_recorded: true };
    const first = await rpc(eva.client, "create_consultation", args);
    const second = await rpc(eva.client, "create_consultation", args);
    const [a, b] = [await reference(first.consultation_id!), await reference(second.consultation_id!)];
    expect(a).toMatch(/^SYN-\d{6}$/);
    expect(number(b)).toBeGreaterThan(number(a));
  });

  it("is given the same way to a booking a patient makes", async () => {
    const always = Object.fromEntries(["1", "2", "3", "4", "5", "6", "7"].map((d) => [d, ["00:00", "24:00"]]));
    const page = await rpc(eva.client, "save_booking_page", {
      p_display_name: "Dr. Refs", p_offer: "", p_about: "", p_languages: ["en"], p_hours: always, p_length_minutes: 30, p_gap_minutes: 0, p_fee_cents: null,
    });
    const visitor = browserClient(stack);
    const { times } = await rpc(visitor, "booking_times", { p_slug: page.slug, p_from: new Date().toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString() });
    const booked = await rpc(visitor, "book_time", {
      p_slug: page.slug, p_starts_at: (times as string[])[0], p_name: "Jana", p_contact: "+421905000111", p_language: "en", p_remind_whatsapp: false,
    });
    const { data } = await eva.client.from("consultations").select("synthetic_patient_ref").eq("invite_token", booked.token as string).single();
    expect(data!.synthetic_patient_ref).toMatch(/^SYN-\d{6}$/);
  });
});
