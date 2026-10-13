"""Worker settings, validated from EHEAL_* environment variables."""

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator

HOST = "127.0.0.1"  # never 0.0.0.0, see MASTER_BUILD_SPEC.md section 10
AUDIO_FORMATS = frozenset({"wav", "mp3", "m4a", "mp4", "flac", "ogg", "webm"})


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
    cpu_threads: int = Field(default=0, ge=0)  # 0 lets the library decide

    # "cloud-demo" is a hosted demonstration for synthetic audio only. It listens on
    # all interfaces behind the host's TLS proxy, uses a fixed access token, and keeps
    # no audio or transcript after each request. See docs/decision-log/0002.
    deployment: Literal["local", "cloud-demo"] = "local"
    access_token: SecretStr | None = None
    public_host: str | None = None

    @model_validator(mode="after")
    def _cloud_demo_is_locked_down(self) -> Self:
        if self.deployment == "cloud-demo":
            if self.access_token is None or len(self.access_token.get_secret_value()) < 32:
                raise ValueError("cloud-demo requires EHEAL_ACCESS_TOKEN of 32+ characters")
            if not self.public_host:
                raise ValueError("cloud-demo requires EHEAL_PUBLIC_HOST")
        return self

    @property
    def bind_host(self) -> str:
        return "0.0.0.0" if self.deployment == "cloud-demo" else HOST  # noqa: S104

    @property
    def retain_files(self) -> bool:
        return self.deployment == "local"

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
    values = {k[len(prefix) :].lower(): v for k, v in env.items() if k.startswith(prefix)}
    if "RENDER_EXTERNAL_HOSTNAME" in env:  # set by the Render platform
        values.setdefault("public_host", env["RENDER_EXTERNAL_HOSTNAME"])
    return Settings.model_validate(values)
