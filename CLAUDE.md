# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Bluebird is a map-based weather window finder for hikers and mountaineers, live at `bluebirdforecast.com`. Users draw a polygon on a map, pick a destination type and forecast window, and get a ranked table of destinations sorted by precipitation. No API keys are required — all external APIs (Overpass/OSM, Open-Meteo, OpenFreeMap) are free and unauthenticated.

## Development commands

**Backend (FastAPI, Python 3.12):**
```bash
cd backend
pip install -r requirements.txt
LOG_LEVEL=TRACE uvicorn app.main:app --reload --port 8000
```

**Frontend (React + Vite, TypeScript):**
```bash
cd frontend
npm install
npm run dev   # starts on :5173, proxies /api → :8000
```

**Type check frontend:**
```bash
cd frontend && npx tsc --noEmit
```

**Lint backend:**
```bash
pip install ruff && ruff check backend/
```

**Full stack via Docker:**
```bash
docker compose up --build -d
docker compose logs -f
```

There are no automated tests — CI validates via TypeScript typecheck, Python ruff lint, and a full Docker build.

## Architecture

Single container, multi-stage Docker build:
- Stage 1: `node:22-alpine` — builds the React SPA (`npm run build`)
- Stage 2: `python:3.12-slim` — runs uvicorn and serves the built SPA as static files at `/`

The FastAPI backend handles `POST /api/analyze`, which:
1. Validates polygon area (bounding-box approximation, max 50,000 km²)
2. Queries Overpass API for OSM features (peaks only implemented; queries for trailheads/lakes/campgrounds exist in `osm.py` but are gated by `_IMPLEMENTED`)
3. Fetches hourly weather from Open-Meteo in batches of 50, run concurrently via `asyncio.gather`
4. Sorts and returns results

**Key constraint shared between frontend and backend:** `MAX_POLYGON_AREA_KM2 = 50_000` is defined in both `backend/app/models.py` and `frontend/src/components/MapView.tsx` — keep them in sync.

**Backend layout:**
- `app/main.py` — FastAPI app, logging setup (includes custom `TRACE` level at value 5), static file mount
- `app/models.py` — Pydantic request/response models, polygon area validation
- `app/routes/analyze.py` — single route handler
- `app/services/osm.py` — Overpass query with 3-endpoint fallback chain
- `app/services/weather.py` — Open-Meteo batched parallel fetch

**Frontend layout:**
- `src/App.tsx` — root component
- `src/components/MapView.tsx` — MapLibre GL map, polygon drawing with native pointer events
- `src/components/ControlPanel.tsx` — sidebar controls
- `src/components/ResultsTable.tsx` — sortable results table
- `src/hooks/useAnalyze.ts` — fetch logic for `POST /api/analyze`
- `src/types.ts` — TypeScript types mirroring backend Pydantic models
- `src/utils/colors.ts` — marker color thresholds by precipitation

## CI/CD pipeline

**PR checks** (`pr.yml`): runs on all non-main branches and PRs → TypeScript typecheck, ruff lint, Docker build (no push).

**Release** (`release.yml`): triggers on merge to `main` → GitVersion calculates SemVer from conventional commits → builds and pushes `zimmertr/bluebird:<semver>` to Docker Hub → creates GitHub release → updates `kustomization.yml` in the `zimmertr/Kubernetes-Manifests` repo, which ArgoCD auto-syncs.

**GitVersion** (`GitVersion.yml`): Mainline mode. Commit prefix mapping:
- `feat!` / `BREAKING CHANGE:` → major bump
- `feat:` → minor bump
- `fix`, `perf`, `refactor`, `chore`, `docs`, `style`, `test`, `ci` → patch bump

## Kubernetes deployment

Manifests live in a separate repo (`zimmertr/Kubernetes-Manifests`) under `public/bluebird/`. ArgoCD picks them up automatically. Stack uses Argo Rollouts (canary), Istio VirtualService/Gateway, and cert-manager for `bluebirdforecast.com`. The release pipeline updates the manifest tag automatically — manual manifest edits are only needed for configuration changes (e.g., `LOG_LEVEL` env var).

## Adding a new destination type

1. Add the type to `DestinationType` enum in `backend/app/models.py`
2. The Overpass QL query already exists in `backend/app/services/osm.py` for trailheads, lakes, and campgrounds — add the type to `_IMPLEMENTED`
3. Add the corresponding option in the frontend `ControlPanel.tsx`
