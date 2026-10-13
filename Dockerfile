# Hosted demo of the clinical worker. Synthetic data only.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.10.12 /uv /usr/local/bin/uv

ARG EHEAL_MODEL=base
ENV EHEAL_MODEL=${EHEAL_MODEL} \
    EHEAL_HOME=/srv/eheal \
    EHEAL_DEPLOYMENT=cloud-demo \
    EHEAL_PORT=10000 \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_CACHE=1 \
    PATH=/app/.venv/bin:$PATH

WORKDIR /app
COPY apps/clinical-worker/pyproject.toml apps/clinical-worker/uv.lock apps/clinical-worker/README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/clinical-worker/src ./src
RUN uv sync --frozen --no-dev --no-editable

# The model is baked into the image so the running service never downloads anything.
# EHEAL_DEPLOYMENT is overridden because cloud-demo refuses to load without a token.
RUN EHEAL_DEPLOYMENT=local clinical-worker fetch-model \
    && useradd --system --home-dir /srv/eheal app && chown -R app /srv/eheal
USER app
EXPOSE 10000
CMD ["clinical-worker"]
