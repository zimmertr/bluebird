# Bluebird — Weather Window Finder

A map-based tool for hikers and mountaineers to find the driest, calmest destinations within a geographic area during a specific forecast window.

Draw a polygon on a map, choose a destination type and forecast window, and receive a ranked table of destinations sorted by precipitation — driest first. Each destination links to Windy for a visual weather overview.

---

## Table of Contents

- [Overview](#overview)
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
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

Bluebird is not a recommendation engine. It does not decide what weather is "good" or "bad." It attaches objective forecast data to geographic features and lets you sort the results however you want.

**Example use case:** It's Thursday and the weekend forecast is rainy across Washington state. Which peaks inside the North Cascades receive the least total precipitation Saturday morning through Sunday evening?

---

## Quick Start

```bash
git clone https://github.com/zimmertr/bluebird
cd bluebird
docker compose up --build -d
```

Open `http://localhost:8000` in your browser.

To follow logs:

```bash
docker compose logs -f
```

---

## Local Development

Run the backend and frontend independently for hot-reload during development.

**Backend**

```bash
cd backend
pip install -r requirements.txt
LOG_LEVEL=TRACE uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173` and proxies `/api` requests to the backend at `:8000`.

---

## Using the App

### Step 1 — Draw a Search Area

Click **Draw Polygon** in the sidebar. Your cursor becomes a crosshair. Click on the map to place points. A live polygon preview renders as you add points.

- At least **3 points** are required before Analyze becomes active.
- The estimated bounding-box area is shown in km² as you draw.
- Click **Clear** at any time to discard the polygon and start over.
- Click **Redraw** after a completed polygon to replace it.

> There is no "Finish Polygon" step. Once you have 3+ points, click **Analyze** directly — the polygon closes automatically.

### Step 2 — Choose a Destination Type

| Type | OSM Query | Status |
|---|---|---|
| Peaks | `natural=peak` (named nodes) | ✅ Implemented |
| Trailheads | `highway=trailhead` | 🔜 Coming soon |
| Lakes | `natural=water` + `water=lake` | 🔜 Coming soon |
| Custom (CSV) | User-supplied coordinates | ✅ Implemented |

**Custom CSV format:**

```
# Lines beginning with # are ignored
Name,Latitude,Longitude,Elevation_ft
Mt Rainier,46.8529,-121.7604,14411
Mt Adams,46.2024,-121.4909,12281
Glacier Peak,48.1122,-121.1139,10541
```

Elevation is optional. If omitted, that field will be blank in results.

### Step 3 — Set a Forecast Window

Choose a start and end datetime. Open-Meteo provides hourly weather forecasts up to **16 days** ahead (and ~90 days of history); the date pickers are constrained to that range, and a window that falls outside it disables Analyze with an explanation. All times are treated as local browser time and converted to UTC for the API.

Air quality (PM2.5 AQI) forecasts are shorter — the underlying CAMS model only extends **~5 days** ahead. Windows beyond that still analyze fine; the AQI columns just show `—` for hours past the horizon, and the app notes this next to the date inputs.

### Step 4 — Set Max Results

Default: 10. Maximum: 200. The backend queries up to `limit × 5` candidates from OSM (capped at 200), fetches weather for all of them, then returns the top N driest.

### Step 5 — Analyze

Click **Analyze**. Results appear in a sortable table below the map and as color-coded markers on the map.

**Marker colors:**

| Color | Precip Total |
|---|---|
| Green | ≤ 0.01" |
| Lime | 0.01" – 0.10" |
| Yellow | 0.10" – 0.25" |
| Orange | 0.25" – 0.50" |
| Red | > 0.50" |

Click any marker for a popup with rank, precipitation, wind, temperature, and PM2.5 AQI. Click any **destination name** in the results table to open Windy centered on that location with the rain overlay. When sorting by AQI, the marker thresholds follow the US EPA category boundaries (50 / 100 / 150 / 200).

### Results Table

Click any column header to sort ascending or descending. Default sort is **Precip Total ascending** (driest first).

| Column | Description |
|---|---|
| Name | Destination name — links to Windy |
| Elev (ft) | Elevation in feet (from OSM `ele` tag) |
| Precip Total" | Sum of hourly precipitation over the window (inches) |
| Precip Avg"/hr | Average hourly precipitation rate (inches/hr) |
| Precip Max"/hr | Peak single-hour precipitation rate (inches/hr) |
| Temp Min/Max/Avg °F | Temperature range and average over the window |
| Wind Min/Max/Avg mph | Wind speed range and average over the window |

---

## Configuration

Configuration is done via environment variables passed to the Docker container.

### docker-compose.yml

```yaml
services:
  bluebird:
    build: .
    ports:
      - "8000:8000"
    environment:
      - LOG_LEVEL=WARNING   # change to DEBUG or TRACE during development
    restart: unless-stopped
```

To override without editing the file:

```bash
LOG_LEVEL=DEBUG docker compose up -d
```

No rebuild is required when changing `LOG_LEVEL` — it is read at container startup.

---

## Log Levels

Bluebird uses Python's standard `logging` module with one additional custom level: `TRACE`.

Set the `LOG_LEVEL` environment variable (case-insensitive). Default: `WARNING`.

| Level | Value | What is logged |
|---|---|---|
| `TRACE` | 5 | Raw Overpass query text, per-element OSM results, Open-Meteo request parameters, batch result counts. Very verbose — use only when debugging data issues. |
| `DEBUG` | 10 | Reserved for future fine-grained instrumentation. |
| `INFO` | 20 | Request summary (type, window, limit), Overpass endpoint used, OSM result count, Open-Meteo batch sizes, final result range (driest / wettest precip). |
| `WARNING` | 30 | Overpass endpoint failures and fallbacks to mirror servers. **Default level.** |
| `ERROR` | 40 | Unhandled exceptions and HTTP errors that cause a request to fail. |
| `CRITICAL` | 50 | Fatal startup errors. |

**Recommended settings:**

```bash
# Production
LOG_LEVEL=WARNING

# Debugging a specific request
LOG_LEVEL=INFO

# Diagnosing Overpass / Open-Meteo data issues
LOG_LEVEL=TRACE
```

**Example TRACE output for a peaks query:**

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

---

## Polygon Size Limit

To prevent excessive Overpass API load and respect public API rate limits, search polygons are limited to an approximate bounding-box area of **50,000 km²** (roughly half the size of Washington state).

This limit is enforced in two places:

- **Frontend:** The sidebar shows the live estimated area as you draw. If the area exceeds the limit, it turns red and Analyze is disabled with an explanation.
- **Backend:** The `POST /analyze` endpoint validates the polygon area and returns HTTP 422 if it exceeds the limit, even if the frontend check is bypassed.

To change the limit, update `MAX_POLYGON_AREA_KM2` in:
- `backend/app/models.py`
- `frontend/src/components/MapView.tsx`

The area displayed is a **bounding-box approximation**, not the exact polygon area. Actual queried area may be smaller for irregular polygons.

---

## API Reference

### `POST /api/analyze`

Runs a destination query and returns weather-ranked results.

**Request body:**

```json
{
  "polygon": {
    "type": "Polygon",
    "coordinates": [[[-121.5, 47.1], [-120.8, 47.1], [-120.8, 48.2], [-121.5, 47.1]]]
  },
  "destination_type": "peak",
  "start_datetime": "2026-06-28T08:00:00Z",
  "end_datetime": "2026-06-29T20:00:00Z",
  "limit": 10
}
```

For `destination_type: "custom"`, omit `polygon` and include `custom_destinations` instead:

```json
{
  "destination_type": "custom",
  "start_datetime": "2026-06-28T08:00:00Z",
  "end_datetime": "2026-06-29T20:00:00Z",
  "limit": 10,
  "custom_destinations": [
    { "name": "Mt Rainier", "latitude": 46.8529, "longitude": -121.7604, "elevation_ft": 14411 },
    { "name": "Mt Adams",   "latitude": 46.2024, "longitude": -121.4909, "elevation_ft": 12281 }
  ]
}
```

**Response:**

```json
{
  "results": [
    {
      "name": "Black Peak",
      "type": "peak",
      "latitude": 48.6341,
      "longitude": -120.8214,
      "elevation_ft": 8973,
      "osm_id": "node/123456",
      "precip_total_in": 0.012,
      "precip_avg_in_hr": 0.0005,
      "precip_max_in_hr": 0.004,
      "temp_min_f": 38.2,
      "temp_max_f": 55.1,
      "temp_avg_f": 46.8,
      "wind_min_mph": 3.1,
      "wind_max_mph": 18.4,
      "wind_avg_mph": 9.2,
      "aqi_avg": 42,
      "aqi_max": 58
    }
  ],
  "total_queried": 34
}
```

`aqi_avg` / `aqi_max` are PM2.5 **US AQI** values over the window. They are `null` when the window lies beyond the ~5-day air-quality forecast horizon or the (best-effort) air-quality fetch failed — an air-quality outage never fails the analysis.

**Error responses:**

| Code | Condition |
|---|---|
| 400 | `start_datetime` ≥ `end_datetime`; `destination_type` not yet implemented; `custom_destinations` missing for custom type |
| 422 | Validation failure (polygon too large; limit out of range; window outside the servable ~90-day-past to ~16-day-ahead range) |
| 502 | Overpass API unreachable across all mirrors; Open-Meteo API failure |

---

## Architecture

```
┌──────────────────────────────────────────┐
│  Browser                                 │
│                                          │
│  React + TypeScript + Vite               │
│  MapLibre GL (OpenFreeMap tiles)         │
│  Custom polygon drawing (native events)  │
│  Sortable results table                  │
└──────────────┬───────────────────────────┘
               │ POST /api/analyze
               ▼
┌──────────────────────────────────────────┐
│  FastAPI (Python 3.12)                   │
│                                          │
│  POST /api/analyze                       │
│    ├── Validate polygon area             │
│    ├── Query Overpass API (OSM)          │
│    │     └── 3 mirror fallbacks          │
│    ├── Batch Open-Meteo requests         │
│    │     └── asyncio.gather (parallel)   │
│    └── Sort + limit results              │
│                                          │
│  Serve built React SPA at /             │
└──────────────────────────────────────────┘

Single Docker container (multi-stage build):
  Stage 1: node:20-alpine  → npm run build
  Stage 2: python:3.12-slim → uvicorn
```

**External APIs (no keys required):**

- **Overpass API** — OSM feature queries. Three public endpoints tried in order:
  1. `overpass-api.de`
  2. `overpass.kumi.systems`
  3. `maps.mail.ru`
- **Open-Meteo** — Free hourly forecast data (weather + air quality endpoints). Supports batching up to 50 locations per request; all batches run concurrently via `asyncio.gather`.
- **OpenFreeMap** — Free vector map tiles. No account or API key needed.

---

## Kubernetes Deployment

Manifests live in `../Kubernetes-Manifests/public/bluebird/` and are picked up automatically by the ArgoCD `ApplicationSet` configured for the `public/` directory.

**Stack:**
- Argo Rollout with canary strategy (matches `personal-website` pattern)
- Istio VirtualService + Gateway
- cert-manager `Certificate` for `bluebirdforecast.com`
- Kustomize for manifest management

**To deploy a new image:**

1. Build and push:
   ```bash
   docker build -t zimmertr/bluebird:v1.0.0 .
   docker push zimmertr/bluebird:v1.0.0
   ```

2. Update the image tag in `kustomization.yml`:
   ```yaml
   images:
     - name: zimmertr/bluebird
       newTag: v1.0.0
   ```

3. Commit and push — ArgoCD auto-syncs within ~3 minutes.

**To set log level in K8s**, add an environment variable to the Rollout spec:

```yaml
containers:
  - name: bluebird
    image: zimmertr/bluebird
    env:
      - name: LOG_LEVEL
        value: "WARNING"
```

---

## Data Sources

| Source | Usage | Cost | Auth |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org) via [Overpass API](https://overpass-api.de) | Destination names, coordinates, elevation | Free | None |
| [Open-Meteo](https://open-meteo.com) | Hourly precipitation, temperature, wind | Free (non-commercial) | None |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) ([CAMS](https://atmosphere.copernicus.eu/) data) | Hourly PM2.5 US AQI | Free (non-commercial) | None |
| [OpenFreeMap](https://openfreemap.org) | Vector map tiles | Free | None |

Open-Meteo weather forecasts cover up to 16 days ahead; air-quality forecasts (CAMS) cover ~5 days and are regional (~11–25 km grid) rather than per-peak. Historical data beyond the ~90-day window would require the [Open-Meteo Historical API](https://open-meteo.com/en/docs/historical-weather-api) (different endpoint, not currently implemented).

---

## Roadmap

- [ ] **Additional destination types** — Trailheads, Lakes (OSM queries are written; just needs enabling)
- [x] **Air quality (PM2.5)** — Open-Meteo Air Quality API, useful during wildfire smoke season
- [ ] **Historical analysis** — Switch to Open-Meteo archive endpoint for past dates
- [ ] **Saved searches** — LocalStorage persistence for polygons and settings
- [ ] **Export** — Download results as CSV
- [ ] **Mountain-forecast.com links** — Alternative hotlink for summit-specific forecasts

---

## License

Bluebird is free software licensed under the [GNU General Public License v3.0 or later](LICENSE). You may redistribute and modify it under those terms. It is distributed WITHOUT ANY WARRANTY; see the [LICENSE](LICENSE) file for the full text.
