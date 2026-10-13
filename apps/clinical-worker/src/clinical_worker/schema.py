"""Versioned transcript schema. This Pydantic model is the source of truth;
packages/schemas/transcript-*.schema.json is generated from it."""

from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = "1.0.0"

Speaker = Literal["practitioner", "patient"]
ReviewStatus = Literal["unreviewed", "under_review", "reviewed", "superseded"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TranscriptionModel(_Strict):
    provider: Literal["faster-whisper"] = "faster-whisper"
    model: str
    device: str
    compute_type: str


class Segment(_Strict):
    segment_id: UUID
    speaker: Speaker
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(ge=0)
    machine_text: str
    reviewed_text: str | None = None
    # exp(avg_logprob) from Whisper: an uncalibrated heuristic, null when not derivable.
    confidence: float | None = Field(default=None, ge=0, le=1)
    review_status: ReviewStatus = "unreviewed"
    overlap: bool = False

    @model_validator(mode="after")
    def _end_after_start(self) -> "Segment":
        if self.end_seconds < self.start_seconds:
            raise ValueError("end_seconds must not be before start_seconds")
        return self


class Transcript(_Strict):
    schema_version: Literal["1.0.0"] = "1.0.0"
    appointment_id: UUID
    source_languages: list[str]
    created_at_utc: AwareDatetime
    transcription_model: TranscriptionModel
    segments: list[Segment]
