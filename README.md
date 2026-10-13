# eHeal

Local-first teleconsultation documentation platform.

**Development POC. Synthetic data only. Not for use with real patients.**
Data is stored unencrypted until the vault slice lands.

The authoritative specification is [MASTER_BUILD_SPEC.md](MASTER_BUILD_SPEC.md).
Assumptions made where it is silent are in [docs/decision-log](docs/decision-log/).

## Status

Phase 1, Slice 1: one audio file in, one speaker-labelled transcript out, all local.

## Prerequisites

- Node >= 22 and pnpm 11
- [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for the worker)
- About 600 MB of disk for the Whisper models

## Setup

    pnpm install
    cd apps/clinical-worker
    uv sync
    uv run clinical-worker fetch-model                    # default model: small (~460 MB)
    EHEAL_MODEL=tiny uv run clinical-worker fetch-model   # used by the tests (~75 MB)

`fetch-model` is the only step that uses the network.

## Check everything

    pnpm check        # tests, lint, format check, type checking

## Run the worker

    cd apps/clinical-worker
    uv run clinical-worker

It listens on `127.0.0.1:8765` only and writes a per-run token to
`~/.local/share/eheal/worker.token`.

    TOKEN=$(cat ~/.local/share/eheal/worker.token)
    ID=$(python3 -c "import uuid; print(uuid.uuid4())")
    curl -X POST "http://127.0.0.1:8765/appointments/$ID/transcriptions?speaker=patient&format=wav&language=en" \
      -H "Authorization: Bearer $TOKEN" \
      --data-binary @../../packages/test-fixtures/audio/en-patient-sleep.wav

The transcript is returned and also written to
`~/.local/share/eheal/data/<appointment id>/transcript/raw.json`.
Omit `language` to auto-detect. `speaker` is `patient` or `practitioner`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `EHEAL_HOME` | `~/.local/share/eheal` | Models, data and token. Keep it out of cloud-synced folders. |
| `EHEAL_MODEL` | `small` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v3`). |
| `EHEAL_DEVICE` | `cpu` | `cpu` or `cuda`. |
| `EHEAL_COMPUTE_TYPE` | `int8` | CTranslate2 compute type. |
| `EHEAL_PORT` | `8765` | Port on 127.0.0.1. The host is not configurable. |
| `EHEAL_MAX_BYTES` | 200 MB | Upload size limit. |
| `EHEAL_MAX_DURATION_SECONDS` | 7200 | Audio length limit. |

## Failure behaviour

Errors return `{"error_category", "message"}` with no stack trace. Rejected
uploads are deleted. If transcription itself fails, the audio is kept for a
retry and no transcript is written.

## Known limitations

- Storage is plaintext; the encrypted vault is Slice 5.
- Requests are synchronous: no job status, cancellation or duplicate-request protection yet.
- Confidence is an uncalibrated heuristic from Whisper's log-probability.
- One text-to-speech fixture; it says nothing about real-world accuracy.
- The `small` model is weak for Slovak; use `large-v3` when those fixtures arrive.
- No audit log yet.

## Layout

    apps/clinical-worker     Python FastAPI worker, localhost only
    packages/schemas         JSON Schema generated from the worker's Pydantic models
    packages/test-fixtures   Synthetic audio only
    scripts/make-fixture.sh  Generates synthetic speech with Piper
    docs/decision-log        Assumptions and decisions
