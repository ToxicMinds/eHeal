"""Worker settings, validated from EHEAL_* environment variables."""

import os
from collections.abc import Mapping
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

HOST = "127.0.0.1"  # never 0.0.0.0, see MASTER_BUILD_SPEC.md section 10
AUDIO_FORMATS = frozenset({"wav", "mp3", "m4a", "flac", "ogg"})


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    # Default is outside the repo and outside common cloud-synced folders.
    home: Path = Path.home() / ".local" / "share" / "eheal"
    model: str = "small"
    device: str = "cpu"
    compute_type: str = "int8"
    port: int = Field(default=8765, ge=1024, le=65535)
    max_bytes: int = Field(default=200 * 1024 * 1024, gt=0)
    max_duration_seconds: float = Field(default=2 * 60 * 60, gt=0)
    # Segments Whisper itself thinks are probably not speech get confidence null.
    no_speech_threshold: float = Field(default=0.6, ge=0, le=1)

    @property
    def model_path(self) -> Path:
        return self.home / "models" / f"faster-whisper-{self.model}"

    @property
    def data_dir(self) -> Path:
        return self.home / "data"

    @property
    def token_path(self) -> Path:
        return self.home / "worker.token"


def load_settings(env: Mapping[str, str] = os.environ) -> Settings:
    prefix = "EHEAL_"
    return Settings.model_validate(
        {k[len(prefix) :].lower(): v for k, v in env.items() if k.startswith(prefix)}
    )
