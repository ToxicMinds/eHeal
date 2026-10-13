import io
import logging
import wave
from pathlib import Path
from uuid import uuid4

import av
import pytest
from conftest import FIXTURE, TOKEN, make_client
from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import SecretStr

from clinical_worker import transcribe as transcribe_module
from clinical_worker.app import create_app
from clinical_worker.config import Settings
from clinical_worker.schema import Transcript


def _post(client: TestClient, body: bytes, fmt: str = "wav", **params: str) -> tuple[str, Response]:
    appointment_id = str(uuid4())
    response = client.post(
        f"/appointments/{appointment_id}/transcriptions",
        params={"speaker": "patient", "format": fmt, **params},
        content=body,
    )
    return appointment_id, response


def _silence(seconds: int = 3) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes(b"\x00\x00" * 16000 * seconds)
    return buffer.getvalue()


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {
        "status": "ok",
        "deployment": "local",
        "model": "tiny",
    }


def test_transcribes_fixture_and_exports_json(
    client: TestClient, settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)  # every logger, including faster-whisper's
    appointment_id, response = _post(client, FIXTURE.read_bytes(), language="en")
    assert response.status_code == 200
    transcript = Transcript.model_validate(response.json())

    assert str(transcript.appointment_id) == appointment_id
    assert transcript.source_languages == ["en"]
    assert transcript.transcription_model.model == "tiny"
    assert transcript.segments
    text = " ".join(s.machine_text for s in transcript.segments).lower()
    assert "three weeks" in text
    previous_end = 0.0
    for segment in transcript.segments:
        assert segment.speaker == "patient"
        assert segment.review_status == "unreviewed"
        assert segment.reviewed_text is None
        assert previous_end <= segment.start_seconds < segment.end_seconds < 15
        previous_end = segment.start_seconds

    exported = settings.data_dir / appointment_id / "transcript" / "raw.json"
    assert Transcript.model_validate_json(exported.read_text()) == transcript

    # Privacy: lifecycle events are logged, transcript content never is.
    logged = caplog.text.lower()
    assert "transcription.completed" in logged
    assert appointment_id in logged
    for segment in transcript.segments:
        assert segment.machine_text.lower() not in logged
    for word in ("sleeping", "three weeks", "synthetic", "morning"):
        assert word not in logged


def test_silence_yields_empty_transcript_not_invented_text(client: TestClient) -> None:
    _, response = _post(client, _silence())
    assert response.status_code == 200
    assert response.json()["segments"] == []


@pytest.mark.parametrize(
    ("body", "fmt", "status", "category"),
    [
        (b"x", "exe", 422, "AUDIO_FORMAT_UNSUPPORTED"),
        (b"", "wav", 422, "AUDIO_FILE_MISSING"),
        (b"this is not audio" * 100, "wav", 422, "AUDIO_CORRUPT"),
    ],
)
def test_rejects_bad_audio_and_keeps_nothing(
    client: TestClient, settings: Settings, body: bytes, fmt: str, status: int, category: str
) -> None:
    _, response = _post(client, body, fmt)
    assert response.status_code == status
    payload = response.json()
    assert payload["error_category"] == category
    assert "Traceback" not in payload["message"]
    assert not [p for p in settings.data_dir.rglob("*") if p.is_file()]


def test_rejects_oversized_audio(settings: Settings) -> None:
    small = settings.model_copy(update={"max_bytes": 1000})
    with make_client(small) as client:
        _, response = _post(client, FIXTURE.read_bytes())
    assert response.status_code == 413
    assert response.json()["error_category"] == "AUDIO_TOO_LARGE"
    assert not [p for p in settings.data_dir.rglob("*") if p.is_file()]


def test_rejects_overlong_audio(settings: Settings) -> None:
    short = settings.model_copy(update={"max_duration_seconds": 1.0})
    with make_client(short) as client:
        _, response = _post(client, _silence(3))
    assert response.json()["error_category"] == "AUDIO_DURATION_INVALID"


def _files(root: Path, appointment_id: str) -> list[str]:
    base = root / appointment_id
    return sorted(str(p.relative_to(base)) for p in base.rglob("*") if p.is_file())


def test_missing_model_fails_explicitly_and_keeps_audio(settings: Settings) -> None:
    missing = settings.model_copy(update={"model": "not-installed"})
    with make_client(missing) as client:
        appointment_id, response = _post(client, FIXTURE.read_bytes())
    assert response.status_code == 503
    assert response.json()["error_category"] == "TRANSCRIPTION_MODEL_UNAVAILABLE"
    assert _files(settings.data_dir, appointment_id) == ["audio/patient.wav"]


def test_transcription_failure_keeps_audio_and_writes_no_transcript(
    client: TestClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def explode(*_: object) -> None:
        raise RuntimeError("secret clinical detail")

    monkeypatch.setattr(transcribe_module, "_load", explode)
    caplog.set_level(logging.DEBUG)
    appointment_id, response = _post(client, FIXTURE.read_bytes())
    assert response.status_code == 500
    assert response.json()["error_category"] == "TRANSCRIPTION_FAILED"
    assert "secret" not in response.text
    assert "secret" not in caplog.text  # exception messages are never logged
    assert "RuntimeError" in caplog.text
    assert _files(settings.data_dir, appointment_id) == ["audio/patient.wav"]


def test_requires_token(settings: Settings) -> None:
    with make_client(settings, authorised=False) as client:
        _, response = _post(client, FIXTURE.read_bytes())
    assert response.status_code == 401


@pytest.mark.parametrize(
    "headers", [{"Host": "evil.example:8765"}, {"Origin": "http://evil.example"}]
)
def test_rejects_foreign_host_and_browser_origin(
    client: TestClient, headers: dict[str, str]
) -> None:
    assert client.get("/health", headers=headers).status_code == 403


def test_same_origin_browser_request_is_allowed(client: TestClient) -> None:
    assert client.get("/health", headers={"Origin": "http://127.0.0.1:8765"}).status_code == 200


def test_serves_interface_with_strict_content_security_policy(client: TestClient) -> None:
    page = client.get("/")
    assert page.status_code == 200
    assert "Synthetic data only" in page.text
    assert "script-src 'self'" in page.headers["content-security-policy"]
    assert client.get("/app.js").status_code == 200
    assert client.get("/app.css").status_code == 200
    assert client.get("/../config.py").status_code in (403, 404)


def _unseekable_webm() -> bytes:
    """Re-encode the fixture the way a browser recorder does: Opus in WebM, no duration."""

    class Pipe(io.BytesIO):
        def seekable(self) -> bool:
            return False

    sink = Pipe()
    with av.open(str(FIXTURE)) as source, av.open(sink, "w", format="webm") as out:
        stream = out.add_stream("libopus", rate=48000)
        resampler = av.AudioResampler(format="s16", layout="mono", rate=48000, frame_size=960)
        for frame in source.decode(audio=0):
            for resampled in resampler.resample(frame):
                out.mux(stream.encode(resampled))
        out.mux(stream.encode(None))
    return sink.getvalue()


def test_transcribes_browser_style_recording(client: TestClient) -> None:
    _, response = _post(client, _unseekable_webm(), "webm", language="en")
    assert response.status_code == 200, response.text
    text = " ".join(s["machine_text"] for s in response.json()["segments"]).lower()
    assert "sleeping properly" in text


def test_cloud_demo_accepts_public_host_and_keeps_nothing(settings: Settings) -> None:
    cloud = Settings(
        home=settings.home,
        model="tiny",
        deployment="cloud-demo",
        access_token=SecretStr(TOKEN * 4),
        public_host="demo.example",
    )
    app = create_app(cloud, TOKEN * 4)
    with TestClient(app, base_url="https://demo.example") as client:
        assert client.get("/health").json()["deployment"] == "cloud-demo"
        assert client.get("/", headers={"Origin": "https://demo.example"}).status_code == 200
        assert client.get("/health", headers={"Origin": "https://evil.example"}).status_code == 403
        client.headers["Authorization"] = f"Bearer {TOKEN}"
        _, wrong = _post(client, FIXTURE.read_bytes())
        assert wrong.status_code == 401
        client.headers["Authorization"] = f"Bearer {TOKEN * 4}"
        _, response = _post(client, FIXTURE.read_bytes(), language="en")
    assert response.status_code == 200
    assert response.json()["segments"]
    assert not [p for p in cloud.data_dir.rglob("*") if p.is_file()]
