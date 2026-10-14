"""Two tracks, one timeline (MASTER_BUILD_SPEC.md section 12.6)."""

from uuid import uuid4

from .schema import Segment, Speaker
from .transcribe import RawSegment

SPEAKER_ORDER: dict[Speaker, int] = {"practitioner": 0, "patient": 1}


def merge(
    tracks: dict[Speaker, list[RawSegment]],
    offsets: dict[Speaker, float],
    recorded_together: bool,
    tolerance_seconds: float,
) -> list[Segment]:
    """Orders by start time, then speaker (practitioner first), then position in the track.

    Overlap is computed only when the tracks share a clock; otherwise it is None,
    because two tracks that may not line up cannot be said to overlap."""
    lines = [
        (
            max(0.0, raw.start + offsets.get(speaker, 0.0)),
            SPEAKER_ORDER[speaker],
            index,
            speaker,
            raw,
        )
        for speaker, segments in tracks.items()
        for index, raw in enumerate(segments)
    ]
    lines.sort(key=lambda line: (line[0], line[1], line[2]))

    timed = [
        (start, max(start, raw.end + offsets.get(speaker, 0.0)), speaker, raw)
        for start, _, _, speaker, raw in lines
    ]
    overlapping: set[int] = set()
    if recorded_together:
        for i, (_, end, speaker, _) in enumerate(timed):
            for j in range(i + 1, len(timed)):
                other_start, other_end, other_speaker, _ = timed[j]
                if other_start >= end:
                    break
                shared = min(end, other_end) - other_start
                if other_speaker != speaker and shared > tolerance_seconds:
                    overlapping.update((i, j))

    return [
        Segment(
            segment_id=uuid4(),
            position=position,
            speaker=speaker,
            start_seconds=round(start, 2),
            end_seconds=round(end, 2),
            machine_text=raw.text,
            confidence=raw.confidence,
            possibly_not_speech=raw.possibly_not_speech,
            overlap=(position in overlapping) if recorded_together else None,
        )
        for position, (start, end, speaker, raw) in enumerate(timed)
    ]
