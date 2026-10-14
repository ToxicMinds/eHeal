"""Versioned transcript format, version 2.0.0 (MASTER_BUILD_SPEC.md section 10.3).
This Pydantic model is the source of truth; packages/schemas holds the generated JSON Schema."""

from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = "2.0.0"

Speaker = Literal["practitioner", "patient"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TranscriptionModel(_Strict):
    provider: Literal["faster-whisper"] = "faster-whisper"
    model: str
    revision: str | None = None
    device: str
    compute_type: str


class Track(_Strict):
    speaker: Speaker
    audio_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    duration_seconds: float = Field(ge=0)
    offset_seconds: float = 0.0
    sync_method: Literal["none", "shared_clock", "marker"]
    language: str
    # Set only when the language was detected rather than chosen.
    language_probability: float | None = Field(default=None, ge=0, le=1)
    transcription_model: TranscriptionModel


class Segment(_Strict):
    segment_id: UUID
    position: int = Field(ge=0)
    speaker: Speaker
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(ge=0)
    machine_text: str
    reviewed_text: str | None = None
    # exp(average log-probability): a hint where to look, not the chance of being right.
    confidence: float | None = Field(default=None, ge=0, le=1)
    possibly_not_speech: bool = False
    review_status: Literal["unreviewed", "reviewed"] = "unreviewed"
    # None when the tracks may not line up in time (section 12.6).
    overlap: bool | None = None

    @model_validator(mode="after")
    def _end_after_start(self) -> Self:
        if self.end_seconds < self.start_seconds:
            raise ValueError("end_seconds must not be before start_seconds")
        return self


class Transcript(_Strict):
    schema_version: Literal["2.0.0"] = "2.0.0"
    consultation_id: UUID
    created_at_utc: AwareDatetime
    ordering: Literal["exact", "approximate"]
    low_confidence_threshold: float = Field(ge=0, le=1)
    review_status: Literal["unreviewed", "under_review", "reviewed", "superseded"] = "unreviewed"
    reviewed_at_utc: AwareDatetime | None = None
    reviewed_by: UUID | None = None
    tracks: list[Track] = Field(min_length=2, max_length=2)
    segments: list[Segment]

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if {track.speaker for track in self.tracks} != {"practitioner", "patient"}:
            raise ValueError("one track per speaker")
        if [segment.position for segment in self.segments] != list(range(len(self.segments))):
            raise ValueError("positions must run 0, 1, 2, ... in order")
        if self.ordering == "approximate" and any(s.overlap is not None for s in self.segments):
            raise ValueError("overlap is not computed when ordering is approximate")
        return self
