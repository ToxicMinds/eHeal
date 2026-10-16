# Watson's WhatsApp gateway

Watson's own WhatsApp while there is no registered business for Meta to verify (owner's decision of
16 Oct 2026). A copy of Synculariti's Baileys sidecar, on the owner's own Google Cloud: it links one
ordinary WhatsApp number the way WhatsApp Web does. Unofficial: WhatsApp may ban a number that uses it.

It only calls out, to Watson's `whatsapp` edge function, with the secret both share:

| It sends | Watson answers |
|---|---|
| `{event: "message", message}`: a link-up code ("Watson 1A2B3C4D") from anyone, or a photo or PDF from a patient | the replies to send |
| `{event: "poll"}`, every minute | the reminders that are due |
| `{event: "failed", id, error}`: a reply it could not send | nothing |

Every answer also carries the numbers it may take photos and PDFs from: patients linked to a consultation
that is ahead or took place in the last three days. The number is the owner's own, so nothing else
leaves the machine (`filter.mjs`, tested by `filter.test.mjs`), and nothing of a message is logged.

Deploy or update: `CLOUDSDK_ACTIVE_CONFIG_NAME=watson scripts/deploy-whatsapp-gateway.sh <project>`.
Link the number: the script prints the SSH tunnel to the pairing page. If the phone unlinks the
device, the gateway forgets the pairing and shows a new code. Turning the gateway off for Watson:
unset `WHATSAPP_GATEWAY_SECRET` on the function (Watson then speaks through Meta again).
