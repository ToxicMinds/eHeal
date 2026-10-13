from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from clinical_worker.__main__ import SCHEMA_DIR, schema_json
from clinical_worker.config import HOST, Settings, load_settings
from clinical_worker.log import log_event
from clinical_worker.schema import SCHEMA_VERSION, Segment, Transcript, TranscriptionModel
from clinical_worker.storage import Storage


def _segment(**overrides: object) -> dict[str, object]:
    return {
        "segment_id": str(uuid4()),
        "speaker": "patient",
        "start_seconds": 2.5,
        "end_seconds": 7.8,
        "machine_text": "Example transcript text.",
        **overrides,
    }


def test_segment_defaults_match_spec() -> None:
    segment = Segment.model_validate(_segment())
    assert segment.reviewed_text is None
    assert segment.confidence is None
    assert segment.review_status == "unreviewed"
    assert segment.overlap is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"end_seconds": 1.0},  # ends before it starts
        {"start_seconds": -1.0},
        {"speaker": "doctor"},
        {"confidence": 1.5},
        {"diagnosis": "anything"},  # unknown fields are rejected, not silently kept
    ],
)
def test_segment_rejects_invalid(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Segment.model_validate(_segment(**overrides))


def test_committed_json_schema_is_current() -> None:
    committed = (SCHEMA_DIR / f"transcript-{SCHEMA_VERSION}.schema.json").read_text()
    assert committed == schema_json(), "run: uv run clinical-worker export-schema"


def test_settings_from_environment() -> None:
    settings = load_settings({"EHEAL_MODEL": "medium", "EHEAL_DEVICE": "cuda", "OTHER": "x"})
    assert (settings.model, settings.device, settings.compute_type) == ("medium", "cuda", "int8")
    assert settings.model_path.name == "faster-whisper-medium"


def test_settings_reject_bad_environment() -> None:
    with pytest.raises(ValidationError):
        load_settings({"EHEAL_PORT": "80"})
    with pytest.raises(ValidationError):
        load_settings({"EHEAL_HOST": "0.0.0.0"})  # noqa: S104  host is not configurable


def test_host_is_localhost() -> None:
    assert HOST == "127.0.0.1"


def test_log_event_rejects_fields_outside_allow_list() -> None:
    with pytest.raises(ValueError, match="machine_text"):
        log_event("x", machine_text="anything")


def test_storage_writes_private_files_under_uuid_paths(tmp_path: Path) -> None:
    appointment_id = uuid4()
    transcript = Transcript(
        appointment_id=appointment_id,
        source_languages=["en"],
        created_at_utc=datetime.now(UTC),
        transcription_model=TranscriptionModel(model="tiny", device="cpu", compute_type="int8"),
        segments=[Segment.model_validate(_segment())],
    )
    path = Storage(tmp_path).write_transcript(transcript)
    assert path == tmp_path / str(appointment_id) / "transcript" / "raw.json"
    assert path.stat().st_mode & 0o777 == 0o600
    assert path.parent.stat().st_mode & 0o777 == 0o700
    assert Transcript.model_validate_json(path.read_text()) == transcript
    assert not list(path.parent.glob("*.partial"))


def test_local_mode_binds_localhost_and_retains_files() -> None:
    settings = Settings()
    assert settings.bind_host == "127.0.0.1"
    assert settings.retain_files


@pytest.mark.parametrize(
    "env",
    [
        {},  # no token, no host
        {"EHEAL_ACCESS_TOKEN": "short", "EHEAL_PUBLIC_HOST": "demo.example"},
        {"EHEAL_ACCESS_TOKEN": "x" * 32},  # no host
    ],
)
def test_cloud_demo_refuses_to_start_without_token_and_host(env: dict[str, str]) -> None:
    with pytest.raises(ValidationError):
        load_settings({"EHEAL_DEPLOYMENT": "cloud-demo", **env})


def test_cloud_demo_settings() -> None:
    settings = load_settings(
        {
            "EHEAL_DEPLOYMENT": "cloud-demo",
            "EHEAL_ACCESS_TOKEN": "x" * 32,
            "RENDER_EXTERNAL_HOSTNAME": "demo.onrender.com",
        }
    )
    assert settings.public_host == "demo.onrender.com"
    assert not settings.retain_files
    assert "x" * 32 not in repr(settings)  # the token never appears in logs or tracebacks
