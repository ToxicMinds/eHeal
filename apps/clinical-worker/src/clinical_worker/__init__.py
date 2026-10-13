"""Local clinical worker. Synthetic data only; binds to localhost only."""

import uvicorn
from fastapi import FastAPI

HOST = "127.0.0.1"  # never 0.0.0.0, see MASTER_BUILD_SPEC.md section 10
PORT = 8765

app = FastAPI(title="clinical-worker", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def main() -> None:
    uvicorn.run(app, host=HOST, port=PORT, access_log=False)
