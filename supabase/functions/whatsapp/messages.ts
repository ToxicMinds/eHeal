// What Watson writes on WhatsApp, in the consultation's language. Times are given in the
// practitioners' time zone; the patient sees them in their chat exactly as written.
import { dayAndTime, type Language, writtenLanguage } from "../_shared/wording.ts";

export type View = {
  consultation_id: string; scheduled_at: string; language: string; invite_token: string; short_code: string;
  must_pay: boolean; patient_name: string | null;
};

export const language = (view: View | null): Language => writtenLanguage(view?.language);

const when = (view: View, lang: Language) => dayAndTime(view.scheduled_at, lang);

/**
 * The answer to a patient who just linked their number. On Watson's own number (the gateway) what
 * patients type stays in the chat, so the welcome does not promise it reaches the practitioner.
 */
export function welcome(view: View, site: string, { textsReachPractitioner = true } = {}): string {
  const lang = language(view);
  const first = (view.patient_name ?? "").trim().split(/\s+/)[0];
  const { day, time } = when(view, lang);
  const link = `${site}/j/${view.short_code}`;
  return {
    en: `Hello${first ? ` ${first}` : ""}, this is Watson, your practitioner's assistant. Your consultation is on ${day} at ${time}, by video. `
      + `${view.must_pay ? "Pay and join here" : "Join here"}: ${link}\n\n`
      + "You can also send me lab results, reports or a list of your medicines right here, as photos or PDFs, and I will pass them on."
      + (textsReachPractitioner ? " Anything you write here reaches your practitioner too." : ""),
    sk: `Dobrý deň${first ? `, ${first}` : ""}, tu je Watson, asistent vášho lekára. Vaša konzultácia je ${day} o ${time}, cez video. `
      + `${view.must_pay ? "Zaplatiť a pripojiť sa môžete tu" : "Pripojiť sa môžete tu"}: ${link}\n\n`
      + "Výsledky vyšetrení, lekárske správy alebo zoznam liekov mi môžete poslať aj sem, ako fotku alebo PDF, a odovzdám ich ďalej."
      + (textsReachPractitioner ? " Všetko, čo sem napíšete, uvidí aj váš lekár." : ""),
    de: `Guten Tag${first ? `, ${first}` : ""}, hier ist Watson, der Assistent Ihrer Praxis. Ihr Termin ist am ${day} um ${time} Uhr, per Video. `
      + `${view.must_pay ? "Hier bezahlen und verbinden" : "Hier verbinden"}: ${link}\n\n`
      + "Befunde, Arztbriefe oder Ihre Medikamentenliste können Sie mir auch hier schicken, als Foto oder PDF, und ich gebe sie weiter."
      + (textsReachPractitioner ? " Was Sie hier schreiben, sieht auch Ihre Praxis." : ""),
  }[lang];
}

export const received = (view: View, file: string) => ({
  en: `Thank you. I have passed ${file} on to your practitioner.`,
  sk: `Ďakujem, ${file} som odovzdal vášmu lekárovi.`,
  de: `Danke, ich habe ${file} an Ihre Praxis weitergegeben.`,
})[language(view)];

export const notAFileWeRead = (view: View) => ({
  en: "I can pass on photos and PDFs only. Could you send it as a photo or a PDF?",
  sk: "Môžem odovzdať len fotky a PDF. Pošlete to, prosím, ako fotku alebo PDF?",
  de: "Ich kann nur Fotos und PDFs weitergeben. Können Sie es als Foto oder PDF schicken?",
})[language(view)];

export const tooLarge = (view: View) => ({
  en: "This file is larger than 10 MB. Could you send a photo of each page instead?",
  sk: "Tento súbor má viac ako 10 MB. Môžete namiesto neho poslať fotku každej strany?",
  de: "Diese Datei ist größer als 10 MB. Können Sie stattdessen jede Seite fotografieren?",
})[language(view)];

export const noVoiceYet = (view: View) => ({
  en: "I cannot pass on voice messages yet. Please write, or send a photo or a PDF.",
  sk: "Hlasové správy zatiaľ odovzdať neviem. Napíšte, prosím, alebo pošlite fotku či PDF.",
  de: "Sprachnachrichten kann ich noch nicht weitergeben. Bitte schreiben Sie, oder schicken Sie ein Foto oder PDF.",
})[language(view)];

export const stranger =
  "Hello, this is Watson, a practitioner's assistant. To connect, open the link your practitioner sent you and tap Message Watson on WhatsApp.";

// The day-of reminder is Meta's template "watson_today" (approved per language in Meta's dashboard;
// its wording must stay the same as here). Watson keeps the text it sent in its message record.
const REMINDER: Record<Language, (first: string, time: string) => string> = {
  en: (first, time) => `Hello ${first}, this is Watson. Your video consultation is today at ${time}. Join with the button below when you are ready.`,
  sk: (first, time) => `Dobrý deň, ${first}, tu je Watson. Vaša videokonzultácia je dnes o ${time}. Pripojiť sa môžete tlačidlom nižšie.`,
  de: (first, time) => `Guten Tag, ${first}, hier ist Watson. Ihr Videotermin ist heute um ${time} Uhr. Über die Schaltfläche unten können Sie sich verbinden.`,
};

/** The reminder's template parameters (first name, time) and the text the patient reads. */
export function reminder(view: View) {
  const lang = language(view);
  const first = (view.patient_name ?? "").trim().split(/\s+/)[0];
  const { time } = when(view, lang);
  return { language: lang, first, time, text: REMINDER[lang](first, time) };
}

// On Watson's own number there is no template and no button: the reminder writes the link out.
const REMINDER_WITH_LINK: Record<Language, (first: string, time: string, link: string) => string> = {
  en: (first, time, link) => `Hello ${first}, this is Watson. Your video consultation is today at ${time}. Join here when you are ready: ${link}`,
  sk: (first, time, link) => `Dobrý deň, ${first}, tu je Watson. Vaša videokonzultácia je dnes o ${time}. Pripojiť sa môžete tu: ${link}`,
  de: (first, time, link) => `Guten Tag, ${first}, hier ist Watson. Ihr Videotermin ist heute um ${time} Uhr. Hier können Sie sich verbinden: ${link}`,
};

/** The day-of reminder as plain text with the patient's short link, for Watson's own number. */
export function reminderWithLink(view: View, site: string): string {
  const { language: lang, first, time } = reminder(view);
  return REMINDER_WITH_LINK[lang](first, time, `${site}/j/${view.short_code}`);
}
