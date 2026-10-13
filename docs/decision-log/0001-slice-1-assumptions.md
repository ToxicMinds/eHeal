# 0001 — Slice 1 assumptions

Status: accepted 2026-10-13. Items 1, 5, 6 and 8 are superseded by decision 0003, and item 9 by the limits in the specification, section 11 (50 MB, seven formats). The rest stand. Each item is the smallest reversible choice where
MASTER_BUILD_SPEC.md was silent or contradictory.

| # | Context | Decision | Alternative considered | Consequence | Reversal path |
|---|---|---|---|---|---|
| 1 | Spec requires encrypted storage but schedules the vault for Slice 5. | Slices 1–4 store synthetic data in plaintext, all through `storage.py`. | Build the vault first. | No real data may be used before Slice 5. | Replace the internals of `storage.py`. |
| 2 | Zod, Pydantic and JSON Schema are all named with no source of truth. | Pydantic is the source; JSON Schema is generated into `packages/schemas` and a test fails if it is stale. | Hand-maintain both. | TypeScript types will be generated from the JSON Schema when a TypeScript consumer exists. | Regenerate from a different source. |
| 3 | No method given for synthetic audio. | Piper text-to-speech via `scripts/make-fixture.sh`. | Human-recorded scripts. | Fixtures are weak accuracy benchmarks (see `packages/test-fixtures/README.md`). | Add recorded fixtures alongside. |
| 4 | faster-whisper downloads models on first use. | Models are fetched only by the explicit `fetch-model` command and loaded from a local directory. | Let the library download lazily. | The worker makes no network calls while serving. | None needed. |
| 5 | Multipart uploads are spooled to the system temp directory by the web framework. | Audio is sent as the raw request body and streamed to its final path. | Multipart form upload. | Clients send `--data-binary`; format is a query parameter. | Add a multipart route later. |
| 6 | Spec asks for a per-session token over an "OS-scoped channel" but Slice 1 has no desktop app. | Token is generated at startup and written to `worker.token` with mode 0600; Host must be localhost and any `Origin` header is refused. | No auth until the desktop app exists. | Any process running as the same user can read the token. | Hand the token to the desktop app directly in Slice 3. |
| 7 | Confidence derivation left to the implementer. | `exp(avg_logprob)`, null when Whisper's no-speech probability exceeds 0.6. | Word-level probabilities. | Uncalibrated; no low-confidence threshold yet (Slice 4). | Change one expression in `transcribe.py`. |
| 8 | Job states (queued, processing, …) are specified but Slice 1 has no status interface. | The transcription request is synchronous. | Build the job queue now. | Long audio holds the request open; no cancellation or duplicate-request handling. | Slice 3 wraps the same function in a job. |
| 9 | Limits were unspecified. | wav, mp3, m4a, flac, ogg; 200 MB; 2 hours. All configurable. | — | — | Change `EHEAL_MAX_*`. |
| 10 | faster-whisper 1.2.1 breaks with PyAV 19. | PyAV pinned below 19. | — | Revisit when faster-whisper updates. | Remove the pin. |
