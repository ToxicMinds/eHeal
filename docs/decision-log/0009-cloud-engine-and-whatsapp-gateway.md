# 0009 Watson's engine on Modal, and its own WhatsApp gateway

Date: 16 October 2026. Decided by the owner.

## What changed

1. **The engine moves from the owner's laptop to Modal.** Transcripts, document reading and forms
   stopped whenever the laptop was off. The same engine, with the laptop's exact libraries, now runs
   on Modal's processors and only while work waits: the database wakes it when a transcript, a
   document or a form is queued, and the engine stops when nothing is left
   (`apps/clinical-worker/modal_engine.py`, migration `20261016150000_cloud_engine.sql`).
2. **WhatsApp runs through Watson's own gateway.** Meta sends nothing for a business it has not
   verified, and there is no registered business yet. The gateway is a copy of Synculariti's Baileys
   sidecar on the owner's own Google Cloud, with the owner's own number
   (`apps/whatsapp-gateway`, migration `20261016140000_whatsapp_gateway.sql`).

Both copy what Synculariti already runs: a small always-on machine for WhatsApp, and Modal for the
heavy work, with three spending caps.

## Cost

- Modal gives $1 a month without a card and $30 with one. The database's monthly allowance of
  running time (3 hours, about $0.76 at 4 cores and 8 GB) keeps the engine inside the $1; with a card
  it can be raised. Modal's workspace budget and the credit itself are the other two caps.
- The gateway's e2-micro machine is in Google Cloud's free tier; its internet address costs about
  $3.65 a month, which the owner accepted.

## Privacy

- With invented test data both are fine. For real patients this is open decision OD-1 (the spec's
  default keeps clinical content on the practitioner's machine): a data processing agreement with
  Modal and Google, and EU regions, would be needed.
- The gateway runs on the owner's personal number, so it passes on only link-up codes and photos or
  PDFs from linked patients; Watson never answers strangers there.
- Baileys is unofficial: WhatsApp may ban a number that uses it. The owner chose their own number
  knowing this.

## Not chosen

- One large Google Cloud machine for everything: about $65 to 100 a month, at laptop speed.
- Keeping the engine on the laptop.
- Meta's official API: needs a registered business, which the owner will decide on later.
