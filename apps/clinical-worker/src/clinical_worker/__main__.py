"""`clinical-worker` runs the API; `clinical-worker fetch-model` and
`clinical-worker export-schema` are the two setup commands."""

import json
import logging
import os
import secrets
import sys
from pathlib import Path

import uvicorn

from .config import Settings, load_settings
from .schema import SCHEMA_VERSION, Transcript

SCHEMA_DIR = Path(__file__).resolve().parents[4] / "packages" / "schemas"


def schema_json() -> str:
    return json.dumps(Transcript.model_json_schema(), indent=2) + "\n"


def _fetch_model(settings: Settings) -> None:
    from faster_whisper import download_model

    # The only network call in the worker, and only when run explicitly.
    download_model(settings.model, output_dir=str(settings.model_path))
    print(f"model ready: {settings.model_path}")


def _serve(settings: Settings) -> None:
    from .app import create_app

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    settings.home.mkdir(mode=0o700, parents=True, exist_ok=True)
    if settings.access_token is not None:
        token = settings.access_token.get_secret_value()
    else:
        token = secrets.token_urlsafe(32)
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
        with os.fdopen(os.open(settings.token_path, flags, 0o600), "w") as out:
            out.write(token)
    uvicorn.run(
        create_app(settings, token), host=settings.bind_host, port=settings.port, access_log=False
    )


def main() -> None:
    settings = load_settings()
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command == "serve":
        _serve(settings)
    elif command == "fetch-model":
        _fetch_model(settings)
    elif command == "export-schema":
        SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
        (SCHEMA_DIR / f"transcript-{SCHEMA_VERSION}.schema.json").write_text(schema_json())
    else:
        sys.exit("usage: clinical-worker [serve|fetch-model|export-schema]")


if __name__ == "__main__":
    main()
