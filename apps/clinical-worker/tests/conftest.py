from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from clinical_worker.app import create_app
from clinical_worker.config import Settings

TOKEN = "test-token"  # noqa: S105
FIXTURE = Path(__file__).resolve().parents[3] / "packages/test-fixtures/audio/en-patient-sleep.wav"
REAL_MODELS = Settings().home / "models"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    # Isolated data directory, shared read-only models. Tests use the tiny model for speed.
    assert (REAL_MODELS / "faster-whisper-tiny").is_dir(), (
        "run: EHEAL_MODEL=tiny uv run clinical-worker fetch-model"
    )
    (tmp_path / "models").symlink_to(REAL_MODELS)
    return Settings(home=tmp_path, model="tiny")


def make_client(settings: Settings, *, authorised: bool = True) -> TestClient:
    headers = {"Authorization": f"Bearer {TOKEN}"} if authorised else {}
    return TestClient(
        create_app(settings, TOKEN),
        base_url=f"http://127.0.0.1:{settings.port}",
        headers=headers,
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with make_client(settings) as c:
        yield c
