import faster_whisper  # noqa: F401  (proves the transcription stack installs)
from fastapi.testclient import TestClient

from clinical_worker import HOST, app


def test_health() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_binds_to_localhost_only() -> None:
    assert HOST == "127.0.0.1"
