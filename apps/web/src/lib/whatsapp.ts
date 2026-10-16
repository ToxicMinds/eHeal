import type { ConsultationLanguage } from "./status";

/**
 * Tap to send: WhatsApp's own public link opens the practitioner's WhatsApp with the message
 * filled in, to this patient. Nothing is sent until they press send. No account, no cost.
 */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Watson's own WhatsApp number (Meta's test number until there are paying customers). */
export const WATSON_WHATSAPP = process.env.NEXT_PUBLIC_WATSON_WHATSAPP ?? "+15556623667";

type Language = "en" | "sk" | "de";
const LOCALE: Record<Language, string> = { en: "en-GB", sk: "sk-SK", de: "de-DE" };
// "on Tuesday" in Slovak takes a preposition and the accusative: v utorok, v stredu, vo štvrtok.
const SLOVAK_ON_DAY = ["v nedeľu", "v pondelok", "v utorok", "v stredu", "vo štvrtok", "v piatok", "v sobotu"];

/** The message for the patient's link: an invitation before the day, a reminder on the day. */
export function patientMessage(options: {
  name: string;
  scheduledAt: string;
  language: ConsultationLanguage;
  link: string;
  mustPay: boolean;
  now?: Date;
}): string {
  const language: Language = options.language === "sk" || options.language === "de" ? options.language : "en";
  const first = options.name.trim().split(/\s+/)[0];
  const when = new Date(options.scheduledAt);
  const time = new Intl.DateTimeFormat(LOCALE[language], { hour: "2-digit", minute: "2-digit" }).format(when);
  const day = language === "sk"
    ? `${SLOVAK_ON_DAY[when.getDay()]} ${new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long" }).format(when)}`
    : new Intl.DateTimeFormat(LOCALE[language], { weekday: "long", day: "numeric", month: "long" }).format(when);
  const today = when.toDateString() === (options.now ?? new Date()).toDateString();
  const { link, mustPay } = options;

  if (today) {
    return {
      en: `Hello ${first}, see you today at ${time}. Join here when you are ready: ${link}`,
      sk: `Dobrý deň, ${first}. Uvidíme sa dnes o ${time}. Pripojiť sa môžete tu: ${link}`,
      de: `Guten Tag, ${first}. Bis heute um ${time} Uhr. Hier können Sie sich verbinden: ${link}`,
    }[language];
  }
  return {
    en: `Hello ${first}, your consultation with me is on ${day} at ${time}, by video. `
      + (mustPay ? `Please pay and send any lab results here: ${link}` : `You can send any lab results here, and join the call from the same link: ${link}`),
    sk: `Dobrý deň, ${first}. Naša konzultácia je ${day} o ${time}, cez video. `
      + (mustPay ? `Zaplatiť a poslať výsledky vyšetrení môžete tu: ${link}` : `Výsledky vyšetrení môžete poslať a ku hovoru sa pripojiť tu: ${link}`),
    de: `Guten Tag, ${first}. Unser Termin ist am ${day} um ${time} Uhr, per Video. `
      + (mustPay ? `Bitte bezahlen Sie hier und senden Sie Befunde gleich mit: ${link}` : `Befunde können Sie hier senden, und über denselben Link verbinden Sie sich: ${link}`),
  }[language];
}
