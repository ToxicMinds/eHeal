# Roadmap and status

The plan is defined in [MASTER_BUILD_SPEC.md](../MASTER_BUILD_SPEC.md), section 21.
This file only tracks where we are. Update it at the end of every slice.

Last updated: 13 October 2026.

| Slice | When it is done, you can | Status |
|---|---|---|
| **Phase 0 — Foundations** | | Done |
| **Phase 1 — Transcription in the browser** | | In progress |
| 1.1 Sign-in and consultation list | Sign in and see your list of consultations | In progress |
| 1.2 Create consultation and audio | Create an invented consultation, record consent, attach or record two tracks | Not started |
| 1.3 Transcription with a status screen | Press start, watch each stage, read a merged two-speaker transcript | Not started |
| 1.4 Transcript review | Search, play back, correct, mark reviewed, export | Not started |
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
