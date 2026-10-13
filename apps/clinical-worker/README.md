# clinical-worker

Local Python worker. Development POC, synthetic data only. See the [root README](../../README.md).

    uv sync
    uv run clinical-worker                 # serve on 127.0.0.1:8765
    uv run clinical-worker fetch-model     # download the configured Whisper model
    uv run clinical-worker export-schema   # regenerate packages/schemas after a schema change
    uv run pytest
