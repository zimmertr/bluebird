# Configuration

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
in detail in [`TRAFFIC.md`](TRAFFIC.md)):

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOG_LEVEL` | `WARNING` | Log verbosity: `TRACE`, `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`. |
| `RATE_LIMIT_ANALYZE_PER_MINUTE` | `12` | Sustained analyze requests per client address per minute, shared by `POST /api/analyze` and `/api/analyze/stream`. `0` disables the limit. |
| `RATE_LIMIT_ANALYZE_BURST` | `6` | Analyze requests an idle client may send back-to-back before the per-minute pace applies. |
| `RATE_LIMIT_DESTINATIONS_PER_MINUTE` | `30` | Sustained `POST /api/destinations` requests per client address per minute, its own bucket so discovery never starves analyses. `0` disables the limit. |
| `RATE_LIMIT_DESTINATIONS_BURST` | `10` | Destinations requests an idle client may send back-to-back. |
| `RATE_LIMIT_GEOCODE_PER_MINUTE` | `30` | Sustained `GET /api/geocode` requests per client address per minute. `0` disables the limit. |
| `RATE_LIMIT_GEOCODE_BURST` | `10` | Geocode requests an idle client may send back-to-back. |
| `UPSTREAM_CONCURRENCY_WEATHER` | `4` | In-flight Open-Meteo weather batches, totalled across every concurrent analysis in the instance. A fairness knob: the weighted budgets below are the actual rate protection. |
| `UPSTREAM_CONCURRENCY_AQI` | `4` | Same cap for the air-quality API. |
| `UPSTREAM_WEIGHT_PER_MINUTE_WEATHER` | `180` | Instance spend budget for the weather API in Open-Meteo's own unit (weighted calls: one location in a batch is one call). 550 safe-rate divided across 3 replicas; batches pace instead of bursting. `0` disables pacing. |
| `UPSTREAM_WEIGHT_PER_MINUTE_AQI` | `180` | Same budget for the air-quality API, which meters separately. |
| `UPSTREAM_WEIGHT_MAX_WAIT_S` | `120` | A single paced batch that would wait longer than this sheds with a 503 instead: something is wedged, not merely busy. |
| `UPSTREAM_CONCURRENCY_OVERPASS` | `2` | In-flight Overpass queries per instance **per mirror**, matching each mirror operator's own per-IP slot policy (overpass-api.de documents 2). |
| `NOMINATIM_MIN_INTERVAL_MS` | `3500` | Minimum spacing between Nominatim calls per instance: 3 replicas at 3.5s ≈ 0.86 req/s aggregate, honoring their absolute ~1 req/s policy (2s per pod quietly exceeded it). |
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
