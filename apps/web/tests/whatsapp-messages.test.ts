// What Watson writes on WhatsApp (supabase/functions/whatsapp/messages.ts), checked without Meta.
import { describe, expect, it } from "vitest";
import { welcome } from "../../../supabase/functions/whatsapp/messages";

const view = {
  consultation_id: "c", scheduled_at: "2026-10-26T08:00:00+00:00", language: "en", invite_token: "a".repeat(64),
  short_code: "K7P4QX9M", must_pay: false, patient_name: "Jana Nováková",
};

describe("Watson's welcome on WhatsApp", () => {
  it("gives the patient their short link, the one a practitioner can read out", () => {
    const text = welcome(view, "https://watson.example");
    expect(text).toContain("https://watson.example/j/K7P4QX9M");
    expect(text).not.toContain("join/?t=");
  });
});
