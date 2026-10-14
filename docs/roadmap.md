# Roadmap and status

The plan is defined in [MASTER_BUILD_SPEC.md](../MASTER_BUILD_SPEC.md), section 21.
This file only tracks where we are. Update it at the end of every slice.

Last updated: 14 October 2026 (order changed by [decision 0005](decision-log/0005-call-to-form.md); payment added by [decision 0007](decision-log/0007-patient-payment.md)).

| Slice | When it is done, you can | Status |
|---|---|---|
| **Phase 0 — Foundations** | | Done |
| **Phase 1 — Transcription through the web app** | | In progress |
| 1.1 Sign-in and consultation list | Sign in and see your list of consultations | Done, live 13 Oct |
| 1.2 Create consultation and audio | Create an invented consultation, record consent, attach or record two tracks | Done, live 13 Oct |
| 1.3 Transcription with a status screen | Press start, watch each stage, read a merged two-speaker transcript | Done, live 14 Oct |
| 1.4 Consultation room (moved up, decision 0005) | Start a video call, send the patient a link, both voices recorded; transcription starts when the call ends | Done, live 14 Oct |
| 1.5 AI fills the doctor's form (decision 0005) | Read the doctor's questionnaire filled in from the conversation, each answer with its quote; a suggested diagnosis; check and approve | Done, live 14 Oct |
| 1.5b Patient payment (decision 0007) | Set a fee; the patient pays on Stripe Checkout from their link, then joins; see "Paid" | Built 14 Oct; live once the Stripe test key is set |
| 1.6 Transcript review | Search, play back, correct, mark reviewed, export, delete audio | Folded into 1.5 where the form needs it |
| 1.7 Fixtures and benchmark | Read measured accuracy and speed per language | Started 14 Oct (first measurements below) |
| **Phase 2 — Structured draft, approval and report** | | Not started |
| 2.1 Draft generation | Generate a structured draft in which every item shows its evidence | Not started |
| 2.2 Draft review | Accept, edit, reject and add items in a split view | Not started |
| 2.3 Approval and versioned record | Approve in two steps; corrections create new versions | Not started |
| 2.4 Report and audio deletion | Generate and export the patient report; delete audio | Not started |
| 2.5 Evaluation and timing trial | Read the results for H2 and H3 | Not started |
| **Phase 3 — Consultation room** | Hold a call that records separate tracks after consent | Not started |
| **Gate R — Real-patient readiness** | Owner decisions, legal work and security hardening | Not started |
| **Phase 4 — MVP with about five practitioners** | | Not started |
| **Phase 5 — Minimum marketable product** | | Not started |

## Where things run

| Piece | Where | Plan |
|---|---|---|
| Web app | Render static site | Free |
| Sign-in, database, audio files | Supabase project `watson` (ref `mconctpleszerqhgaarj`), Frankfurt | Free |
| Transcription engine | The owner's computer | Free |

## Slice 1.3 — done 14 October

Live at https://watson-app.onrender.com, rebuilt on the design system
(https://claude.ai/artifact/VwTRNADCcZnGHPHYK6spht). The engine runs on the owner's
computer as a user service (`apps/clinical-worker/watson-engine.service`). Measured live:
two 7.5-second tracks, start to transcript on screen in 16 seconds with the `small` model.

Left over, picked up when the work needs them:

- [ ] Word-level uncertainty marks (the engine scores whole turns today).
- [ ] Hide the "recorded together" tick box once a track was recorded in the browser.
- [ ] Upload progress as a percentage (shown as "Uploading…" today).
- [ ] A two-hour transcript fits in one database call (review 4.11).
- [ ] A dialogue fixture generator; the speed and accuracy benchmark (slice 1.7).

## Slice 1.4 — done 14 October

A doctor starts a call from a consultation (`/room/?id=`), copies the link, the patient opens
it (`/join/?t=`) with no account. Browser to browser (WebRTC, public STUN, handshake over
Supabase Realtime). The doctor's browser records two voice tracks; "End call" uploads them,
declares them recorded together and starts transcription. Tested live with two browsers.

Left over:

- [ ] No relay (TURN): calls between some strict networks may not connect. Test laptop on
      Wi-Fi with a phone on mobile data; add a free relay if needed.
- [ ] A call that is cut off before "End call" loses its recording (kept in the browser).
- [ ] Design system: add the call room screens.
- [ ] Patient payment: owner to choose (options A, B, C in the conversation of 14 Oct;
      recommended A, Stripe Checkout in test mode, its own slice).

## Slice 1.5 — done 14 October

When a transcript is ready, the engine fills in the practitioner's form with a model on the
owner's laptop ([decision 0008](decision-log/0008-form-filling.md)). `/form/?id=` shows each
answer with its quote; the practitioner accepts, edits or rejects each one and approves.
Measured on invented consultations: English 18 of 21 fields, Slovak 21 of 21. Live: a recorded
call went on to a filled-in form in under two minutes after its transcript.

Left over:

- [ ] Templates are set by script (owner: Dr. Robin's form, kept outside the repository);
      a screen to set up one's own form.
- [ ] After correcting the transcript, fill the form in again from the corrected text.
- [ ] Measure the model on longer, messier conversations (slice 1.7).

## Patient payment — built 14 October

A fee per consultation; the patient's link exists from creation; Stripe Checkout through two
edge functions (`payment`, `stripe-webhook`). Left over:

- [ ] Set the Stripe test key and the webhook secret on the hosted project, then test a payment live.
- [ ] Refuse an unpaid link in the call handshake, not only on the page (before Gate R).
- [ ] Paying practitioners directly (Stripe Connect), refunds, invoices.

## First measurements (slice 1.7, started 14 October)

Invented calls spoken by text-to-speech, two tracks squeezed through the browser's 32 kbit/s
Opus, transcribed on the owner's laptop (`bench/transcribe_bench.py`):

| Speech model | English word errors | Slovak word errors | Time per minute of call (both tracks) |
|---|---|---|---|
| small | 3.1% | 55% | 11 s |
| large-v3-turbo | 2.9% | 26% | 30 s |

The engine now uses large-v3-turbo. Slovak at 26% is still poor; the synthetic Slovak voice is
part of that, so real Slovak calls must be measured before trusting the figure.
