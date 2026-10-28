# Configuration

Configuration is handled through environment variables passed to the container.

```yaml
services:
  bluebird:
    build: .
    ports:
      - "8000:8000"
    environment:
      - LOG_LEVEL=TRACE   # the repo's compose file runs verbose; production runs INFO
    restart: unless-stopped
```

To override it without editing the file:

```bash
LOG_LEVEL=WARNING docker compose up -d
```

`LOG_LEVEL` is read at container startup, so changing it needs no rebuild.

The rate limiting and upstream budgets are tunable the same way. While the
database below is up and writable, the per-client limits, the Nominatim gate
and the Open-Meteo budgets each count once for the whole deployment (#760).
Without it they are enforced per backend instance, so behind a multi-replica
deployment the effective ceiling is roughly the value times the replica count
(documented in detail in [`TRAFFIC.md`](TRAFFIC.md)). The fourteen `RATE_LIMIT_*` defaults below
repeat what a running deployment publishes under `limits.rate` in
`GET /api/capabilities`; read the endpoint for the values in force, and this
table for what each knob means:

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOG_LEVEL` | `WARNING` | Log verbosity: `TRACE`, `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`. |
| `METRICS_PORT` | `9464` | Port the Prometheus metrics server listens on. Its own port rather than a route on the app, so the metrics surface is never publicly routable (the production gateway's allowlist covers `/api/*` only). `0` disables it. |
| `RATE_LIMIT_ANALYZE_PER_MINUTE` | `12` | Sustained analyze requests per client address per minute, shared by `POST /api/analyze` and `/api/analyze/stream`. `0` disables the limit. |
| `RATE_LIMIT_ANALYZE_BURST` | `6` | Analyze requests an idle client may send back-to-back before the per-minute pace applies. |
| `RATE_LIMIT_DESTINATIONS_PER_MINUTE` | `30` | Sustained `POST /api/destinations` requests per client address per minute, its own bucket so discovery never starves analyses. `0` disables the limit. |
| `RATE_LIMIT_DESTINATIONS_BURST` | `10` | Destinations requests an idle client may send back-to-back. |
| `RATE_LIMIT_GEOCODE_PER_MINUTE` | `10` | Sustained `GET /api/geocode` requests per client address per minute. Sized together with the burst, so one address's first minute books fewer Nominatim gate slots than the gate opens in a minute (`NOMINATIM_MIN_INTERVAL_MS`); `test_ratelimit.py` holds the defaults to that. `0` disables the limit. |
| `RATE_LIMIT_GEOCODE_BURST` | `3` | Geocode requests an idle client may send back-to-back. |
| `RATE_LIMIT_WILDFIRES_PER_MINUTE` | `90` | Sustained `GET /api/wildfires` requests per client address per minute. The loosest bucket: it answers from a snapshot the pod already holds and reaches no upstream, and the map overlay refetches on every pan. `0` disables the limit. |
| `RATE_LIMIT_WILDFIRES_BURST` | `30` | Wildfire requests an idle client may send back-to-back. |
| `WILDFIRE_CACHE_TTL_S` | `600` | How long a fetched national wildfire-perimeter snapshot counts as current. Past it the snapshot is still served, with a refresh running behind the request. With the database up it is the shared refresh's interval instead: one pod fetches NIFC this often for every pod, whether or not anyone is looking. |
| `WILDFIRE_RETRY_AFTER_FAILURE_S` | `60` | How long a failed refresh suppresses the next attempt, so an upstream outage does not turn every request into its own retry. Per pod only: with the database up, a failed shared refresh waits a minute, doubling to an hour. |
| `RATE_LIMIT_FIRE_ACTIVITY_PER_MINUTE` | `90` | Sustained `GET /api/fire-activity` requests per client address per minute. As loose as the wildfire bucket and for the same reason: it answers from a snapshot the pod already holds and reaches no upstream, and the map layer refetches on every pan. A bucket of its own, so a reader with the perimeters and the detections both on spends neither's budget twice. `0` disables the limit. |
| `RATE_LIMIT_FIRE_ACTIVITY_BURST` | `30` | Fire activity requests an idle client may send back-to-back. |
| `RATE_LIMIT_SMOKE_PER_MINUTE` | `90` | Sustained `GET /api/smoke` requests per client address per minute. As loose as the wildfire bucket and for the same reason: it answers from a snapshot the pod already holds and reaches no upstream. `0` disables the limit. |
| `RATE_LIMIT_SMOKE_BURST` | `30` | Smoke requests an idle client may send back-to-back. |
| `SMOKE_CACHE_TTL_S` | `1800` | How long a fetched NOAA HMS smoke analysis counts as current. Longer than the wildfire TTL because HMS publishes about twice a day, so this bounds how soon a new pass is seen rather than how stale the answer is. Past it the snapshot is still served, with a refresh running behind the request. With the database up it is the shared refresh's interval, as for wildfires. |
| `SMOKE_RETRY_AFTER_FAILURE_S` | `60` | How long a failed smoke refresh suppresses the next attempt. Same contract as the wildfire twin above. |
| `RATE_LIMIT_CLOSURES_PER_MINUTE` | `90` | Sustained `GET /api/closures` requests per client address per minute, shared by both closure layers. As loose as the wildfire bucket and for the same reason: it answers from a snapshot the pod already holds and reaches no upstream. `0` disables the limit. |
| `RATE_LIMIT_CLOSURES_BURST` | `30` | Closure requests an idle client may send back-to-back. |
| `CLOSURE_CACHE_TTL_S` | `1800` | How long a fetched Forest Service closure snapshot (Regions 3, 4 and 6) counts as current. Longer than the wildfire TTL because the orders are edited by hand a few times a week. Past it the snapshot is still served, with a refresh running behind the request. With the database up it is the shared refresh's interval, as for wildfires. |
| `CLOSURE_RETRY_AFTER_FAILURE_S` | `60` | How long a failed closure refresh suppresses the next attempt. Same contract as the wildfire twin above. |
| `RATE_LIMIT_LANDMARKS_PER_MINUTE` | `90` | Sustained `GET /api/landmarks` requests per client address per minute. As loose as the wildfire bucket: it answers from the places table and reaches no upstream, and the map's trailhead and crag markers refetch on every pan from zoom 11. A bucket of its own because the markers are always on, so a pan with every overlay lit spends no overlay's budget on them. `0` disables the limit. |
| `RATE_LIMIT_LANDMARKS_BURST` | `30` | Landmark requests an idle client may send back-to-back. |
| `UPSTREAM_CONCURRENCY_WEATHER` | `4` | In-flight Open-Meteo weather batches, totalled across every concurrent analysis in the instance. A fairness knob: the weighted budgets below are the actual rate protection. Open-Meteo admits 5 open requests per address on each host and refuses the sixth (measured 2026-10-21), so keep this under 5; the weather and cloud batches share it, and the cap is per pod, so replicas sharing one egress address can still pass 5 together. |
| `UPSTREAM_CONCURRENCY_AQI` | `4` | Same cap for the air-quality API, whose host counts its own 5. |
| `UPSTREAM_WEIGHT_PER_MINUTE_WEATHER` | `550` | Spend budget for the weather API in Open-Meteo's own unit (weighted calls: one location in a batch is one call). While the database is up and writable every pod books into one window, so this is the most the whole deployment spends in any 60 seconds. Without it each pod holds the full safe rate rather than a share divided by replica count: one analysis is served end to end by a single pod, so the budget must cover one request's whole fan-out. A burst up to it passes at once, and batches past it pace instead of bursting. `0` disables pacing, which fails analyses rather than slowing them. |
| `UPSTREAM_WEIGHT_PER_MINUTE_AQI` | `550` | Same budget for the air-quality API, which meters separately: on 2026-10-21 it answered at the moment the weather host, its minute's 600 spent, refused. |
| `UPSTREAM_WEIGHT_MAX_WAIT_S` | `120` | A single paced batch that would wait longer than this sheds with a 503 instead, so a stampede cannot stack waiters without bound. An unkeyed analysis whose own batches would pass it on an idle pod (a long archive window with many destinations) is refused with a 400 before it fetches anything, so a 503 from this bound means other traffic, not the request itself. |
| `UPSTREAM_CONCURRENCY_OVERPASS` | `2` | In-flight Overpass queries per instance **per mirror**, matching each mirror operator's own per-IP slot policy (overpass-api.de documents 2). Overpass is asked only while the places table cannot answer: no database, a first fill not finished, or a connection that dropped mid-search. |
| `NOMINATIM_MIN_INTERVAL_MS` | `1200` | Minimum spacing between Nominatim calls while the database is up and writable, where every pod books into one gate. That is 50 searches a minute from the deployment's one address whatever the replica count, under Nominatim's absolute ~1 req/s policy with room for two calls that land closer together than they were booked, since each opens a fresh connection after its wait. Record: [0181](decisions/0181-shared-limits-and-nominatim-intervals.md) |
| `NOMINATIM_POD_MIN_INTERVAL_MS` | `10000` | The spacing each pod keeps when it runs its own gate: no database, a read-only preview, or a call the database could not answer. Every replica then has a gate of its own, so the spacing covers the most replicas the autoscaler runs: 10 s at ten replicas is one a second. |
| `UPSTREAM_BUDGET_WAIT_S` | `30` | How long an analysis may queue for a saturated upstream budget before shedding with a 503. The `Retry-After` a shed carries is a fixed 15 s and is not tunable. |
| `DATABASE_URL` | unset | The shared cache's PostgreSQL connection string (#760). Unset, the app runs as it did before it: discovery asks Overpass, and each pod fetches its own snapshots and keeps its own counters. The chart sets it from the Secret CloudNativePG writes for the database (`bluebird-database-app` in production, key `uri`). A database that is down or still starting counts as none until it answers, and the pod keeps trying, doubling its wait to a minute. Record: [0175](decisions/0175-shared-cache-in-postgresql.md) |
| `DATABASE_READ_ONLY` | unset | `true` for a deployment that reads another's database with a login that can only read, which is what the PR previews do with production's. Such a pod applies no migrations, runs no refresh, keeps its counters and its search cache to itself, and treats a schema older than its own as no database at all. Record: [0183](decisions/0183-previews-read-production-read-only.md) |
| `DATABASE_POOL_MAX` | `10` | The most connections one pod holds open to the database. The chart's database allows 200, which is ten replicas at ten plus room for the previews. |
| `REPLICATION_URL` | `https://planet.openstreetmap.org/replication/day` | Where the daily update reads OpenStreetMap's day change files and the `state.txt` that numbers them. |
| `APP_VERSION`, `APP_COMMIT`, `APP_BUILT_AT` | `dev` | Build identity, answered by `GET /api/version`. The release pipeline bakes them into the image as build args ([`CICD.md`](CICD.md)); a local build leaves all three at `dev`. |
| `PREVIEW_BANNER`, `PREVIEW_PR`, `PREVIEW_COMMIT` | unset | The PR preview banner, published by `GET /api/config` and drawn by the web app. The preview `ApplicationSet` sets them; nothing else should. |

## The planet fill

The planet fill (`fill/fill.py`) is a second image, `zimmertr/bluebird-fill`,
which the chart runs as a weekly CronJob to build the places table. It reads
variables of its own. The chart sets `DATABASE_URL` and `SCRATCH_DIR`; the rest
are for a run by hand.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | none, required | The same connection string the app reads. The fill renames and drops the places table, so the login must own it. |
| `SCRATCH_DIR` | `/scratch` | Where the planet is downloaded and processed. It needs the planet's size plus a tenth, which the fill checks as soon as the download's size is known. |
| `PLANET_URL` | `https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf` | The planet file to fill from, with its `.md5` read from beside it. A `file://` URL reads a local file, such as a regional extract, and skips the digest when no `.md5` sits beside it. |
| `REPLICATION_URL` | `https://planet.openstreetmap.org/replication/day` | Read for the newest day file's sequence, from which the fill works out where the daily update resumes. |
| `FORCE_FILL` | unset | `true` fills even when the table is current. Otherwise a run fills only when the table was never filled or was filled under another `RULES_VERSION`; on any other day it exits in seconds. |
| `SCHEMA_WAIT_S` | `600` | How long the fill waits for the app's migrations to create the schema, for a new database where the fill and the first pod start together. |

## Log Levels

Bluebird Forecast uses Python's standard `logging` module plus one custom level, `TRACE`. Set `LOG_LEVEL` (case-insensitive) to control verbosity. The default is `WARNING`.

Every line, at every level and from every logger, uvicorn's included, passes one formatter before it is written. It replaces the value of any `apikey=` in the line, a traceback included, with `[redacted]`, and writes a control character such as ESC as `\x1b`, so a request path cannot recolour or rewrite the terminal reading the log. Nothing configures it; it is always on.

| Level | Value | What is logged |
|---|---|---|
| `TRACE` | 5 | Raw Overpass query text, per-element OSM results, Open-Meteo request parameters, batch result counts. Very verbose, so reach for it only when debugging data issues. |
| `DEBUG` | 10 | Reserved for future fine-grained instrumentation. |
| `INFO` | 20 | Request summary (type, window, limit), Overpass endpoint used, OSM result count or the places table's, Open-Meteo batch sizes, final result range, and each day file the update applies. |
| `WARNING` | 30 | Overpass endpoint failures and fallbacks to mirror servers, a failed refresh of a shared source, and every call that fell back from the database to the pod's own path. This is the default. |
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

A `TRACE` run for a peaks query on the Overpass path, with no database or none filled yet, looks like this:

```
2026-06-28T08:00:01 [INFO    ] app.routes.analyze: Analyze request: types=peak start=2026-06-28T08:00 end=2026-06-29T20:00 sort=precip_total_in dir=asc limit=10 polygon=6pts area=4,180km2
2026-06-28T08:00:01 [INFO    ] app.services.osm: Querying OSM Overpass for type=peak
2026-06-28T08:00:01 [TRACE   ] app.services.osm: Overpass query:
[out:json][timeout:__SERVER_TIMEOUT_S__];
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
2026-06-28T08:00:05 [INFO    ] app.routes.analyze: Returning 10 result(s) sorted by precip_total_in asc (best: 0.012, worst: 0.089)
```
