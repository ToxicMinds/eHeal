"""Pulls jobs from the database and processes them (MASTER_BUILD_SPEC.md section 12.7).

The engine signs in as its own account, which can call the engine functions and read the
audio of the job it has claimed, and nothing else. It listens on no port."""

import hashlib
import shutil
import tempfile
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from supabase import Client, ClientOptions, create_client

from .audio import audio_duration_seconds
from .config import AUDIO_FORMATS, Settings
from .errors import ErrorCategory, Stopped, WorkerError
from .log import log_event
from .merge import merge
from .schema import Speaker, Track, Transcript, TranscriptionModel
from .transcribe import TrackTranscription, model_revision, transcribe_track

SPEAKERS: tuple[Speaker, Speaker] = ("practitioner", "patient")


class Connection:
    """One signed-in session. If the session has lapsed, it signs in once more and retries."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = self._sign_in()

    def _sign_in(self) -> Client:
        client = create_client(
            self.settings.supabase_url,
            self.settings.supabase_publishable_key,
            options=ClientOptions(auto_refresh_token=True, persist_session=False),
        )
        client.auth.sign_in_with_password(
            {
                "email": self.settings.engine_email,
                "password": self.settings.engine_password.get_secret_value(),
            }
        )
        return client

    def rpc(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        for attempt in (1, 2):
            try:
                data = self.client.rpc(name, args).execute().data
                return data if isinstance(data, dict) else {}
            except Exception as exc:
                if attempt == 2 or not _session_lapsed(exc):
                    raise
                self.client = self._sign_in()
        raise AssertionError("unreachable")

    def download(self, path: str) -> bytes:
        for attempt in (1, 2):
            try:
                return self.client.storage.from_("audio").download(path)
            except Exception as exc:
                if attempt == 2 or not _session_lapsed(exc):
                    raise
                self.client = self._sign_in()
        raise AssertionError("unreachable")


def _session_lapsed(exc: Exception) -> bool:
    text = str(exc).lower()
    return "jwt" in text or "expired" in text or "401" in text


def _missing(exc: Exception) -> bool:
    text = str(exc).lower()
    return "not found" in text or "404" in text


class Heartbeat(threading.Thread):
    """Tells the database where the job is, at least every `interval` seconds, and
    raises the `stopped` flag when the answer is to stop."""

    def __init__(self, connection: Connection, job_id: str, interval: float) -> None:
        super().__init__(daemon=True)
        self.connection = connection
        self.job_id = job_id
        self.interval = interval
        self.stage = "validating"
        self.audio_seconds: float | None = None
        self.stopped = threading.Event()
        self._finished = threading.Event()
        self._lock = threading.Lock()

    def beat(self) -> None:
        with self._lock:
            try:
                answer = self.connection.rpc(
                    "engine_heartbeat",
                    {
                        "p_job_id": self.job_id,
                        "p_stage": self.stage,
                        "p_audio_seconds": self.audio_seconds,
                    },
                )
                if not answer.get("continue"):
                    self.stopped.set()
            except Exception as exc:
                log_event(
                    "job.heartbeat_failed", job_id=self.job_id, exception_type=type(exc).__name__
                )

    def move_to(self, stage: str) -> None:
        self.stage = stage
        self.beat()
        if self.stopped.is_set():
            raise Stopped

    def run(self) -> None:
        while not self._finished.wait(self.interval):
            self.beat()

    def finish(self) -> None:
        self._finished.set()


class Engine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.main = Connection(settings)
        self.beats = Connection(
            settings
        )  # a second session, so a long download never delays a heartbeat

    def run_forever(self) -> None:
        log_event(
            "engine.started",
            model=self.settings.model,
            device=self.settings.device,
            compute_type=self.settings.compute_type,
        )
        while True:
            try:
                worked = self.run_once()
            except Exception as exc:
                log_event("engine.poll_failed", exception_type=type(exc).__name__)
                worked = False
            if not worked:
                time.sleep(self.settings.poll_seconds)

    def run_once(self) -> bool:
        """Claims and processes one job. False when there was nothing to do."""
        answer = self.main.rpc("engine_claim_job", {})
        if not answer.get("ok"):
            raise RuntimeError(str(answer.get("error_category")))
        job = answer.get("job")
        if not job:
            return False
        self.process(job)
        return True

    def process(self, job: dict[str, Any]) -> None:
        ids: dict[str, str | int] = {
            "job_id": job["job_id"],
            "consultation_id": job["consultation_id"],
            "attempt": job["attempt"],
        }
        started = time.monotonic()
        heartbeat = Heartbeat(self.beats, job["job_id"], self.settings.heartbeat_seconds)
        heartbeat.start()
        self.settings.work_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        workdir = Path(tempfile.mkdtemp(dir=self.settings.work_dir))
        log_event("job.claimed", **ids)
        try:
            paths = self._fetch(job, workdir, heartbeat)
            language = None if job["language"] == "auto" else job["language"]
            results: dict[Speaker, TrackTranscription] = {}
            for speaker in SPEAKERS:
                heartbeat.move_to(f"transcribing_{speaker}")
                try:
                    results[speaker] = transcribe_track(
                        paths[speaker], language, self.settings, heartbeat.stopped.is_set
                    )
                except WorkerError as error:
                    raise WorkerError(error.category, speaker) from error
            heartbeat.move_to("merging")
            transcript, metrics = self._assemble(job, results, started)
            answer = self.main.rpc(
                "engine_complete_job",
                {
                    "p_job_id": job["job_id"],
                    "p_transcript": transcript.model_dump(mode="json"),
                    "p_metrics": metrics,
                },
            )
            if answer.get("ok"):
                log_event(
                    "job.completed",
                    **ids,
                    model=self.settings.model,
                    segment_count=len(transcript.segments),
                    audio_duration_seconds=metrics["audio_duration_seconds"],
                    duration_seconds=round(time.monotonic() - started, 2),
                )
            else:
                log_event(
                    "job.result_refused", **ids, error_category=str(answer.get("error_category"))
                )
        except Stopped:
            log_event("job.stopped", **ids, stage=heartbeat.stage)
        except WorkerError as error:
            self._fail(job["job_id"], error.category, error.speaker, ids, error.__cause__)
        except Exception as exc:
            self._fail(job["job_id"], ErrorCategory.TRANSCRIPTION_FAILED, None, ids, exc)
        finally:
            heartbeat.finish()
            shutil.rmtree(workdir, ignore_errors=True)  # no copy of the audio outlives the job

    def _fetch(
        self, job: dict[str, Any], workdir: Path, heartbeat: Heartbeat
    ) -> dict[Speaker, Path]:
        paths: dict[Speaker, Path] = {}
        total = 0.0
        for track in job["tracks"]:
            speaker: Speaker = track["speaker"]
            if track["format"] not in AUDIO_FORMATS:
                raise WorkerError(ErrorCategory.AUDIO_FORMAT_UNSUPPORTED, speaker)
            try:
                data = self.main.download(track["storage_path"])
            except Exception as exc:
                category = (
                    ErrorCategory.AUDIO_FILE_MISSING
                    if _missing(exc)
                    else ErrorCategory.STORAGE_UNAVAILABLE
                )
                raise WorkerError(category, speaker) from exc
            if len(data) > self.settings.max_bytes:
                raise WorkerError(ErrorCategory.AUDIO_TOO_LARGE, speaker)
            if hashlib.sha256(data).hexdigest() != track["sha256"]:
                # The file is not the one that was registered.
                raise WorkerError(ErrorCategory.AUDIO_CORRUPT, speaker)
            path = workdir / f"{speaker}.{track['format']}"
            path.write_bytes(data)
            path.chmod(0o600)
            try:
                total += audio_duration_seconds(path, self.settings.max_duration_seconds)
            except WorkerError as error:
                raise WorkerError(error.category, speaker) from error
            paths[speaker] = path
            if heartbeat.stopped.is_set():
                raise Stopped
        heartbeat.audio_seconds = total
        heartbeat.beat()  # the time limit is now known (section 12.4)
        return paths

    def _assemble(
        self, job: dict[str, Any], results: dict[Speaker, TrackTranscription], started: float
    ) -> tuple[Transcript, dict[str, Any]]:
        together = bool(job["recorded_together"])
        offsets: dict[Speaker, float] = {
            t["speaker"]: float(t["offset_seconds"]) for t in job["tracks"]
        }
        segments = merge(
            {speaker: result.segments for speaker, result in results.items()},
            offsets,
            together,
            self.settings.overlap_tolerance_seconds,
        )
        model = TranscriptionModel(
            model=self.settings.model,
            revision=model_revision(self.settings),
            device=self.settings.device,
            compute_type=self.settings.compute_type,
        )
        tracks = [
            Track(
                speaker=t["speaker"],
                audio_sha256=t["sha256"],
                duration_seconds=results[t["speaker"]].duration_seconds,
                offset_seconds=offsets[t["speaker"]],
                sync_method="shared_clock" if together else "none",
                language=results[t["speaker"]].language,
                language_probability=results[t["speaker"]].language_probability,
                transcription_model=model,
            )
            for t in job["tracks"]
        ]
        try:
            transcript = Transcript(
                consultation_id=job["consultation_id"],
                created_at_utc=datetime.now(UTC),
                ordering="exact" if together else "approximate",
                low_confidence_threshold=self.settings.low_confidence_threshold,
                tracks=tracks,
                segments=segments,
            )
        except ValueError as exc:
            raise WorkerError(ErrorCategory.TRANSCRIPT_MERGE_FAILED) from exc
        threshold = self.settings.low_confidence_threshold
        metrics = {
            "audio_duration_seconds": round(sum(r.duration_seconds for r in results.values()), 2),
            "transcription_duration_seconds": round(time.monotonic() - started, 2),
            "transcription_model_name": "faster-whisper",
            "transcription_model_size": self.settings.model,
            "device_type": self.settings.device,
            "compute_type": self.settings.compute_type,
            "transcript_segment_count": len(segments),
            "low_confidence_segment_count": sum(
                1
                for s in segments
                if s.possibly_not_speech or (s.confidence is not None and s.confidence < threshold)
            ),
            "overlap_segment_count": sum(1 for s in segments if s.overlap),
        }
        return transcript, metrics

    def _fail(
        self,
        job_id: str,
        category: ErrorCategory,
        speaker: str | None,
        ids: dict[str, str | int],
        cause: BaseException | None,
    ) -> None:
        log_event(
            "job.failed",
            **ids,
            error_category=category.value,
            speaker=speaker,
            exception_type=type(cause).__name__ if cause else None,
        )
        try:
            self.main.rpc(
                "engine_fail_job",
                {
                    "p_job_id": job_id,
                    "p_error_category": category.value,
                    "p_speaker": speaker,
                    "p_metrics": {},
                },
            )
        except Exception as exc:
            log_event("job.failure_not_reported", **ids, exception_type=type(exc).__name__)
