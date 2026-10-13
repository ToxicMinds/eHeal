# 0002 — Hosted demo deployment

Status: accepted 2026-10-13 at the product owner's explicit request.

## Context

The owner asked for Slice 1 to be reachable from a browser on the internet so it
can be tried without a local install. MASTER_BUILD_SPEC.md says the opposite for
Phase 1: local-only execution, worker bound to 127.0.0.1, no cloud persistence,
no public deployment (sections 3.3, 4.1, 10, 29.4, 45).

## Decision

Add a second, explicit mode, `EHEAL_DEPLOYMENT=cloud-demo`, used only by the
container image. The default mode is unchanged and still binds to 127.0.0.1.

In `cloud-demo` the worker:

- refuses to start without a 32+ character access token and a public hostname;
- accepts requests only for that hostname and from that origin;
- deletes the uploaded audio and the transcript from disk as soon as it replies;
- has the Whisper model baked into the image and makes no outbound calls;
- shows a "synthetic data only" banner on every page.

No database is added. Slice 1 has nothing to persist, and the spec's database is
local SQLite with PostgreSQL deferred to the MVP.

The interface is plain HTML and JavaScript served by the worker, not the Next.js
or Tauri apps the spec names for later slices.

## Alternatives considered

- Stay local-only and demonstrate over a screen share: rejected by the owner.
- Add Supabase or Firebase now: nothing to store yet, and it would put transcripts
  in a third-party database before the consent, vault and audit slices exist.

## Consequences

- Audio sent to the demo leaves the user's machine and is processed on a hosting
  provider's servers. That is acceptable only for synthetic audio. **The hosted
  demo must never receive a real consultation.**
- The demo proves the pipeline in a browser. It does not test the product's core
  claim, which is that processing stays on the practitioner's workstation.
- The access token is a single shared secret, not user authentication.
- Microphone recordings made in the browser are real voices. They are in scope
  only when the speaker is reading invented content.

## Reversal path

Delete the hosting service and the `Dockerfile`. The `cloud-demo` branch in
`config.py` can stay unused or be removed; the local mode does not depend on it.
