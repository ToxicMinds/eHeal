# test-fixtures

**Synthetic data only. Nothing here comes from a real person or consultation.**

| File | Language | Speaker | Voice | Script |
|---|---|---|---|---|
| `audio/en-patient-sleep.wav` | en | patient | Piper `en_US-lessac-medium` | "This is a synthetic test recording. I have not been sleeping properly for around three weeks. I usually wake up at four in the morning." |

Regenerate or add fixtures with `scripts/make-fixture.sh <voice> <output.wav> <text>`.

## Limits as a transcription benchmark

The audio is text-to-speech: one clean studio voice, no accent variation, no
background noise, no hesitation, no overlapping speech. Speech recognition
scores on it will be better than on real consultations and must not be
quoted as accuracy figures. It proves the pipeline runs, not that it is accurate.
