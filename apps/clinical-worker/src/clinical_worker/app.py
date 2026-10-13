"""Local-only HTTP API. Synthetic data only."""

import secrets
import time
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse

from .audio import audio_duration_seconds
from .config import AUDIO_FORMATS, HOST, Settings
from .errors import ErrorCategory, WorkerError
from .log import log_event
from .schema import Speaker, Transcript
from .storage import Storage
from .transcribe import transcribe

STATIC = Path(__file__).parent / "static"
STATIC_FILES = {"/": "index.html", "/app.js": "app.js", "/app.css": "app.css"}
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; "
    "connect-src 'self'; media-src blob:; base-uri 'none'; form-action 'none'; "
    "frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


def create_app(settings: Settings, token: str) -> FastAPI:
    app = FastAPI(title="clinical-worker", docs_url=None, redoc_url=None, openapi_url=None)
    storage = Storage(settings.data_dir)
    allowed_hosts = {f"{HOST}:{settings.port}", f"localhost:{settings.port}"}
    allowed_origins = {f"http://{host}" for host in allowed_hosts}
    if settings.public_host:
        allowed_hosts.add(settings.public_host)
        allowed_origins.add(f"https://{settings.public_host}")

    def local_only(request: Request) -> None:
        # Blocks DNS rebinding (foreign Host) and cross-site browser requests (foreign Origin).
        if (
            request.headers.get("host") not in allowed_hosts
            or request.headers.get("origin", next(iter(allowed_origins))) not in allowed_origins
        ):
            raise HTTPException(status_code=403, detail="Forbidden")

    def authorised(request: Request) -> None:
        local_only(request)
        supplied = request.headers.get("authorization", "")
        if not secrets.compare_digest(supplied.encode(), f"Bearer {token}".encode()):
            raise HTTPException(status_code=401, detail="Unauthorised")

    @app.exception_handler(WorkerError)
    async def worker_error(_: Request, exc: WorkerError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            content={"error_category": exc.category.value, "message": exc.public_message},
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers.update(SECURITY_HEADERS)
        return response

    @app.get("/health", dependencies=[Depends(local_only)])
    def health() -> dict[str, str]:
        return {"status": "ok", "deployment": settings.deployment, "model": settings.model}

    def static_route(filename: str):  # type: ignore[no-untyped-def]
        def serve() -> FileResponse:
            return FileResponse(STATIC / filename)

        return serve

    for route, filename in STATIC_FILES.items():
        app.get(route, dependencies=[Depends(local_only)])(static_route(filename))

    @app.post(
        "/appointments/{appointment_id}/transcriptions",
        dependencies=[Depends(authorised)],
    )
    async def create_transcription(
        appointment_id: UUID,
        request: Request,
        speaker: Speaker,
        audio_format: Annotated[str, Query(alias="format")],
        language: Annotated[str | None, Query(pattern="^[a-z]{2,3}$")] = None,
    ) -> Transcript:
        request_id = str(uuid4())
        ids: dict[Literal["request_id", "appointment_id", "speaker"], str] = {
            "request_id": request_id,
            "appointment_id": str(appointment_id),
            "speaker": speaker,
        }
        started = time.monotonic()
        try:
            if audio_format not in AUDIO_FORMATS:
                raise WorkerError(ErrorCategory.AUDIO_FORMAT_UNSUPPORTED)
            path = storage.audio_path(appointment_id, speaker, audio_format)
            await storage.save_audio(path, request.stream(), settings.max_bytes)
            try:
                duration = audio_duration_seconds(path, settings.max_duration_seconds)
            except WorkerError:
                path.unlink(missing_ok=True)  # rejected input is not kept
                raise
            log_event("transcription.started", **ids, model=settings.model)
            # On failure the validated audio stays in place for a retry.
            transcript = await run_in_threadpool(
                transcribe,
                path,
                appointment_id=appointment_id,
                speaker=speaker,
                language=language,
                settings=settings,
            )
            storage.write_transcript(transcript)
        except WorkerError as exc:
            log_event(
                "transcription.failed",
                **ids,
                error_category=exc.category.value,
                exception_type=type(exc.__cause__).__name__ if exc.__cause__ else None,
            )
            raise
        finally:
            if not settings.retain_files:
                storage.purge(appointment_id)
        log_event(
            "transcription.completed",
            **ids,
            model=settings.model,
            device=settings.device,
            compute_type=settings.compute_type,
            audio_duration_seconds=round(duration, 2),
            duration_seconds=round(time.monotonic() - started, 2),
            segment_count=len(transcript.segments),
        )
        return transcript

    return app
