"""The only module that touches consultation files on disk.

Slices 1-4 store synthetic data in plaintext; the encrypted vault (Slice 5)
replaces this module's internals. Paths are built only from UUIDs and fixed
names, so no user-supplied string ever reaches the filesystem."""

import os
import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import UUID

from .errors import ErrorCategory, WorkerError
from .schema import Speaker, Transcript


class Storage:
    def __init__(self, root: Path) -> None:
        self._root = root

    def _dir(self, appointment_id: UUID, kind: str) -> Path:
        path = self._root / str(appointment_id) / kind
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
        return path

    def audio_path(self, appointment_id: UUID, speaker: Speaker, fmt: str) -> Path:
        return self._dir(appointment_id, "audio") / f"{speaker}.{fmt}"

    def transcript_path(self, appointment_id: UUID) -> Path:
        return self._dir(appointment_id, "transcript") / "raw.json"

    async def save_audio(self, path: Path, chunks: AsyncIterator[bytes], max_bytes: int) -> int:
        """Stream an upload straight to its final location; no temp copy elsewhere."""
        size = 0
        try:
            with _open_private(path) as out:
                async for chunk in chunks:
                    size += len(chunk)
                    if size > max_bytes:
                        raise WorkerError(ErrorCategory.AUDIO_TOO_LARGE)
                    out.write(chunk)
            if size == 0:
                raise WorkerError(ErrorCategory.AUDIO_FILE_MISSING)
        except WorkerError:
            path.unlink(missing_ok=True)
            raise
        return size

    def purge(self, appointment_id: UUID) -> None:
        shutil.rmtree(self._root / str(appointment_id), ignore_errors=True)

    def write_transcript(self, transcript: Transcript) -> Path:
        path = self.transcript_path(transcript.appointment_id)
        partial = path.with_suffix(".partial")
        with _open_private(partial) as out:
            out.write(transcript.model_dump_json(indent=2).encode())
        partial.replace(path)  # atomic: never leaves a half-written transcript
        return path


def _open_private(path: Path):  # type: ignore[no-untyped-def]
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    return os.fdopen(os.open(path, flags, 0o600), "wb")
