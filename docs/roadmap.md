# Roadmap and status

The plan is defined in [MASTER_BUILD_SPEC.md](../MASTER_BUILD_SPEC.md), section 21.
This file only tracks where we are. Update it at the end of every slice.

Last updated: 14 October 2026.

| Slice | When it is done, you can | Status |
|---|---|---|
| **Phase 0 — Foundations** | | Done |
| **Phase 1 — Transcription through the web app** | | In progress |
| 1.1 Sign-in and consultation list | Sign in and see your list of consultations | Done, live 13 Oct |
| 1.2 Create consultation and audio | Create an invented consultation, record consent, attach or record two tracks | Done, live 13 Oct |
| 1.3 Transcription with a status screen | Press start, watch each stage, read a merged two-speaker transcript | In progress |
| 1.4 Transcript review | Search, play back, correct, mark reviewed, export, delete audio | Not started |
| 1.5 Fixtures and benchmark | Read measured accuracy and speed per language | Not started |
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
| Sign-in, database, audio files | Supabase project `eheal`, Frankfurt | Free |
| Transcription engine | The owner's computer | Free |

## Slice 1.3 — checklist

Done (on branch `phase-1/web-app`, not yet live):

- [x] Database: jobs, engine accounts, transcripts, segments; start, cancel and withdraw-consent
      functions; engine claim, heartbeat, complete and fail functions; tightened audio rules.
- [x] Engine rewritten to pull jobs as its own limited account: hash check, per-track
      transcription in the consultation's language, merge, guards against invented text.
- [x] Old engine web service, hosted demo code and Dockerfile removed.
- [x] Engine unit tests (merge order, overlap, offsets, transcript format, settings, logging).

To do:

- [ ] Engine integration tests against the local stack: a full job; corrupt, silent and
      room-noise audio; a file changed after registration; withdrawal during processing;
      a stalled job taken back; a late result refused; two engines; no transcript text in logs.
- [ ] A dialogue fixture generator: both tracks rendered on one timeline from a script.
- [ ] Web: start, status panel with stages, cancel while queued, retry after failure,
      withdraw consent, "no engine running" notice, read-only two-voice transcript.
- [ ] Web tests: access rules for the new tables and functions (including the engine
      account), and a browser test that runs a real local engine end to end.
- [ ] Quick benchmark on this computer (small, medium, large-v3-turbo) to choose the default model.
- [ ] Hosted: apply the migration, create the engine account, install the engine as a service
      on the owner's computer that starts at login.
- [ ] Publish the web app, run the browser tests against the live site, merge to main.
- [ ] Apply the second review of the specification (version 2.1) when it arrives.
