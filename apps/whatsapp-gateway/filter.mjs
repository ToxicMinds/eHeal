// What may leave the owner's WhatsApp number for Watson. The gateway runs on the owner's own number
// (owner's decision of 16 Oct 2026), so friends' chats, groups and what patients type stay on it.

const CODE = /^\s*watson\s+[0-9a-f]{8}\s*$/i; // the message a patient's link prepares: "Watson 1A2B3C4D"

/** The sender's number, digits only, from a one-to-one chat; null for anything else. */
export function senderPhone(key) {
  if (!key || key.fromMe) return null;
  // WhatsApp may address a chat by a private id (…@lid); then the number is in remoteJidAlt.
  const jid = [key.remoteJid, key.remoteJidAlt].find((j) => typeof j === "string" && j.endsWith("@s.whatsapp.net"));
  return jid ? jid.split("@")[0].split(":")[0] : null;
}

/** What Watson may see of a message: a link-up code from anyone, photos and PDFs from its patients. */
export function forWatson(phone, content, patients) {
  if (!phone) return null;
  if (content.text !== undefined) return CODE.test(content.text) ? { text: content.text } : null;
  if (content.media && patients.has(phone)) return { media: content.media };
  return null;
}
