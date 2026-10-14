# 0005 — The product flow: from a video call to the doctor's filled-in form

Status: accepted 14 October 2026, by the owner. Where it differs from
MASTER_BUILD_SPEC.md version 2.2 (sections 2, 13, 15, 20.6 and 21), this record wins
until the specification is rewritten.

The owner described eHeal as one flow:

1. A doctor and a patient talk in eHeal by video.
2. The conversation is recorded.
3. The recording is transcribed.
4. An AI reads the transcript to understand what the patient wants solved, what the doctor
   is trying to understand, and the diagnosis, and fills in the doctor's questionnaire.

| # | Decision | Consequence |
|---|---|---|
| 1 | The consultation room (spec phase 3) comes next, before the structured draft (spec phase 2). | Slice order: 1.3 done; then the room; then the AI form; transcript review becomes part of checking the form. |
| 2 | A call records voices only: the doctor's microphone and the patient's incoming audio as two tracks on one clock. | The existing two-track transcription is reused, with exact ordering and overlap detection. Small files, so the free storage lasts. |
| 3 | The patient joins with a one-time link and no account. | How the patient pays is open: the owner wants it thought through before deciding. |
| 4 | In test mode every call is recorded; consent is recorded automatically when a call starts. | Before real patients (Gate R), the patient agrees on screen before recording begins. |
| 5 | The AI fills in a questionnaire template. The first template is the owner's example doctor's Ayurvedic assessment form (kept outside the public repository). Templates are per doctor. | The draft's layout comes from the template, not from a fixed schema. |
| 6 | The AI may suggest a diagnosis. It is labelled as a suggestion, shows its evidence, and is never accepted on the doctor's behalf. | This replaces the specification's ban on drafted diagnoses (section 20.6) for test mode. Software that suggests diagnoses is a regulated medical device in the EU: certification is a Gate R item before any real patient. |
| 7 | Everything stays free: the call is browser to browser (WebRTC), connected through the existing Supabase project; the AI is a model that runs on the owner's computer, like the transcription engine. | No conversation reaches a third-party AI service. Analysis of a long consultation takes minutes on a computer without a graphics card. |
