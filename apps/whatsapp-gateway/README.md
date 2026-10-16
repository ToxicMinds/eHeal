# Watson's WhatsApp gateway

Watson's own WhatsApp while there is no registered business for Meta to verify (owner's decisions of
16 Oct 2026, [decision 0009](../../docs/decision-log/0009-cloud-engine-and-whatsapp-gateway.md)). A copy
of Synculariti's Baileys sidecar on Render's free plan: it links one ordinary WhatsApp number the way
WhatsApp Web does. Unofficial: WhatsApp may ban a number that uses it.

It only calls out, to Watson's `whatsapp` edge function, with the secret both share:

| It sends | Watson answers |
|---|---|
| `{event: "message", message}`: a link-up code ("Watson 1A2B3C4D") from anyone, or a photo or PDF from a patient | the replies to send |
| `{event: "poll"}`, every minute | the reminders that are due |
| `{event: "failed", id, error}`: a reply it could not send | nothing |
| `{event: "state-read"}` and `{event: "state-write", changes}` | its WhatsApp pairing |

Every answer also carries the numbers it may take photos and PDFs from: patients linked to a consultation
that is ahead or took place in the last three days. The number is the owner's own, so nothing else
leaves the service (`filter.mjs`), and nothing of a message is logged.

Render's free plan wipes the disk at every restart, so the pairing lives in Watson's database, each value
sealed with AES-256-GCM under `WATSON_STATE_KEY`, which only the gateway holds (`sealed.mjs`).
Watson's five-minute schedule knocks on `/health`, which keeps the free service awake, and the owner gets
an email when WhatsApp needs linking again or the gateway stops answering. `/` is the QR code that links
the number, behind a password.

Deploy or update: `scripts/deploy-whatsapp-gateway.sh`. Tests: `node --test apps/whatsapp-gateway/*.test.mjs`.
