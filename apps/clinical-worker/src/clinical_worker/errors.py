"""Classified processing errors (MASTER_BUILD_SPEC.md section 17)."""

from enum import StrEnum


class ErrorCategory(StrEnum):
    AUDIO_FILE_MISSING = "AUDIO_FILE_MISSING"
    AUDIO_FORMAT_UNSUPPORTED = "AUDIO_FORMAT_UNSUPPORTED"
    AUDIO_CORRUPT = "AUDIO_CORRUPT"
    AUDIO_TOO_LARGE = "AUDIO_TOO_LARGE"
    AUDIO_DURATION_INVALID = "AUDIO_DURATION_INVALID"
    TRANSCRIPTION_MODEL_UNAVAILABLE = "TRANSCRIPTION_MODEL_UNAVAILABLE"
    TRANSCRIPTION_FAILED = "TRANSCRIPTION_FAILED"
    TRANSCRIPT_MERGE_FAILED = "TRANSCRIPT_MERGE_FAILED"
    STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE"
    FORM_MODEL_UNAVAILABLE = "FORM_MODEL_UNAVAILABLE"
    FORM_FAILED = "FORM_FAILED"


class WorkerError(Exception):
    """A failure the engine reports to the database, optionally about one speaker's track."""

    def __init__(self, category: ErrorCategory, speaker: str | None = None) -> None:
        super().__init__(category.value)
        self.category = category
        self.speaker = speaker


class Stopped(Exception):
    """The database said to stop: the job was cancelled, timed out or taken back."""
