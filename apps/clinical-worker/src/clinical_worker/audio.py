"""Audio validation: the file must decode locally and have a sane duration."""

from pathlib import Path

import av

from .errors import ErrorCategory, WorkerError


def audio_duration_seconds(path: Path, max_duration_seconds: float) -> float:
    try:
        with av.open(str(path)) as container:
            if not container.streams.audio:
                raise WorkerError(ErrorCategory.AUDIO_CORRUPT)
            stream = container.streams.audio[0]
            if stream.duration is not None and stream.time_base is not None:
                duration = float(stream.duration * stream.time_base)
            elif container.duration is not None:
                duration = container.duration / av.time_base
            else:
                raise WorkerError(ErrorCategory.AUDIO_DURATION_INVALID)
            next(container.decode(stream), None)  # prove at least the start decodes
    except (av.FFmpegError, ValueError, OSError):
        raise WorkerError(ErrorCategory.AUDIO_CORRUPT) from None
    if not 0 < duration <= max_duration_seconds:
        raise WorkerError(ErrorCategory.AUDIO_DURATION_INVALID)
    return duration
