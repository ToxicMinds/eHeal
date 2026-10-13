# eHeal

Local-first teleconsultation documentation platform.

**Development POC. Synthetic data only. Not for use with real patients.**

The authoritative specification is [MASTER_BUILD_SPEC.md](MASTER_BUILD_SPEC.md).

## Prerequisites

- Node >= 22 with corepack (`corepack enable`)
- [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for the worker)
- [Ollama](https://ollama.com) (Phase 2 only)

## Setup

    pnpm install
    (cd apps/clinical-worker && uv sync)

## Check everything

    pnpm check        # tests, lint, type checking across the monorepo

## Run the worker

    cd apps/clinical-worker && uv run clinical-worker
    curl http://127.0.0.1:8765/health

## Layout

    apps/clinical-worker   Python FastAPI worker, localhost only
