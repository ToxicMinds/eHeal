"""Engine settings, validated from WATSON_* environment variables and an optional file."""

import os
from collections.abc import Mapping
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, SecretStr

AUDIO_FORMATS = frozenset({"wav", "mp3", "m4a", "mp4", "flac", "ogg", "webm"})
DETECTABLE_LANGUAGES = ("en", "de", "sk")  # "mixed or unsure" chooses among these only
DEFAULT_ENV_FILE = Path.home() / ".config" / "watson" / "engine.env"


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    # Outside the repository and outside cloud-synced folders.
    home: Path = Path.home() / ".local" / "share" / "watson"
    model: str = "large-v3-turbo"  # measured 14 Oct: Slovak 26% word errors, small 55%
    device: str = "cpu"
    compute_type: str = "int8"
    cpu_threads: int = Field(default=0, ge=0)  # 0 lets the library decide

    # The engine signs in as its own account (section 11). The key is the public one.
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_publishable_key: str = ""
    engine_email: str = ""
    engine_password: SecretStr = SecretStr("")

    poll_seconds: float = Field(default=10, gt=0)  # idle engines ask this often (section 12.7)
    heartbeat_seconds: float = Field(default=20, gt=0)  # must stay under 30
    low_confidence_threshold: float = Field(default=0.5, ge=0, le=1)
    no_speech_threshold: float = Field(default=0.6, ge=0, le=1)
    overlap_tolerance_seconds: float = Field(default=0.25, ge=0)
    max_bytes: int = Field(default=50 * 1024 * 1024, gt=0)
    max_duration_seconds: float = Field(default=2 * 60 * 60, gt=0)

    # Words the speech model would otherwise mishear: Ayurvedic terms, given to it as hints.
    # Measured 16 Oct on the invented English consultation: see docs/roadmap.md.
    vocabulary: str = (
        "Ayurveda, dosha, vata, pitta, kapha, agni, ama, prakriti, vikriti, abhyanga, "
        "shirodhara, panchakarma, nasya, basti, virechana, swedana, udvartana, pranayama, "
        "sheetali, nadi shodhana, churna, avipattikar, triphala, ashwagandha, brahmi, "
        "shatavari, guduchi, tulsi, chyawanprash, ghee, kitchari, dinacharya, amla pitta"
    )

    # The model that fills in forms (decision 0005): a GGUF file, fetched once with
    # `clinical-worker fetch-form-model`, run on this computer by llama.cpp.
    form_model_repository: str = "unsloth/Qwen3.5-4B-GGUF"
    form_model_file: str = "Qwen3.5-4B-Q4_K_M.gguf"
    form_context_tokens: int = Field(default=16384, ge=2048)

    @property
    def model_path(self) -> Path:
        return self.home / "models" / f"faster-whisper-{self.model}"

    @property
    def form_model_path(self) -> Path:
        return self.home / "models" / "llm" / self.form_model_file

    @property
    def ocr_model_dir(self) -> Path:
        return self.home / "models" / "ocr"

    @property
    def work_dir(self) -> Path:
        return self.home / "work"


def read_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    pairs = (line.split("=", 1) for line in path.read_text().splitlines() if "=" in line)
    return {key.strip(): value.strip() for key, value in pairs if not key.lstrip().startswith("#")}


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    """The environment wins over the file named by WATSON_ENV_FILE.

    That file defaults to ~/.config/watson/engine.env."""
    environment = dict(os.environ if env is None else env)
    file = Path(environment.get("WATSON_ENV_FILE", DEFAULT_ENV_FILE))
    merged = {**read_env_file(file), **environment}
    prefix = "WATSON_"
    return Settings.model_validate(
        {
            k[len(prefix) :].lower(): v
            for k, v in merged.items()
            if k.startswith(prefix) and k != "WATSON_ENV_FILE"
        }
    )
