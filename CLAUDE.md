# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Bluebird is a map-based weather window finder for hikers and mountaineers, live at `bluebirdforecast.com`. Users draw a polygon on a map, pick a destination type and forecast window, and get a ranked table of destinations sorted by precipitation. No API keys are required — all external APIs (Overpass/OSM, Open-Meteo, OpenFreeMap, and NIFC for the optional wildfire overlay) are free and unauthenticated.

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

**Backend unit tests (pytest) — run in Docker, not on the local machine:**
```bash
docker run --rm -v "$PWD/backend":/app -w /app python:3.12-slim \
  sh -c "pip install -r requirements-dev.txt && pytest"
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

Two suites: the frontend's pure logic under Vitest (`frontend/src/utils/*.test.ts`, e.g. URL state serialization in `urlState.ts` and marker colors in `colors.ts`), and the backend under pytest (`backend/tests/`, covering weather/AQI aggregation, request validation, ranking/elevation filtering, upstream-error mapping, and the routes with the external APIs stubbed). CI validates via TypeScript typecheck, the Vitest unit tests, pytest, Python ruff lint, and a full Docker build.

## Rules for every change

- **Ship tests with behavior.** Any change to the frontend, backend, or anything else testable adds or updates coverage in the same PR — Vitest under `frontend/src/utils/*.test.ts` for frontend logic, pytest under `backend/tests/` for the backend (both run in Docker; commands above). A behavior change without a matching test is incomplete.
- **Keep the CI/CD diagram current.** Any change that alters the deploy flow — a workflow in this repo or `bluebird-helm`, an image/chart/tag convention, or the `Kubernetes-Manifests` wiring — updates [`docs/CICD.md`](docs/CICD.md) in the same PR. That diagram spans two sibling repos (`bluebird-helm` and `Kubernetes-Manifests`), so flow changes made there come back here too; nothing enforces this automatically.

## Architecture

Single container, multi-stage Docker build:
- Stage 1: `node:22-alpine` — builds the React SPA (`npm run build`)
- Stage 2: `python:3.12-slim` — runs uvicorn and serves the built SPA as static files at `/`

The FastAPI backend handles `POST /api/analyze`, which:
1. Validates polygon area (bounding-box approximation, max 50,000 km²)
2. Queries Overpass API for **every** named OSM feature in the polygon — no sampling (peaks, trailheads, and lakes; available types are gated by `_IMPLEMENTED` in `osm.py`), then drops candidates outside the optional elevation band (unknown elevations pass through). Analyses over `MAX_ANALYZE_PEAKS = 1_000` candidates refuse with a clear error instead of silently truncating
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
- `src/components/SearchBox.tsx` — floating map search (Nominatim place lookup + local coordinate parsing; Enter-to-search only, per Nominatim's no-autocomplete policy)
- `src/components/ResultsTable.tsx` — sortable results table
- `src/hooks/useAnalyze.ts` — fetch logic for `POST /api/analyze`
- `src/types.ts` — TypeScript types mirroring backend Pydantic models
- `src/utils/colors.ts` — marker/cell color thresholds per sortable metric (precip, wind, temp, AQI)
- `src/utils/geocode.ts` — coordinate parsing, Nominatim client, and search-view bounds math for the search box
- `src/utils/wildfires.ts` — NIFC WFIGS query builder + popup formatting for the optional wildfire overlay (fetched client-side by viewport; US-only, keyless, best-effort)
- `src/utils/fireProximity.ts` — pure point-to-perimeter distance math flagging results within 10 mi of an active fire; driven by `src/hooks/useFireProximity.ts`, which fetches NIFC around the result set after each analysis (independent of the overlay toggle, best-effort)

## CI/CD pipeline

See [`docs/CICD.md`](docs/CICD.md) for the full end-to-end flow with diagrams (bluebird → bluebird-helm → Kubernetes-Manifests → Argo CD / Argo Rollouts, plus Docker Hub, Artifact Hub, and the PR preview environments). The summary below covers this repo's workflows.

**PR checks** (`pr.yml`): runs on all non-main branches and PRs → TypeScript typecheck + Vitest, ruff lint, pytest (backend tests), Docker build (no push).

**Release** (`release.yml`): triggers on merge to `main` → GitVersion calculates SemVer from conventional commits → builds and pushes `zimmertr/bluebird:<semver>` to Docker Hub → creates GitHub release → updates `kustomization.yml` in the `zimmertr/Kubernetes-Manifests` repo, which ArgoCD auto-syncs.

**GitVersion** (`GitVersion.yml`): Mainline mode. Commit prefix mapping:
- `feat!` / `BREAKING CHANGE:` → major bump
- `feat:` → minor bump
- `fix`, `perf`, `refactor`, `chore`, `docs`, `style`, `test`, `ci` → patch bump

## Kubernetes deployment

Manifests live in a separate repo (`zimmertr/Kubernetes-Manifests`) under `public/bluebird/`. ArgoCD picks them up automatically. Stack uses Argo Rollouts (canary), Istio VirtualService/Gateway, and cert-manager for `bluebirdforecast.com`. The release pipeline updates the manifest tag automatically — manual manifest edits are only needed for configuration changes (e.g., `LOG_LEVEL` env var).

## Adding a new destination type

1. Add the type to `DestinationType` enum in `backend/app/models.py`
2. Add an Overpass QL query to `_QUERIES` in `backend/app/services/osm.py` and add the type to `_IMPLEMENTED`
3. Add the corresponding option in the frontend `ControlPanel.tsx`
