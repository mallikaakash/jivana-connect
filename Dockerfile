# Jivana Connect backend (FastAPI) for Cloud Run. Built from the repo root because the
# backend loads shared/seed.json. Deploy: gcloud run deploy jivana-api --source . (see backend/README.md)
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /bin/uv
# pyproject pins uv-managed Python for local dev; inside the image use the system interpreter.
ENV UV_PYTHON_PREFERENCE=only-system UV_PYTHON_DOWNLOADS=never UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /srv/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY shared /srv/shared
COPY backend /srv/backend
RUN uv sync --frozen --no-dev

ENV PORT=8080
CMD ["sh", "-c", "exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
