# Bluebird

I do a lot of hiking and mountaineering in the Pacific Northwest, where the weather makes or breaks a trip. Deciding *where* to go on a given weekend usually means opening a dozen forecast tabs, cross-referencing them against a map, and squinting at which trailhead or summit is going to dodge the rain. Bluebird does that comparison for me.

You draw a polygon on a map, pick a destination type and a forecast window, and get back a ranked table of every named destination inside that polygon, sorted driest first. Each row links out to Windy for a visual overview. No account, no API keys, nothing to sign up for.

Bluebird is live at [bluebirdforecast.com](https://bluebirdforecast.com).

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
- [Roadmap](#roadmap)
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

### Find a Place (optional)

The search box at the top-left of the map recenters on any named place (a peak, city, lake, river, or trailhead) or on an exact coordinate pair. Type a name like `Mt Whitney` or `Mt Whitney, ca`, or coordinates like `36.57862, -118.29107` (parentheses and space-separated forms work too), then press Enter. Point features get a roughly 10 mile view; larger features like cities, parks, and rivers are framed whole. An amber pin marks the result and stays out of the way of polygon drawing. Search is powered by [Nominatim](https://nominatim.org), so it works for anything OSM knows about, including places Bluebird can't analyze yet.

### Step 1: Draw a Search Area

Click **Draw Polygon** in the sidebar. Your cursor becomes a crosshair, and each click on the map drops a point. The polygon previews live as you add points.

- You need at least 3 points before Analyze turns on.
- The estimated bounding-box area is shown in km² as you draw.
- Drawing stays editable after you Analyze. Drag a vertex to move it, drag a midpoint handle to add one, or click a vertex to remove it, then Analyze again.
- Click **Clear** at any time to throw the polygon away and start over.

There is no "Finish Polygon" button. Once you have 3 or more points, click **Analyze** and the polygon closes itself.

### Step 2: Choose a Destination Type

| Type | OSM Query | Status |
|---|---|---|
| Peaks | `natural=peak` (named nodes) | Implemented |
| Trailheads | `highway=trailhead` (named nodes/ways) | Implemented |
| Lakes | `natural=water` + `water=lake` (named nodes/ways/relations) | Implemented |
| Custom (CSV) | User-supplied coordinates | Implemented |

For the Custom type, paste a CSV of your own coordinates:

```
# Lines beginning with # are ignored
Name,Latitude,Longitude,Elevation_ft
Mt Rainier,46.8529,-121.7604,14411
Mt Adams,46.2024,-121.4909,12281
Glacier Peak,48.1122,-121.1139,10541
```

Elevation is optional. Leave it out and that field is simply blank in the results.

### Step 3: Set a Forecast Window

Pick a start and end datetime. Open-Meteo provides hourly forecasts up to 16 days ahead and about 90 days of history, so the date pickers are constrained to that range and a window outside it disables Analyze with an explanation. Everything is entered in your local browser time and converted to UTC for the API.

Air quality (PM2.5 AQI) forecasts run shorter, because the underlying CAMS model only reaches about 5 days out. Windows past that still analyze fine. The AQI columns just show a blank for hours beyond the horizon, and the app notes this next to the date inputs.

### Step 4: Set Max Results

The default is 10 and the maximum is 200. The backend fetches weather for *every* named destination in the polygon (after the optional elevation filter) and returns the top N by the selected ranking. There is no sampling, so the winners really are the extremes of the area. Analyses are capped at 1,000 destinations. Past that, the app asks you to draw a smaller polygon or narrow the elevation range rather than silently truncating.

### Step 5: Analyze

Click **Analyze**. Results appear in a sortable table below the map and as color-coded markers on the map itself.

Marker colors follow total precipitation:

| Color | Precip Total |
|---|---|
| Green | 0.01" or less |
| Lime | 0.01" to 0.10" |
| Yellow | 0.10" to 0.25" |
| Orange | 0.25" to 0.50" |
| Red | more than 0.50" |

Click a marker for a popup with rank, precipitation, wind, temperature, and PM2.5 AQI. Click a destination name in the table to open Windy centered on that spot with the rain overlay. When you sort by AQI instead, the marker thresholds switch to the US EPA category boundaries (50 / 100 / 150 / 200).

### Results Table

Click any column header to sort by it, ascending or descending. By default the table follows the **Rank Results By** selection, for example lowest total precipitation for driest-first.

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

### `POST /api/analyze`

Runs a destination query and returns weather-ranked results.

Request body:

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

For `destination_type: "custom"`, drop `polygon` and send `custom_destinations` instead:

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

Response:

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

`aqi_avg` and `aqi_max` are PM2.5 US AQI values over the window. They come back `null` when the window falls past the roughly 5-day air-quality horizon, or when the best-effort air-quality fetch fails. An air-quality outage never fails the analysis.

Error responses:

| Code | Condition |
|---|---|
| 400 | `start_datetime` is at or after `end_datetime`, the `destination_type` isn't implemented, or `custom_destinations` is missing for a custom request |
| 422 | Validation failure: polygon too large, limit out of range, or a window outside the servable window (about 90 days past to 16 days ahead) |
| 502 | Overpass is unreachable across all mirrors, or Open-Meteo fails |

## Architecture

Bluebird is one FastAPI service that also serves the built React SPA as static files. A browser talks only to `POST /api/analyze`, and everything else the app needs it fetches from free, keyless public APIs.

When a request comes in, the backend:

1. Validates the polygon area.
2. Queries the Overpass API for named OSM features, falling back across three mirrors if the first is down.
3. Batches the matched destinations into Open-Meteo weather and air-quality requests, all fired concurrently with `asyncio.gather`.
4. Sorts by the requested metric and returns the top N.

The whole thing builds as a single multi-stage Docker image:

- Stage 1 runs `node:22-alpine` to `npm run build` the SPA.
- Stage 2 runs `python:3.12-slim` with uvicorn, serving the API and the built SPA together.

None of the external APIs need a key:

- **Overpass** handles the OSM feature queries. Three public endpoints are tried in order: `overpass-api.de`, then `overpass.kumi.systems`, then `maps.mail.ru`.
- **Open-Meteo** provides the hourly forecast and air-quality data, batched up to 50 locations per request.
- **OpenFreeMap** serves the vector map tiles.

## Data Sources

| Source | Usage | Cost | Auth |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org) via [Overpass API](https://overpass-api.de) | Destination names, coordinates, elevation | Free | None |
| [Open-Meteo](https://open-meteo.com) | Hourly precipitation, temperature, wind | Free (non-commercial) | None |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) ([CAMS](https://atmosphere.copernicus.eu/) data) | Hourly PM2.5 US AQI | Free (non-commercial) | None |
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

## Roadmap

- [x] Additional destination types (trailheads and lakes, queried from OSM like peaks)
- [x] Air quality (PM2.5), useful during wildfire smoke season
- [ ] Historical analysis by switching to the Open-Meteo archive endpoint for past dates
- [ ] Saved searches in LocalStorage for polygons and settings
- [ ] CSV export of results
- [ ] Mountain-forecast.com links as an alternative hotlink for summit-specific forecasts

## License

Bluebird is free software licensed under the [GNU General Public License v3.0 or later](LICENSE). You can redistribute and modify it under those terms. It comes with no warranty. See the [LICENSE](LICENSE) file for the full text.
