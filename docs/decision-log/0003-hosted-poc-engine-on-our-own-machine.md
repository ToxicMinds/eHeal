# 0003 — Hosted proof of concept, engine on a machine we control

Status: accepted 13 October 2026. Supersedes 0002 and items 1, 5, 6 and 8 of 0001.

## Context

The owner wants a real web app on the internet: sign-in, a consultation list, audio
upload, transcription with a status screen, and transcript review, with the data in
Supabase. Version 1 of the specification forbade all of that in its first phase.
The owner also set the project rule that nothing may be charged until there is a
paying customer.

Transcription needs real computing power. Free hosting that is strong enough was
checked on 13 October 2026:

| Option | Finding | Outcome |
|---|---|---|
| Render free web service | A tenth of a CPU and 512 MB. A 13-second recording took 165 seconds and returned nonsense with the only model that fits. | Rejected |
| Hugging Face Docker or Gradio Space | Creating one now requires the PRO plan ($9 a month). Confirmed in their documentation and forum. | Rejected: not free |
| Hugging Face ZeroGPU | Free for personal accounts with a verified email that are older than 30 days: two apps, five GPU-minutes a day. Gradio and PyTorch only. | Deferred: a candidate for an always-on engine (OD-2) |
| A hosted speech service's free tier (for example Groq) | A free tier exists, with a 25 MB file limit. A third party would receive the audio. Data terms not checked. | Deferred: conflicts with the rule against third-party AI services |
| Transcription inside the browser | Free and private. Speed and accuracy on ordinary laptops are unproven. | Not evaluated |
| The owner's computer | 8 cores, 15 GB of memory, no GPU. Free, and cannot be withdrawn. | Chosen |

## Decision

1. The proof of concept runs hosted, in synthetic mode: a static web app on Render,
   and sign-in, database and audio storage in Supabase, all on free plans.
2. Transcription is done by an engine that pulls jobs from the database and listens
   on no port. It can run on any machine we control. Today it runs on the owner's
   computer.
3. No third-party AI service receives audio or transcripts.
4. The engine's own web interface and the single-page hosted demo from decision 0002
   are removed.

## Consequences

- Jobs are processed only while the engine's machine is on. The status screen says
  so when no engine is running.
- Uploaded audio and transcripts are stored in Supabase. That is acceptable only for
  invented data.
- Another engine can be added later without changing the web app or the database.
- The engine signs in as its own account, limited to the job functions and the audio
  of the job it has claimed. The project's secret key, which can do everything, is
  not given to the engine (changed after review; see the specification, section 11).

## Reversal path

Point a different engine at the same job queue, or move the database: Supabase is
open source and the schema is plain PostgreSQL in versioned migrations.
