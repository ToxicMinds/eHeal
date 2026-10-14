"""Privacy-conscious logging (MASTER_BUILD_SPEC.md section 18).

Only allow-listed, non-clinical fields can be logged. Never pass transcript text,
file names, or exception messages from decoders or the database."""

import json
import logging

logger = logging.getLogger("clinical_worker")

ALLOWED_FIELDS = frozenset(
    {
        "consultation_id",
        "job_id",
        "attempt",
        "speaker",
        "stage",
        "state",
        "duration_seconds",
        "audio_duration_seconds",
        "model",
        "device",
        "compute_type",
        "segment_count",
        "answered_field_count",
        "prompt_tokens",
        "completion_tokens",
        "error_category",
        "exception_type",
        "document_id",
        "pages",
    }
)


def log_event(event: str, **fields: str | int | float | None) -> None:
    unknown = fields.keys() - ALLOWED_FIELDS
    if unknown:
        raise ValueError(f"log fields not allow-listed: {sorted(unknown)}")
    logger.info(json.dumps({"event": event, **fields}))
