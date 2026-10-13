"""Classified processing errors (MASTER_BUILD_SPEC.md section 38)."""

from enum import StrEnum


class ErrorCategory(StrEnum):
    AUDIO_FILE_MISSING = "AUDIO_FILE_MISSING"
    AUDIO_FORMAT_UNSUPPORTED = "AUDIO_FORMAT_UNSUPPORTED"
    AUDIO_CORRUPT = "AUDIO_CORRUPT"
    AUDIO_TOO_LARGE = "AUDIO_TOO_LARGE"
    AUDIO_DURATION_INVALID = "AUDIO_DURATION_INVALID"
    TRANSCRIPTION_MODEL_UNAVAILABLE = "TRANSCRIPTION_MODEL_UNAVAILABLE"
    TRANSCRIPTION_FAILED = "TRANSCRIPTION_FAILED"


# category -> (HTTP status, message safe to show a user)
_PUBLIC: dict[ErrorCategory, tuple[int, str]] = {
    ErrorCategory.AUDIO_FILE_MISSING: (422, "No audio was received."),
    ErrorCategory.AUDIO_FORMAT_UNSUPPORTED: (422, "This audio format is not supported."),
    ErrorCategory.AUDIO_CORRUPT: (422, "The audio file could not be read."),
    ErrorCategory.AUDIO_TOO_LARGE: (413, "The audio file is too large."),
    ErrorCategory.AUDIO_DURATION_INVALID: (422, "The audio is empty or too long."),
    ErrorCategory.TRANSCRIPTION_MODEL_UNAVAILABLE: (
        503,
        "The transcription model is not installed. Run the model fetch command.",
    ),
    ErrorCategory.TRANSCRIPTION_FAILED: (500, "Transcription failed. The audio was kept; retry."),
}


class WorkerError(Exception):
    def __init__(self, category: ErrorCategory) -> None:
        super().__init__(category.value)
        self.category = category
        self.status, self.public_message = _PUBLIC[category]
