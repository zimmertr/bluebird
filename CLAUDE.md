# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Bluebird is a map-based weather window finder for hikers and mountaineers, live at `bluebirdforecast.com`. Users draw a polygon on a map, pick a destination type and forecast window, and get a ranked table of destinations sorted by precipitation. No API keys are required — all external APIs (Overpass/OSM, Open-Meteo, OpenFreeMap, and NIFC for the optional wildfire overlay) are free and unauthenticated.

## Documentation

Prose lives in `docs/`. The README is an index, not a manual: it carries the
Summary, How It Works, Quick Start, the docs table, Support, and License, and
nothing else. Anything longer than a paragraph belongs on a page below, with
the README linking to it. It was split out of a 560-line README in #192
(issue #113); do not let it grow back.

| Page | What belongs there |
|---|---|
| [`docs/USAGE.md`](docs/USAGE.md) | The user-facing walkthrough: destinations, forecast windows, max results, Analyze, marker colors, the results table |
| [`docs/LIMITS.md`](docs/LIMITS.md) | The four caps (polygon area, candidates, rows, request pacing), why each exists, and the `429`/`502`/`503` mapping |
| [`docs/DATA.md`](docs/DATA.md) | Per-provider truth: what each source can and cannot tell you, its fair-use posture, and the data-quality caveats |
| [`docs/API.md`](docs/API.md) | HTTP API prose for callers: endpoints, worked examples, error handling |
| [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) | The env-var table and log levels |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the service is built, and the Kubernetes deployment |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Hot-reload setup and the test/lint commands (the public copy of the section below; keep the two in sync) |
| [`docs/TRAFFIC.md`](docs/TRAFFIC.md) | How requests reach the pod and what the pod calls out to: Cloudflare, rate limits, upstream budgets |
| [`docs/CICD.md`](docs/CICD.md) | The pipeline from merge to production, with diagrams |
| [`NOTICES.md`](NOTICES.md) | Third-party attribution, at the repo root: the data-provider half transcribes `frontend/src/utils/dataSources.ts` (change one, change both in the same PR), plus bundled-software licenses |
| `docs/images/` | README assets only (`screenshot.jpg` is the front-page shot) |

Two conventions hold across every page:

- **Never restate a numeric limit that `GET /api/capabilities` publishes.** Describe the shape and the reasoning, and point at the endpoint for the value. Prose copies drift: the split found three that already had (polygon cap, max results, CAMS grid). This is the whole point of issue #113.
- **A doc change ships in the PR that causes it.** Nothing here is CI-enforced, so these are the artifacts that rot silently.

## Development commands

**Backend (FastAPI, Python 3.14):**
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
docker run --rm -v "$PWD/backend":/app -w /app python:3.14-slim \
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

Two suites: the frontend's pure logic under Vitest (`frontend/src/utils/*.test.ts`, e.g. URL state serialization in `urlState.ts` and marker colors in `colors.ts`), and the backend under pytest (`backend/tests/`, covering weather/AQI aggregation, request validation, ranking/elevation filtering, upstream-error mapping, and the routes with the external APIs stubbed). CI validates via TypeScript typecheck, the Vitest unit tests, pytest, Python ruff lint, and a full Docker build followed by a Trivy vulnerability scan of the built image.

## Rules for every change

- **Ship tests with behavior.** Any change to the frontend, backend, or anything else testable adds or updates coverage in the same PR — Vitest under `frontend/src/utils/*.test.ts` for frontend logic, pytest under `backend/tests/` for the backend (both run in Docker; commands above). A behavior change without a matching test is incomplete.
- **Style through the design system, never ad hoc.** Every frontend type, color, radius, and surface decision composes the roles in `frontend/src/styles.ts` (`TEXT`, `PROSE`, `LINK`/`LINK_ACTION`, `RADIUS`, `SURFACE_*`, `BUTTON_*`, `FIELD`). If no role fits, add or derive one **there** — with its rationale in a comment and an assertion in `frontend/src/styles.test.ts` — rather than spelling one-off utilities at a call site; that drift is what #159–#165 spent five PRs unwinding. Colors must clear WCAG AA on the surface they actually land on (4.5:1 for text and placeholders, 3:1 for icons and UI boundaries; the measured slate-vs-background table lives in issue #165). Two Tailwind v4 facts shape this: competing color utilities resolve by stylesheet order, not class-list order (so a role's color cannot be overridden at a call site), and source files are scanned as raw text (so a class name quoted in any comment or test emits its CSS — `styles.test.ts` shows how to write around it).
- **Keep the CI/CD diagram current.** Any change that alters the deploy flow — a workflow in this repo or `bluebird-helm`, an image/chart/tag convention, or the `Kubernetes-Manifests` wiring — updates [`docs/CICD.md`](docs/CICD.md) in the same PR. That diagram spans two sibling repos (`bluebird-helm` and `Kubernetes-Manifests`), so flow changes made there come back here too; nothing enforces this automatically.
- **Regenerate the OpenAPI snapshot.** Any change to a route, a Pydantic model, a `Field(description=...)`, or a route decorator changes the API contract. Run `cd backend && python scripts/generate_openapi.py` and commit `backend/openapi.json`; `pr.yml` fails the PR otherwise. The snapshot exists so a contract change is visible in review instead of buried in Python.
- **Update the affected page in [`docs/`](docs/) in the same PR.** The Documentation table above says which page owns which topic: a new cap goes to `LIMITS.md`, a new env knob to `CONFIGURATION.md`, a provider caveat to `DATA.md`, a flow change to `USAGE.md`, an endpoint change to `API.md`. Nothing enforces this the way CI enforces the OpenAPI snapshot, so these are the artifacts that silently rot, and the README delegates to them so a stale page is what a new reader hits first. Check the worked examples, not just the prose: grep the docs for the fields you changed.
- **Keep the aggregation vectors in lockstep.** The browser reimplements the backend's weather/AQI aggregation (`frontend/src/utils/openMeteo.ts` ↔ `backend/app/services/weather.py`/`air_quality.py`), pinned by shared vectors. Any semantic change there: change the backend first, run `cd backend && python scripts/generate_weather_vectors.py`, `cp tests/data/weather_vectors.json ../frontend/src/utils/weather_vectors.json`, and mirror the change in the TypeScript port. Pytest fails on a stale backend copy, Vitest fails on a drifted port, and the `vectors` CI job fails if the two copies differ.

## Architecture

Single container, multi-stage Docker build:
- Stage 1: `node:26-alpine` builds the React SPA (`npm run build`) and provides the vendored `swagger-ui-dist` assets copied into `static/swagger-ui/`, so `/docs` loads nothing from a CDN
- Stage 2: `python:3.14-alpine` runs uvicorn and serves the built SPA as static files at `/` (alpine over slim so the shipped image carries none of Debian's perpetual no-fix CVEs)

The FastAPI backend handles `POST /api/analyze`, which:
1. Validates polygon area (bounding-box approximation, max 50,000 km²)
2. Queries Overpass API for **every** named OSM feature in the polygon, with no sampling (peaks, trailheads, and lakes; available types are gated by `IMPLEMENTED_TYPES` in `osm.py`, which `GET /api/capabilities` publishes), then drops candidates outside the optional elevation band (unknown elevations pass through). Discovery is cached ~10 minutes per (polygon, type). Analyses over `MAX_ANALYZE_PEAKS = 1_500` candidates refuse with a structured 400 carrying remedies (a computed elevation-floor suggestion; an explicit `top_by_elevation` opt-in analyzes the highest instead) — never silent truncation
3. Fetches hourly weather from Open-Meteo in batches of 50 (at most 4 in flight), **paced under weighted-call budgets** — Open-Meteo bills per location, not per request (`services/openmeteo_weight.py`); results are cached ~15 minutes per location+window (`services/cache.py`). **On this path** US AQI is fetched **lazily**: for the displayed rows only, unless `sort_by` is an AQI key, because the budget here is the pod's and shared across visitors. The browser path deliberately does the opposite — see the interaction model below. Either way AQI is best-effort: failures and the short horizon degrade to `null` AQI, never fail the analysis (weather forecasts reach ~16 days, air quality only ~5). Upstream 429s are parsed (minutely resumes automatically; hourly/daily stop honestly)
4. Ranks by `sort_by` + `sort_desc` and returns the top `limit` rows (nullable AQI sort keys push `None` last in either direction)

**The interaction model: the Analyze button is a spend boundary, not ceremony.** Knobs split by whether a change needs new upstream data:

- **Data knobs — polygon, destination type, forecast window/dates — keep the explicit commit.** Each is a real fan-out against donated free APIs, and a live-updating date drag would 429 the exploring user against their own limit.
- **Presentation knobs — sort, limit, and *narrowing* the elevation band — apply live, with no fetch.** The browser holds the **full ranked field** before the `limit` cut (`universe` in `useAnalyze.ts`), so these are pure re-presentation of held data. `utils/present.ts` is the single derivation (band → removals → rank → cut) that every surface reads, so the table, the markers, the legend, and the "showing N of M" count cannot disagree about which rows are displayed.
- **The data snapshot is refined, not broken.** `analyzed` still pins what was *fetched* — the window, the mode, and the band the field was discovered under. Live sort and limit re-present that snapshot; they never mutate it. So a re-analysis at a new forecast window still ranks every candidate the analysis saw rather than the handful that survived the last cut.
- **Widening the elevation band is a data knob**, because the held field was discovered under the narrower one. `bandNarrows` is the predicate; it also decides whether × removals survive (a narrowing keeps them, a widening starts a fresh report).
- **The server SSE fallback sends only trimmed rows**, so `universe` is `null` on that path and every knob reverts to committing. Treat "no universe" as a real state, never as "the displayed rows are the whole field". `commitNeeded` surfaces a cue naming the reason whenever a knob stops being live, so the controls never go quiet unexplained.
- **The browser fetches AQI for the whole field, concurrently with weather** — the opposite of the server path above, and deliberately so. Open-Meteo bills weighted calls *per service*, so air quality spends a per-visitor quota the weather fetch cannot touch, and overlapping the two costs no extra wall clock. That is what makes an AQI ranking a presentation knob rather than another Analyze.

**Key constraints shared between frontend and backend:** `MAX_POLYGON_AREA_KM2 = 100_000` is defined in both `backend/app/models.py` and `frontend/src/components/MapView.tsx`, and `MAX_ANALYZE_PEAKS = 1_500` is mirrored as `MAX_ANALYZE_DESTINATIONS` in `frontend/src/utils/clientAnalyze.ts` (the browser enforces it for analyses that never touch the server, and reads the live value from `/api/capabilities` otherwise) — keep each pair in sync. The Open-Meteo weighted-call formula is a third mirrored pair: `backend/app/services/openmeteo_weight.py` ↔ `callWeight` in `frontend/src/utils/openMeteo.ts`. All capacity math is written in weighted calls (one location in a batch = one call), never HTTP requests — pricing spend in requests is the unit error behind the 2026-07-29 rate-limit incident (issue #180).

**Backend layout:**
- `app/main.py` — FastAPI app + OpenAPI metadata (tags, description), logging setup (includes custom `TRACE` level at value 5), self-hosted Swagger UI at `/docs`, static file mount. `docs_url`/`redoc_url` are `None` in the **constructor**: `FastAPI.setup()` registers those routes at the end of `__init__`, so assigning them afterward has no effect
- `app/version.py` — build identity read from `APP_VERSION`/`APP_COMMIT`/`APP_BUILT_AT`, baked by the Dockerfile; `"dev"` everywhere else
- `app/models.py` — Pydantic request/response models, polygon area validation, and the limit constants `/api/capabilities` publishes
- `app/ratelimit.py` — per-client token buckets (429 + Retry-After, enforced as route dependencies on analyze/geocode) and pod-wide upstream budgets/gates (queue then shed 503; best-effort AQI degrades to null instead). In-memory per pod by design (~replicas × the configured ceiling); env knobs documented in the `docs/CONFIGURATION.md` table and published by `/api/capabilities` under `limits.rate`. Traffic/limits changes update [`docs/TRAFFIC.md`](docs/TRAFFIC.md) and [`docs/LIMITS.md`](docs/LIMITS.md) in the same PR
- `app/routes/analyze.py` — single route handler
- `app/routes/version.py`, `app/routes/capabilities.py` — build identity and the machine-readable limits/feature contract
- `app/routes/destinations.py` — `POST /api/destinations`: discovery without forecasts (the SPA's only per-analysis server call; shares the analyze rate-limit bucket)
- `app/routes/notfound.py` — `/api` catch-all returning a JSON 404 (or a 405 with `Allow`) instead of letting unknown API paths fall into the SPA static mount. Must stay the **last** router registered under `/api`
- `scripts/generate_openapi.py` — writes/verifies the committed `backend/openapi.json`
- `scripts/generate_weather_vectors.py` — regenerates `tests/data/weather_vectors.json` from the reference aggregation (see the vectors rule above)
- `app/services/osm.py` — Overpass query with 3-endpoint fallback chain; `IMPLEMENTED_TYPES` gates which destination types are discoverable
- `app/services/weather.py` — Open-Meteo batched parallel fetch, paced by the pod's weighted budget, cached per location+window
- `app/services/air_quality.py` — Open-Meteo air-quality (US AQI) batched fetch, best-effort, same pacing/cache; the first 429 short-circuits its remaining batches
- `app/services/openmeteo_weight.py` — the weighted-call accounting every capacity number uses
- `app/services/cache.py` — TTL/LRU caches: discovery (~10 min per polygon+type) and per-location forecasts (~15 min)
- `app/ratelimit.py` — per-client token buckets (analyze / destinations / geocode), pod-wide in-flight budgets, and the `WeightedBudget` pacers

**Frontend layout:**
- `src/App.tsx` — root component
- `src/components/MapView.tsx` — MapLibre GL map, polygon drawing with native pointer events
- `src/components/ControlPanel.tsx` — sidebar controls
- `src/components/SearchBox.tsx` — floating map search (Nominatim place lookup + local coordinate parsing; Enter-to-search only, per Nominatim's no-autocomplete policy)
- `src/components/ResultsTable.tsx` — sortable results table, and *only* the rendering of one: it receives its rows already in display order. A header click on one of the four `RANKING_KEYS` re-ranks the **whole field** through the panel knob (so it means the same thing as the ranking picker); the detail columns reorder the rows on screen, as they always have, but that order is `App.tsx` state (`detailSort`) so the CSV export can leave in it
- `src/hooks/useAnalyze.ts` — analysis orchestration: the client-side path first (discovery via `POST /api/destinations`, then browser Open-Meteo fetches), falling back to the `POST /api/analyze/stream` SSE pipeline only when Open-Meteo is unreachable from the browser
- `src/utils/openMeteo.ts` — browser Open-Meteo fetch + the aggregation ports of `weather.py`/`air_quality.py`, pinned to the backend by `weather_vectors.json` (round-half-even, naive-UTC stamp parsing, zip-vs-series loop asymmetry all deliberate)
- `src/utils/clientAnalyze.ts` — ports of the analyze route's merge/align/assemble/rank/filter-elevation helpers + the browser-side candidate cap; returns the trimmed `response` **and** the full ranked `universe`, and owns `refreshEchoRows` (which field a re-analysis re-ranks, and how removals apply to it)
- `src/utils/present.ts` — the one derivation from held field + live knobs to displayed rows (`presentResults`), plus `bandNarrows` (is this elevation band a subset of the analyzed one?) and `commitNeeded` (which knob has stopped applying live, and why)
- `src/utils/tableColumns.ts` — the column set itself (`COLUMNS`, with an optional `csv` projection where a display formatter would be unparseable) and the one derivation of which columns a report shows (`displayedColumns` = point-sample collapse, then ranked group lifted to the front). The table and the CSV export both read it, so a file's columns cannot disagree with the screen's
- `src/utils/resultsCsv.ts` — the displayed report as a file (`buildResultsCsv`, `csvFilename`). Pure and DOM-free so it is testable under the node-env Vitest; the Blob and anchor live in `App.tsx`. Takes rows already in display order and columns already resolved — it re-derives nothing, because a second answer to "what is on screen" is the bug `present.ts` exists to prevent. A `null` fire map **drops the wildfire column** instead of writing it blank: on screen an empty flag column self-corrects when the ⚠️ arrives a moment later, but a file is read detached from the app, where a column of blanks asserts that every row was checked and cleared
- `src/utils/forecastWindow.ts` — window normalization twin of `models.py` (point sample → floored hour + 1 min; horizon checks)
- `src/types.ts` — TypeScript types mirroring backend Pydantic models
- `src/styles.ts` — the type ramp plus the surface/button/field roles; components compose these instead of picking sizes and colors at the call site (`src/styles.test.ts` enforces it)
- `src/metrics.ts` — the one vocabulary for the four metrics: nouns (spelled out), units, aggregates (their short forms: `Avg`/`Min`/`Max`), and the composers behind the results header and table headers; the map legend titles itself with the bare noun and leaves the hour/window framing to those surfaces. **A surface never spells a metric's name itself** — `src/metrics.test.ts` reads the consuming files as text and fails on a literal `Precip`/`Temp`/`Avg`
- `src/utils/colors.ts` — marker/cell color thresholds per sortable metric (precip, wind, temp, AQI)
- `src/utils/geocode.ts` — coordinate parsing, Nominatim client, and bounds math: search-view bounds for the search box plus the multi-point fit that frames pasted/restored CSV lists
- `src/utils/wildfires.ts` — NIFC WFIGS query builder + popup formatting for the optional wildfire overlay (fetched client-side by viewport; US-only, keyless, best-effort)
- `src/utils/fireProximity.ts` — pure point-to-perimeter distance math flagging results within 10 mi of an active fire, plus `pointsKey` (the order-independent identity of a destination *set*); driven by `src/hooks/useFireProximity.ts`, which fetches NIFC once per analysis around the whole analyzed field, not the displayed rows — those are re-derived on every live knob change, and keying off them would mean a NIFC query per twiddle (independent of the overlay toggle). The hook keys its effect on `pointsKey`, not the array reference, or a re-rank aborts the request in flight and refetches the same question. It returns a **status** (`idle`/`loading`/`ready`/`unavailable`) beside the warnings, retries a failed lookup, and logs the caught error: every failure mode used to collapse into one empty map, so the feature's failure was indistinguishable from its all-clear. `ready` + empty means checked and nothing near; `unavailable` means the caller must not imply either

## CI/CD pipeline

See [`docs/CICD.md`](docs/CICD.md) for the full end-to-end flow with diagrams (bluebird → bluebird-helm → Kubernetes-Manifests → Argo CD / Argo Rollouts, plus Docker Hub, Artifact Hub, and the PR preview environments). The summary below covers this repo's workflows.

**PR checks** (`pr.yml`): runs on all non-main branches and PRs → TypeScript typecheck + Vitest, ruff lint, pytest (backend tests), hadolint, Docker build (no push) + Trivy image scan (sticky PR comment; fails only on *fixable* Critical/High vulns).

**Scheduled image scan** (`image-scan.yml`): weekly Trivy scan of the latest released `zimmertr/bluebird` image → SARIF to the GitHub Security tab; the job goes red (→ failure email) only on fixable Critical/High vulns. Remediation: merge the open Dependabot base-image PR to cut a patch release on a fresh base.

**Release** (`release.yml`): triggers on merge to `main` → GitVersion calculates SemVer from conventional commits → builds and pushes a multi-arch `zimmertr/bluebird:<semver>` (amd64 + arm64, with SBOM/provenance attestations) to Docker Hub → creates GitHub release → updates `kustomization.yml` in the `zimmertr/Kubernetes-Manifests` repo, which ArgoCD auto-syncs.

**GitVersion** (`GitVersion.yml`): Mainline mode. Commit prefix mapping:
- `feat!` / `BREAKING CHANGE:` → major bump
- `feat:` → minor bump
- `fix`, `perf`, `refactor`, `chore`, `docs`, `style`, `test`, `ci` → patch bump

## Kubernetes deployment

Manifests live in a separate repo (`zimmertr/Kubernetes-Manifests`) under `public/bluebird/`. ArgoCD picks them up automatically. Stack uses Argo Rollouts (canary), Istio VirtualService/Gateway, and cert-manager for `bluebirdforecast.com`. The release pipeline updates the manifest tag automatically — manual manifest edits are only needed for configuration changes (e.g., `LOG_LEVEL` env var).

## Adding a new destination type

1. Add the type to `DestinationType` enum in `backend/app/models.py`
2. Add an Overpass QL query to `_QUERIES` in `backend/app/services/osm.py` and add the type to `IMPLEMENTED_TYPES` (which `GET /api/capabilities` publishes, so no further change is needed to advertise it)
3. Add the corresponding option in the frontend `ControlPanel.tsx`
