# test-fixtures

**Synthetic data only. Nothing here comes from a real person or consultation.**

| File | Language | Speaker | Voice | Script |
|---|---|---|---|---|
| `audio/en-patient-sleep.wav` | en | patient | Piper `en_US-lessac-medium` | "This is a synthetic test recording. I have not been sleeping properly for around three weeks. I usually wake up at four in the morning." |

Regenerate or add fixtures with `scripts/make-fixture.sh <voice> <output.wav> <text>`.

| File | What it is |
|---|---|
| `templates/ayurveda-intake.json` | A generic Ayurvedic intake form (21 fields), the shape practitioners' templates take. Not any real practitioner's form. |
| `consultations/ayurveda-en.json` | An invented first consultation in English (34 turns): acidity, poor sleep. Each field's expected answer, including fields never discussed. |
| `consultations/ayurveda-sk.json` | A shorter invented consultation in Slovak (15 turns): constipation, waking at night. |

`scripts/make-dialogue.py <consultation.json> <dir>` speaks a consultation into two tracks, one per
speaker, as a call records them. `apps/clinical-worker/bench/form_bench.py` scores a form model on a
consultation; `bench/transcribe_bench.py` measures a speech model's word error rate on the tracks.

## Limits as a transcription benchmark

The audio is text-to-speech: one clean studio voice, no accent variation, no
background noise, no hesitation, no overlapping speech. Speech recognition
scores on it will be better than on real consultations and must not be
quoted as accuracy figures. It proves the pipeline runs, not that it is accurate.
