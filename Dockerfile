# Stage 1: Build React frontend
# Bases are pinned by digest so image builds are reproducible and immune to
# mutable-tag surprises; bump the digest deliberately when updating the tag.
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend serving built frontend as static files
FROM python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app/ ./app/
COPY --from=frontend-builder /app/frontend/dist/ ./static/
# Nothing needs root at runtime — uvicorn binds 8000 and the app only reads
# baked-in files — so serve as an unprivileged user.
RUN groupadd -r bluebird && useradd -r -g bluebird bluebird
USER bluebird
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
