# The supplier sim (issue #224), an image of its own that never enters the
# app's. Built from the repo root, `docker build -f sim/Dockerfile .`, so it
# can install the backend's own hashed lock: the sim runs on the FastAPI,
# uvicorn and Pydantic the app ships, and adds no dependency of its own.
# `sim/Dockerfile.dockerignore` keeps the context to the lock and sim/app.
#
# The base is the root Dockerfile's runtime base, digest and all, and a sim
# test holds the two lines equal, so a Dependabot bump moves both.
FROM python:3.14-alpine@sha256:f6a589d43c42b9e7f7dc67a12d37132491f362859a5d750607710cc56da3bc72

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /sim
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --root-user-action=ignore --require-hashes -r requirements.txt
COPY sim/app/ ./app/
# Nothing needs root: uvicorn binds 8080 and the sim reads nothing from disk.
RUN addgroup -S -g 10001 sim && adduser -S -u 10001 -G sim sim
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2).status == 200 else 1)"]
# The sim logs every answer itself (app/main.py), so uvicorn's access log
# would only say each one twice.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
