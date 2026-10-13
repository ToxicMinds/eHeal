"""Local transcription with faster-whisper. Loads models from disk only."""

import math
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from uuid import UUID, uuid4

from faster_whisper import WhisperModel

from .config import Settings
from .errors import ErrorCategory, WorkerError
from .schema import Segment, Speaker, Transcript, TranscriptionModel


@lru_cache(maxsize=1)
def _load(model_path: str, device: str, compute_type: str, cpu_threads: int) -> WhisperModel:
    # A directory path means faster-whisper never contacts Hugging Face.
    return WhisperModel(
        model_path, device=device, compute_type=compute_type, cpu_threads=cpu_threads
    )


def transcribe(
    path: Path,
    *,
    appointment_id: UUID,
    speaker: Speaker,
    language: str | None,
    settings: Settings,
) -> Transcript:
    if not settings.model_path.is_dir():
        raise WorkerError(ErrorCategory.TRANSCRIPTION_MODEL_UNAVAILABLE)
    try:
        model = _load(
            str(settings.model_path), settings.device, settings.compute_type, settings.cpu_threads
        )
        raw_segments, info = model.transcribe(str(path), language=language, vad_filter=True)
        segments = [
            Segment(
                segment_id=uuid4(),
                speaker=speaker,
                start_seconds=s.start,
                end_seconds=s.end,
                machine_text=s.text.strip(),
                confidence=None
                if s.no_speech_prob > settings.no_speech_threshold
                else round(min(1.0, math.exp(s.avg_logprob)), 3),
            )
            for s in raw_segments  # lazy generator: decoding happens here
        ]
    except Exception as exc:
        raise WorkerError(ErrorCategory.TRANSCRIPTION_FAILED) from exc
    return Transcript(
        appointment_id=appointment_id,
        source_languages=[info.language],
        created_at_utc=datetime.now(UTC),
        transcription_model=TranscriptionModel(
            model=settings.model, device=settings.device, compute_type=settings.compute_type
        ),
        segments=segments,
    )
