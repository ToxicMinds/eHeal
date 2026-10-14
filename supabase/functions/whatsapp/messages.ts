// What Watson writes on WhatsApp, in the consultation's language. Times are given in the
// practitioners' time zone; the patient sees them in their chat exactly as written.
type Language = "en" | "sk" | "de";
export type View = {
  consultation_id: string; scheduled_at: string; language: string; invite_token: string;
  must_pay: boolean; patient_name: string | null;
};

const TIME_ZONE = "Europe/Bratislava";
const LOCALE: Record<Language, string> = { en: "en-GB", sk: "sk-SK", de: "de-DE" };
// "on Tuesday" in Slovak takes a preposition and the accusative: v utorok, v stredu, vo štvrtok.
const SLOVAK_ON_DAY = ["v nedeľu", "v pondelok", "v utorok", "v stredu", "vo štvrtok", "v piatok", "v sobotu"];

export const language = (view: View | null): Language =>
  view?.language === "sk" || view?.language === "de" ? view.language : "en";

function when(view: View, lang: Language) {
  const at = new Date(view.scheduled_at);
  const time = new Intl.DateTimeFormat(LOCALE[lang], { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(at);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: TIME_ZONE }).format(at);
  const day = lang === "sk"
    ? `${SLOVAK_ON_DAY[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday)]} ${new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", timeZone: TIME_ZONE }).format(at)}`
    : new Intl.DateTimeFormat(LOCALE[lang], { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }).format(at);
  return { day, time };
}

/** The answer to a patient who just linked their number. */
export function welcome(view: View, site: string): string {
  const lang = language(view);
  const first = (view.patient_name ?? "").trim().split(/\s+/)[0];
  const { day, time } = when(view, lang);
  const link = `${site}/join/?t=${view.invite_token}`;
  return {
    en: `Hello${first ? ` ${first}` : ""}, this is Watson, your practitioner's assistant. Your consultation is on ${day} at ${time}, by video. `
      + `${view.must_pay ? "Pay and join here" : "Join here"}: ${link}\n\n`
      + "You can also send me lab results, reports or a list of your medicines right here, as photos or PDFs, and I will pass them on. Anything you write here reaches your practitioner too.",
    sk: `Dobrý deň${first ? `, ${first}` : ""}, tu je Watson, asistent vášho lekára. Vaša konzultácia je ${day} o ${time}, cez video. `
      + `${view.must_pay ? "Zaplatiť a pripojiť sa môžete tu" : "Pripojiť sa môžete tu"}: ${link}\n\n`
      + "Výsledky vyšetrení, lekárske správy alebo zoznam liekov mi môžete poslať aj sem, ako fotku alebo PDF, a odovzdám ich ďalej. Všetko, čo sem napíšete, uvidí aj váš lekár.",
    de: `Guten Tag${first ? `, ${first}` : ""}, hier ist Watson, der Assistent Ihrer Praxis. Ihr Termin ist am ${day} um ${time} Uhr, per Video. `
      + `${view.must_pay ? "Hier bezahlen und verbinden" : "Hier verbinden"}: ${link}\n\n`
      + "Befunde, Arztbriefe oder Ihre Medikamentenliste können Sie mir auch hier schicken, als Foto oder PDF, und ich gebe sie weiter. Was Sie hier schreiben, sieht auch Ihre Praxis.",
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
