// How Watson says a consultation's day and time to a patient: in the consultation's language and
// on the practitioner's clock. Shared by the WhatsApp function and the web app's tap-to-send
// messages (apps/web/src/lib/whatsapp.ts imports this file), so both always say it the same way.

export type Language = "en" | "sk" | "de";
const TIME_ZONE = "Europe/Bratislava";
const LOCALE: Record<Language, string> = { en: "en-GB", sk: "sk-SK", de: "de-DE" };
// "on Tuesday" in Slovak takes a preposition and the accusative: v utorok, v stredu, vo štvrtok.
const SLOVAK_ON_DAY = ["v nedeľu", "v pondelok", "v utorok", "v stredu", "vo štvrtok", "v piatok", "v sobotu"];
const WEEKDAY_INDEX = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const format = (lang: string, options: Intl.DateTimeFormatOptions, at: Date) =>
  new Intl.DateTimeFormat(lang, { timeZone: TIME_ZONE, ...options }).format(at);

/** The language Watson writes in for a consultation: Slovak, German, else English ("auto" included). */
export const writtenLanguage = (language: string | null | undefined): Language =>
  language === "sk" || language === "de" ? language : "en";

/** {day: "Tuesday 20 October" | "v utorok 20. októbra" | "Dienstag, 20. Oktober", time: "09:30"}. */
export function dayAndTime(iso: string, lang: Language): { day: string; time: string } {
  const at = new Date(iso);
  const time = format(LOCALE[lang], { hour: "2-digit", minute: "2-digit" }, at);
  const day = lang === "sk"
    ? `${SLOVAK_ON_DAY[WEEKDAY_INDEX.indexOf(format("en-GB", { weekday: "short" }, at))]} ${format("sk-SK", { day: "numeric", month: "long" }, at)}`
    : format(LOCALE[lang], { weekday: "long", day: "numeric", month: "long" }, at);
  return { day, time };
}

/** Whether two instants fall on the same day on the practitioner's clock. */
export const sameDay = (a: Date, b: Date) => format("en-CA", { dateStyle: "short" }, a) === format("en-CA", { dateStyle: "short" }, b);
