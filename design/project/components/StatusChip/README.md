# StatusChip

Where a consultation stands, in the practitioner's words, with an icon so it reads without colour.

| Status | Tone | Icon |
| --- | --- | --- |
| Waiting for consent | neutral | clock |
| Waiting for audio, Ready to transcribe | `current` | arrow |
| Transcribing | `current` | spinner |
| Transcript ready to review, Review in progress | `attention` | eye |
| Transcription failed, Consent withdrawn | `failed` | cross in a circle |
| Transcript reviewed | `done` | check |

- One chip per consultation, in the list row. The consultation page shows the same state through the Journey instead.
- Never green: green is the patient's voice.

The consumer provides: the label and tone for the consultation's status (the app's `summarise()` in `lib/status.ts`).
