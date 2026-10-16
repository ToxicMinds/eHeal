import { describe, expect, it } from "vitest";
import { patientMessage, whatsappLink } from "./whatsapp";

const base = { name: "Jana Nováková", scheduledAt: "2026-10-20T07:30:00Z", link: "https://watson-app.onrender.com/join/?t=abc", mustPay: true };

describe("tap to send", () => {
  it("opens WhatsApp to the patient's number with the message filled in", () => {
    expect(whatsappLink("+421900123456", "Hello & bye")).toBe("https://wa.me/421900123456?text=Hello%20%26%20bye");
  });

  it("invites before the day, in the consultation's language, asking to pay only when there is a fee", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    expect(patientMessage({ ...base, language: "en", now })).toMatch(/^Hello Jana, your consultation with me is on Tuesday 20 October at \d\d:30, by video\. Please pay and send any lab results here: https/);
    expect(patientMessage({ ...base, language: "sk", now })).toMatch(/^Dobrý deň, Jana\. Naša konzultácia je v utorok 20\. októbra o \d\d:30, cez video\. Zaplatiť/);
    expect(patientMessage({ ...base, language: "auto", mustPay: false, now })).toContain("You can send any lab results here");
  });

  it("reminds on the day itself", () => {
    const now = new Date("2026-10-20T05:00:00Z");
    expect(patientMessage({ ...base, language: "de", now })).toMatch(/^Guten Tag, Jana\. Bis heute um \d\d:30 Uhr\./);
  });
});
