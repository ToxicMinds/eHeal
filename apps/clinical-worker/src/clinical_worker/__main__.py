"""`clinical-worker engine` runs the engine.

`fetch-model` and `export-schema` are setup commands."""

import json
import logging
import os
import sys
from pathlib import Path

from .config import Settings, load_settings
from .schema import SCHEMA_VERSION, Transcript

SCHEMA_DIR = Path(__file__).resolve().parents[4] / "packages" / "schemas"


def schema_json() -> str:
    return json.dumps(Transcript.model_json_schema(), indent=2) + "\n"


def _fetch_model(settings: Settings) -> None:
    # The only network access the engine makes outside Supabase, and only when run explicitly.
    from faster_whisper import download_model
    from faster_whisper.utils import _MODELS
    from huggingface_hub import HfApi

    download_model(settings.model, output_dir=str(settings.model_path))
    repository = _MODELS.get(settings.model, settings.model)
    revision = HfApi().model_info(repository).sha
    (settings.model_path / "revision.txt").write_text(f"{repository}@{revision}\n")
    print(f"model ready: {settings.model_path} ({repository}@{revision})")


def _run_engine(settings: Settings) -> None:
    from .engine import Engine

    os.environ.setdefault("HF_HUB_OFFLINE", "1")  # models come from disk only
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    for noisy in ("httpx", "httpcore", "hpack"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if not (
        settings.engine_email
        and settings.engine_password.get_secret_value()
        and settings.supabase_publishable_key
    ):
        sys.exit(
            "EHEAL_ENGINE_EMAIL, EHEAL_ENGINE_PASSWORD and EHEAL_SUPABASE_PUBLISHABLE_KEY must be set."
        )
    Engine(settings).run_forever()


def main() -> None:
    settings = load_settings()
    command = sys.argv[1] if len(sys.argv) > 1 else "engine"
    if command == "engine":
        _run_engine(settings)
    elif command == "fetch-model":
        _fetch_model(settings)
    elif command == "export-schema":
        SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
        for old in SCHEMA_DIR.glob("transcript-*.schema.json"):
            old.unlink()
        (SCHEMA_DIR / f"transcript-{SCHEMA_VERSION}.schema.json").write_text(schema_json())
    else:
        sys.exit("usage: clinical-worker [engine|fetch-model|export-schema]")


if __name__ == "__main__":
    main()
