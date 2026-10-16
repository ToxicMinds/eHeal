import { dayAndTime, sameDay, writtenLanguage } from "../../../../supabase/functions/_shared/wording";
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

/** The message for the patient's link: an invitation before the day, a reminder on the day. */
export function patientMessage(options: {
  name: string;
  scheduledAt: string;
  language: ConsultationLanguage;
  link: string;
  mustPay: boolean;
  now?: Date;
}): string {
  const language = writtenLanguage(options.language);
  const first = options.name.trim().split(/\s+/)[0];
  const { day, time } = dayAndTime(options.scheduledAt, language);
  const today = sameDay(new Date(options.scheduledAt), options.now ?? new Date());
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
