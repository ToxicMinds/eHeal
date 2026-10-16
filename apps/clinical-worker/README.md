# clinical-worker

Watson's engine: transcripts, document reading and form filling. Development POC, invented data only.
See the [root README](../../README.md) and [decision 0009](../../docs/decision-log/0009-cloud-engine-and-whatsapp-gateway.md).

    uv sync
    uv run clinical-worker engine            # work forever, asking for jobs every 10 s (a laptop)
    uv run clinical-worker drain             # work until nothing comes for 150 s, then stop (the cloud)
    uv run clinical-worker fetch-model       # the speech model; also fetch-form-model, fetch-ocr-model
    uv run clinical-worker export-schema     # regenerate packages/schemas after a schema change
    uv run pytest

In use it runs on Modal (`modal_engine.py`): the database wakes it when work is queued. Set it up
with `scripts/configure-cloud-engine.sh`. Settings come from `WATSON_*` variables (`config.py`).
