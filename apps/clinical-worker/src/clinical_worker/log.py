"""Privacy-conscious logging (MASTER_BUILD_SPEC.md section 37).

Only allow-listed, non-clinical fields can be logged. Never pass transcript
text, filenames supplied by a user, or exception messages from decoders."""

import json
import logging

logger = logging.getLogger("clinical_worker")

ALLOWED_FIELDS = frozenset(
    {
        "request_id",
        "appointment_id",
        "speaker",
        "state",
        "duration_seconds",
        "audio_duration_seconds",
        "model",
        "device",
        "compute_type",
        "segment_count",
        "error_category",
        "exception_type",
    }
)


def log_event(event: str, **fields: str | int | float | None) -> None:
    unknown = fields.keys() - ALLOWED_FIELDS
    if unknown:
        raise ValueError(f"log fields not allow-listed: {sorted(unknown)}")
    logger.info(json.dumps({"event": event, **fields}))
