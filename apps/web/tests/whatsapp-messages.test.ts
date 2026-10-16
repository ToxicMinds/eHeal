// What Watson writes on WhatsApp (supabase/functions/whatsapp/messages.ts), checked without Meta.
import { describe, expect, it } from "vitest";
import { reminderWithLink, welcome } from "../../../supabase/functions/whatsapp/messages";

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

// On Watson's own number (the gateway, owner's decision of 16 Oct) there is no Meta template with a
// button, and what a patient types stays in the chat: only codes, photos and PDFs reach Watson.
describe("Watson on its own number", () => {
  it("does not promise that what the patient writes reaches the practitioner", () => {
    expect(welcome(view, "https://watson.example")).toContain("Anything you write here reaches your practitioner too.");
    const text = welcome(view, "https://watson.example", { textsReachPractitioner: false });
    expect(text).toContain("https://watson.example/j/K7P4QX9M");
    expect(text).not.toContain("Anything you write");
    expect(welcome({ ...view, language: "sk" }, "https://watson.example", { textsReachPractitioner: false })).not.toContain("Všetko, čo sem napíšete");
    expect(welcome({ ...view, language: "de" }, "https://watson.example", { textsReachPractitioner: false })).not.toContain("Was Sie hier schreiben");
  });

  it("reminds with the link written out, in the consultation's language", () => {
    expect(reminderWithLink(view, "https://watson.example")).toBe(
      "Hello Jana, this is Watson. Your video consultation is today at 09:00. Join here when you are ready: https://watson.example/j/K7P4QX9M");
    expect(reminderWithLink({ ...view, language: "sk" }, "https://watson.example")).toBe(
      "Dobrý deň, Jana, tu je Watson. Vaša videokonzultácia je dnes o 09:00. Pripojiť sa môžete tu: https://watson.example/j/K7P4QX9M");
    expect(reminderWithLink({ ...view, language: "de" }, "https://watson.example")).toBe(
      "Guten Tag, Jana, hier ist Watson. Ihr Videotermin ist heute um 09:00 Uhr. Hier können Sie sich verbinden: https://watson.example/j/K7P4QX9M");
  });
});
