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

**Frontend unit tests (Vitest) — run in Docker, not on the local machine:**
```bash
docker run --rm -v "$PWD/frontend":/app -w /app node:22-alpine \
  sh -c "npm ci && npm test"
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

Test coverage is limited to the frontend's pure logic: `frontend/src/utils/*.test.ts` run under Vitest (e.g. URL state serialization in `urlState.ts`). CI validates via TypeScript typecheck, these Vitest unit tests, Python ruff lint, and a full Docker build. There are no backend tests.

## Architecture

Single container, multi-stage Docker build:
- Stage 1: `node:22-alpine` — builds the React SPA (`npm run build`)
- Stage 2: `python:3.12-slim` — runs uvicorn and serves the built SPA as static files at `/`

The FastAPI backend handles `POST /api/analyze`, which:
1. Validates polygon area (bounding-box approximation, max 50,000 km²)
2. Queries Overpass API for **every** named OSM feature in the polygon — no sampling (peaks only implemented; queries for trailheads/lakes exist in `osm.py` but are gated by `_IMPLEMENTED`), then drops candidates outside the optional elevation band (unknown elevations pass through). Analyses over `MAX_ANALYZE_PEAKS = 1_000` candidates refuse with a clear error instead of silently truncating
3. Fetches hourly weather from Open-Meteo in batches of 50, at most 4 batches in flight at once; PM2.5 US AQI is fetched the same way from Open-Meteo's air-quality endpoint alongside it (best-effort: failures and the short horizon degrade to `null` AQI, never fail the analysis — weather forecasts reach ~16 days, air quality only ~5)
4. Ranks by `sort_by` + `sort_desc` and returns the top `limit` rows (nullable AQI sort keys push `None` last in either direction)

The SPA fetches only on an explicit Analyze click and renders results from a snapshot of the ranking that produced them (`analyzed` in `useAnalyze.ts`) — panel knob changes never mutate the displayed analysis.

**Key constraint shared between frontend and backend:** `MAX_POLYGON_AREA_KM2 = 50_000` is defined in both `backend/app/models.py` and `frontend/src/components/MapView.tsx` — keep them in sync.

**Backend layout:**
- `app/main.py` — FastAPI app, logging setup (includes custom `TRACE` level at value 5), static file mount
- `app/models.py` — Pydantic request/response models, polygon area validation
- `app/routes/analyze.py` — single route handler
- `app/services/osm.py` — Overpass query with 3-endpoint fallback chain
- `app/services/weather.py` — Open-Meteo batched parallel fetch
- `app/services/air_quality.py` — Open-Meteo air-quality (PM2.5 US AQI) batched fetch, best-effort

**Frontend layout:**
- `src/App.tsx` — root component
- `src/components/MapView.tsx` — MapLibre GL map, polygon drawing with native pointer events
- `src/components/ControlPanel.tsx` — sidebar controls
- `src/components/ResultsTable.tsx` — sortable results table
- `src/hooks/useAnalyze.ts` — fetch logic for `POST /api/analyze`
- `src/types.ts` — TypeScript types mirroring backend Pydantic models
- `src/utils/colors.ts` — marker/cell color thresholds per sortable metric (precip, wind, temp, AQI)

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
2. The Overpass QL query already exists in `backend/app/services/osm.py` for trailheads and lakes — add the type to `_IMPLEMENTED`
3. Add the corresponding option in the frontend `ControlPanel.tsx`
