# Bluebird

I do a lot of hiking and mountaineering in the Pacific Northwest, where the weather makes or breaks a trip. Deciding *where* to go on a given weekend usually means opening a dozen forecast tabs, cross-referencing them against a map, and squinting at which trailhead or summit is going to dodge the rain. Bluebird does that comparison for me.

You draw a polygon on a map, pick a destination type and a forecast window, and get back a ranked table of every named destination inside that polygon, sorted driest first. Each row links out to Windy for a visual overview. No account, no API keys, nothing to sign up for.

Bluebird is live at [bluebirdforecast.com](https://bluebirdforecast.com). Planned and outstanding work is tracked on the [GitHub issue board](https://github.com/zimmertr/bluebird/issues).

It is not a recommendation engine. It does not decide what weather is "good" or "bad." It attaches objective forecast data to geographic features and lets you sort the results however you like. A typical question it answers: it's Thursday, the weekend looks wet across Washington, so which peaks in the North Cascades see the least total precipitation from Saturday morning through Sunday evening?

## Table of Contents

- [Quick Start](#quick-start)
- [Local Development](#local-development)
- [Using the App](#using-the-app)
- [Configuration](#configuration)
- [Log Levels](#log-levels)
- [Polygon Size Limit](#polygon-size-limit)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Data Sources](#data-sources)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Support](#support)
- [License](#license)

## Quick Start

The whole app ships as a single Docker container. Clone it and bring it up:

```bash
git clone https://github.com/zimmertr/bluebird
cd bluebird
docker compose up --build -d
```

Then open `http://localhost:8000`. To follow the logs:

```bash
docker compose logs -f
```

## Local Development

Run the backend and frontend separately when you want hot-reload.

Backend:

```bash
cd backend
pip install -r requirements.txt
LOG_LEVEL=TRACE uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server comes up on `http://localhost:5173` and proxies `/api` requests to the backend on `:8000`.

## Using the App

### Step 1: Destinations

One analysis ranks a single set of destinations, which you define using one or all of the following methods.

#### a. Search by Name

The search box at the top-left of the map recenters on any named place (a peak, city, lake, river, or trailhead) or on an exact coordinate pair. Type a name like `Mt Whitney` or `Mt Whitney, ca`, or coordinates like `36.57862, -118.29107` (parentheses and space-separated forms work too), then press Enter. Point features get a roughly 10 mile view; larger features like cities, parks, and rivers are framed whole. An amber pin marks the result and stays out of the way of polygon drawing. A searched place registers as a destination (a neutral blue dot until analyzed) and competes in the same ranking as everything else on the next Analyze. Search is powered by [Nominatim](https://nominatim.org), so it works for anything OSM knows about, including places Bluebird can't analyze yet.

#### b. Search by Polygon

Click anywhere on the map to start drawing — each click drops a point, and the polygon previews live as you add them.

- You need at least 3 points before Analyze turns on.
- The estimated bounding-box area is shown in km² as you draw.
- Drawing stays editable after you Analyze. Drag a vertex to move it, drag a midpoint handle to add one, or click a vertex to remove it, then Analyze again.
- Click **Clear** at any time to throw the polygon away and start over.

There is no "Finish Polygon" button. Once you have 3 or more points, click **Analyze** and the polygon closes itself.

The **Find** picker controls what discovery looks for inside your polygon:

| Type | OSM Query | Status |
|---|---|---|
| Peaks | `natural=peak` (named nodes) | Implemented |
| Lakes | `natural=water` + `water=lake` (named nodes/ways/relations) | Implemented |
| Trailheads | `highway=trailhead` (named nodes/ways) | Implemented |

#### c. Search by Coordinates

Paste a CSV of your own coordinates to add them to the analysis — alongside whatever the polygon finds, or entirely on their own (no polygon needed):

```
# Lines beginning with # are ignored
46.8529,-121.7604,Mount Rainier
46.2024,-121.4909
48.1122,-121.1139,Glacier Peak
```

The format is `Lat,Lon` or `Lat,Lon,Name`, one per line; without a name the coordinates are used. Custom rows compete in the same ranked table as discovered destinations, and a custom row that duplicates a discovered one (same name or same coordinates) replaces it.

### Step 2: Forecast Window

Three ways to pick the time being analyzed:

- **Current Conditions** (the default) samples the hour you click Analyze. It needs no date input, so a fresh load can Analyze immediately.
- **Future Day/Time** samples a single chosen hour.
- **Multi-Hour Window** takes a start and an end, and aggregates across it: precipitation ranks by window total, wind, temperature, and AQI by window average.

Open-Meteo provides hourly forecasts up to 16 days ahead and about 90 days of history, so the date pickers are constrained to that range and a window outside it disables Analyze with an explanation. Each mode keeps its own inputs while another is selected, so switching back restores them. Everything is entered in your local browser time and converted to UTC for the API.

Air quality (AQI) forecasts run shorter, because the underlying CAMS model only reaches about 5 days out. Windows past that still analyze fine. The AQI columns just show a blank for hours beyond the horizon, and the app notes this next to the date inputs.

### Step 3: Set Max Results

The default is 100 and the maximum is 200. The backend fetches weather for *every* named destination in the polygon (after the optional elevation filter) and returns the top N by the selected ranking. There is no sampling, so the winners really are the extremes of the area. Analyses are capped at 1,000 destinations. Past that, the app asks you to draw a smaller polygon or narrow the elevation range rather than silently truncating.

### Step 4: Analyze

Click **Analyze**. Results appear in a sortable table below the map and as color-coded markers on the map itself.

Marker colors follow total precipitation:

| Color | Precip Total |
|---|---|
| Green | 0.01" or less |
| Lime | 0.01" to 0.10" |
| Yellow | 0.10" to 0.25" |
| Orange | 0.25" to 0.50" |
| Red | more than 0.50" |

Click a marker for a popup with rank, precipitation, wind, temperature, and AQI. Click a destination name in the table to open Windy centered on that spot with the rain overlay. When you sort by AQI instead, the marker thresholds switch to the US EPA category boundaries (50 / 100 / 150 / 200 / 300).

### Results Table

Click any column header to sort by it, ascending or descending. By default the table follows the **Result Ranking** selection, for example lowest total precipitation for driest-first. Hovering a row reveals a × at its end (always visible on touch screens) that removes the destination from the report — the rows below renumber, and a same-inputs re-Analyze keeps it gone; changing the destinations, window, ranking, or options starts a fresh report where it may return.

| Column | Description |
|---|---|
| Name | Destination name, links to Windy |
| Elev (ft) | Elevation in feet, from the OSM `ele` tag |
| Precip Total" | Sum of hourly precipitation over the window, in inches |
| Precip Avg"/hr | Average hourly precipitation rate |
| Precip Max"/hr | Peak single-hour precipitation rate |
| Temp Min/Max/Avg °F | Temperature range and average over the window |
| Wind Min/Max/Avg mph | Wind speed range and average over the window |

## Configuration

Configuration is handled through environment variables passed to the container.

```yaml
services:
  bluebird:
    build: .
    ports:
      - "8000:8000"
    environment:
      - LOG_LEVEL=WARNING   # bump to DEBUG or TRACE during development
    restart: unless-stopped
```

To override it without editing the file:

```bash
LOG_LEVEL=DEBUG docker compose up -d
```

`LOG_LEVEL` is read at container startup, so changing it needs no rebuild.

The rate limiting and upstream budgets are tunable the same way. Per-client
limits are enforced per backend instance, so behind a multi-replica deployment
the effective ceiling is roughly the value times the replica count (documented
in detail in [`docs/TRAFFIC.md`](docs/TRAFFIC.md)):

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOG_LEVEL` | `WARNING` | Log verbosity: `TRACE`, `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`. |
| `RATE_LIMIT_ANALYZE_PER_MINUTE` | `12` | Sustained analyze requests per client address per minute, shared by `POST /api/analyze` and `/api/analyze/stream`. `0` disables the limit. |
| `RATE_LIMIT_ANALYZE_BURST` | `6` | Analyze requests an idle client may send back-to-back before the per-minute pace applies. |
| `RATE_LIMIT_GEOCODE_PER_MINUTE` | `30` | Sustained `GET /api/geocode` requests per client address per minute. `0` disables the limit. |
| `RATE_LIMIT_GEOCODE_BURST` | `10` | Geocode requests an idle client may send back-to-back. |
| `UPSTREAM_CONCURRENCY_WEATHER` | `8` | In-flight Open-Meteo weather batches, totalled across every concurrent analysis in the instance. |
| `UPSTREAM_CONCURRENCY_AQI` | `8` | Same cap for the air-quality API. |
| `UPSTREAM_CONCURRENCY_OVERPASS` | `2` | In-flight Overpass queries per instance, matching overpass-api.de's per-IP slot policy. |
| `NOMINATIM_MIN_INTERVAL_MS` | `2000` | Minimum spacing between Nominatim calls per instance, honoring their ~1 req/s policy across replicas. |
| `UPSTREAM_BUDGET_WAIT_S` | `30` | How long an analysis may queue for a saturated upstream budget before shedding with a 503. |

## Log Levels

Bluebird uses Python's standard `logging` module plus one custom level, `TRACE`. Set `LOG_LEVEL` (case-insensitive) to control verbosity. The default is `WARNING`.

| Level | Value | What is logged |
|---|---|---|
| `TRACE` | 5 | Raw Overpass query text, per-element OSM results, Open-Meteo request parameters, batch result counts. Very verbose, so reach for it only when debugging data issues. |
| `DEBUG` | 10 | Reserved for future fine-grained instrumentation. |
| `INFO` | 20 | Request summary (type, window, limit), Overpass endpoint used, OSM result count, Open-Meteo batch sizes, final result range. |
| `WARNING` | 30 | Overpass endpoint failures and fallbacks to mirror servers. This is the default. |
| `ERROR` | 40 | Unhandled exceptions and HTTP errors that fail a request. |
| `CRITICAL` | 50 | Fatal startup errors. |

Rough guide:

```bash
# Production
LOG_LEVEL=WARNING

# Following a specific request
LOG_LEVEL=INFO

# Diagnosing Overpass or Open-Meteo data issues
LOG_LEVEL=TRACE
```

A `TRACE` run for a peaks query looks like this:

```
2026-06-28T08:00:01 [INFO    ] app.routes.analyze: Analyze request: type=peak window=2026-06-28T08:00→2026-06-29T20:00 limit=10
2026-06-28T08:00:01 [INFO    ] app.services.osm: Querying OSM Overpass for type=peak
2026-06-28T08:00:01 [TRACE   ] app.services.osm: Overpass query:
[out:json][timeout:60];
node["natural"="peak"]["name"](poly:"47.1 -121.5 48.2 -120.8 ...");
out;
2026-06-28T08:00:01 [INFO    ] app.services.osm: Trying Overpass endpoint: https://overpass-api.de/api/interpreter
2026-06-28T08:00:04 [INFO    ] app.services.osm: Overpass query succeeded via https://overpass-api.de/api/interpreter
2026-06-28T08:00:04 [TRACE   ] app.services.osm:   OSM element: Black Peak (48.6341, -120.8214) ele=2735.0
2026-06-28T08:00:04 [TRACE   ] app.services.osm:   OSM element: Mt. Arriva (48.5990, -120.8503) ele=2647.0
...
2026-06-28T08:00:04 [INFO    ] app.services.osm: OSM returned 34 named destination(s)
2026-06-28T08:00:04 [INFO    ] app.services.weather: Fetching Open-Meteo weather: 34 destination(s) across 1 batch(es)
2026-06-28T08:00:05 [TRACE   ] app.services.weather: Open-Meteo batch returned 34 result(s)
2026-06-28T08:00:05 [INFO    ] app.routes.analyze: Returning 10 result(s) (driest: 0.012", wettest: 0.089")
```

## Polygon Size Limit

Search polygons are capped at an approximate bounding-box area of 50,000 km², roughly half of Washington state. The cap keeps Overpass load reasonable and stays inside the public API rate limits.

The limit is enforced in two places so a bypassed frontend can't get around it:

- On the frontend, the sidebar shows the live estimated area as you draw. If it exceeds the cap, the number turns red and Analyze is disabled with an explanation.
- On the backend, `POST /analyze` validates the polygon area and returns HTTP 422 if it is too large.

The displayed value is a bounding-box approximation rather than the true polygon area, so an irregular polygon may actually query less than the number shown. To change the cap, update `MAX_POLYGON_AREA_KM2` in both `backend/app/models.py` and `frontend/src/components/MapView.tsx`. The two must stay in sync.

## API Reference

Everything the web app does is available over HTTP, with no API key, no account,
and no authentication.

- **Interactive reference:** [bluebirdforecast.com/docs](https://bluebirdforecast.com/docs)
- **OpenAPI 3.1 schema:** [bluebirdforecast.com/openapi.json](https://bluebirdforecast.com/openapi.json)
- **Guide with worked examples:** [`docs/API.md`](docs/API.md)

`/docs` is generated from the running code, so it cannot drift from actual
behavior. A copy of the schema is committed at
[`backend/openapi.json`](backend/openapi.json) and verified in CI.

| Endpoint | What it does |
| --- | --- |
| `POST /api/analyze` | Discover destinations, forecast each one, return a ranking. |
| `POST /api/analyze/stream` | The same analysis as Server-Sent Events, with progress. |
| `GET /api/capabilities` | Supported destination types, sort keys, and enforced limits. |
| `GET /api/version` | Which build is running: version, commit, build time. |
| `GET /api/geocode` | Place lookup by name, proxied to Nominatim. |
| `GET /healthz` | Liveness probe. |

Rank the peaks around Tiger Mountain by how dry the next two days look:

```bash
curl -s https://bluebirdforecast.com/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "polygon": { "type": "Polygon", "coordinates": [[
      [-122.03, 47.44], [-121.91, 47.44], [-121.91, 47.53],
      [-122.03, 47.53], [-122.03, 47.44]
    ]] },
    "destination_type": "peak",
    "forecast_mode": "current",
    "limit": 3
  }' | jq '.results[] | {name, precip_total_in}'
```

Bluebird enforces light per-address rate limits and an instance-wide budget on
its own upstream traffic; requests past them receive `429` or `503` with a
`Retry-After` header, and `GET /api/capabilities` publishes the numbers. Every
upstream it depends on is free, keyless, and run by people paying for it, so
please still keep polygons no larger than you need. See
[`docs/API.md`](docs/API.md) for the full guide, including custom destinations,
the streaming endpoint, and error handling, and [`docs/TRAFFIC.md`](docs/TRAFFIC.md)
for how traffic flows in and out of the deployment.

## Architecture

Bluebird is one FastAPI service that also serves the built React SPA as static files. The web app asks the server only for discovery — `POST /api/destinations`, one Overpass query — and fetches the Open-Meteo forecasts **directly from the browser**, so each visitor spends their own free-tier quota instead of the server's one shared egress IP. The browser's aggregation is a port of the backend's, pinned identical by shared test vectors (`weather_vectors.json`, checked by both suites and diffed in CI), and if Open-Meteo is unreachable from the browser the app falls back to `POST /api/analyze/stream`, the same server pipeline API callers use.

When a full server-side analysis runs (an API caller, or that fallback), the backend:

1. Validates the polygon area.
2. Queries the Overpass API for named OSM features, falling back across three mirrors if the first is down.
3. Batches the matched destinations into Open-Meteo weather and air-quality requests, all fired concurrently with `asyncio.gather`.
4. Sorts by the requested metric and returns the top N.

Because the browser talks to Open-Meteo itself (as it already does to NIFC for the wildfire overlay), those services see each visitor's IP address and the coordinates being analyzed — the same information the server would otherwise send on the visitor's behalf.

The whole thing builds as a single multi-stage Docker image:

- Stage 1 runs `node:26-alpine` to `npm run build` the SPA, and vendors Swagger UI's assets so `/docs` renders without reaching out to a CDN.
- Stage 2 runs `python:3.14-alpine` with uvicorn, serving the API and the built SPA together.

None of the external APIs need a key:

- **Overpass** handles the OSM feature queries. Three public endpoints are tried in order: `overpass-api.de`, then `overpass.kumi.systems`, then `maps.mail.ru`.
- **Open-Meteo** provides the hourly forecast and air-quality data, batched up to 50 locations per request.
- **OpenFreeMap** serves the vector map tiles.

## Data Sources

| Source | Usage | Cost | Auth |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org) via [Overpass API](https://overpass-api.de) | Destination names, coordinates, elevation | Free | None |
| [Open-Meteo](https://open-meteo.com) | Hourly precipitation, temperature, wind | Free (non-commercial) | None |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) ([CAMS](https://atmosphere.copernicus.eu/) data) | Hourly US AQI | Free (non-commercial) | None |
| [OpenFreeMap](https://openfreemap.org) | Vector map tiles | Free | None |
| [Nominatim](https://nominatim.org) | Map search box place lookup | Free (1 req/s max, no autocomplete) | None |

Open-Meteo weather forecasts reach about 16 days out. Air-quality forecasts from CAMS reach about 5 days and are regional (an 11 to 25 km grid) rather than resolved per-peak. Going further back than the roughly 90-day history window would mean switching to the [Open-Meteo Historical API](https://open-meteo.com/en/docs/historical-weather-api), which is a separate endpoint and isn't wired up yet.

## Kubernetes Deployment

Manifests live in a separate repo, `zimmertr/Kubernetes-Manifests`, under `public/bluebird/`, and ArgoCD picks them up automatically. The stack runs an Argo Rollout with a canary strategy, an Istio VirtualService and Gateway, and a cert-manager `Certificate` for `bluebirdforecast.com`, all managed with Kustomize.

For the complete CI/CD picture — how a merge flows through GitHub Actions, Docker Hub, the `bluebird-helm` chart, Artifact Hub, and on to Argo CD, plus how per-PR preview environments spin up — see [`docs/CICD.md`](docs/CICD.md), which has Mermaid diagrams of each path.

The release pipeline updates the image tag on merge to `main`, so a normal deploy needs nothing manual. To cut an image by hand:

```bash
docker build -t zimmertr/bluebird:v1.0.0 .
docker push zimmertr/bluebird:v1.0.0
```

Then point the tag at it in `kustomization.yml` and commit. ArgoCD syncs within a few minutes.

```yaml
images:
  - name: zimmertr/bluebird
    newTag: v1.0.0
```

To set the log level in the cluster, add the env var to the Rollout spec:

```yaml
containers:
  - name: bluebird
    image: zimmertr/bluebird
    env:
      - name: LOG_LEVEL
        value: "WARNING"
```

## Support

Email **hello@bluebirdforecast.com** about anything: a summit at the wrong elevation, a destination that should be listed and isn't, a privacy question, or a page that will not load. No GitHub account needed.

If you can describe how to reproduce something, the [issue board](https://github.com/zimmertr/bluebird/issues) is the better channel. Security vulnerabilities go through [GitHub's private advisory form](https://github.com/zimmertr/bluebird/security/advisories/new) rather than a public issue, as described in [SECURITY.md](SECURITY.md).

Two public pages carry the rest: [privacy](https://bluebirdforecast.com/privacy) for what Bluebird does with your data and which providers your requests reach, and [terms](https://bluebirdforecast.com/terms) for the license, the absence of any warranty, availability, and the licenses covering the data. Separate URLs because that is how they get asked for. Both render the same shared components, so the provider list and the contact address cannot drift between them.

## License

Copyright (c) 2026 TJ Zimmerman. Bluebird is source-available: the code is public, but it is not open source software.

Bluebird is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You may use, modify, self-host, and share it for any noncommercial purpose. Commercial use of any kind requires a separate license: contact [hello@bluebirdforecast.com](mailto:hello@bluebirdforecast.com). It comes with no warranty; see [LICENSE](LICENSE) for the full terms.
