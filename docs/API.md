# Using the Bluebird API

Everything the web app does, it does through this API, and all of it is open to
you. There are no API keys, no accounts, and no authentication of any kind.

- **Interactive reference:** [bluebirdforecast.com/docs](https://bluebirdforecast.com/docs)
- **Machine-readable schema:** [bluebirdforecast.com/openapi.json](https://bluebirdforecast.com/openapi.json) (OpenAPI 3.1)

This page is the friendly tour. `/docs` is the authority: it is generated from
the running code, so it can never drift from what the service actually does. It
also has a "Try it out" button that sends real requests from your browser.

## A first request

Rank the peaks around Tiger Mountain by how dry the next two days look. The
window has to be computed rather than pasted, because a request outside the
forecast horizon is rejected:

```bash
START=$(date -u +%Y-%m-%dT%H:00:00Z)
END=$(date -u -d '+48 hours' +%Y-%m-%dT%H:00:00Z 2>/dev/null \
   || date -u -v+48H +%Y-%m-%dT%H:00:00Z)

curl -s https://bluebirdforecast.com/api/analyze \
  -H 'Content-Type: application/json' \
  -d "{
    \"polygon\": {
      \"type\": \"Polygon\",
      \"coordinates\": [[
        [-122.03, 47.44], [-121.91, 47.44], [-121.91, 47.53],
        [-122.03, 47.53], [-122.03, 47.44]
      ]]
    },
    \"destination_type\": \"peak\",
    \"start_datetime\": \"$START\",
    \"end_datetime\": \"$END\",
    \"limit\": 3
  }" | jq '.results[] | {name, precip_total_in, wind_avg_mph}'
```

Two things to notice. Polygon positions are `[longitude, latitude]`, which is
GeoJSON order and the reverse of how people usually say coordinates. And the
ring closes by repeating its first position.

## The endpoints

| Endpoint | What it does |
| --- | --- |
| `POST /api/analyze` | Discover destinations, forecast each one, return a ranking. The main event. |
| `POST /api/analyze/stream` | The same analysis as Server-Sent Events, with progress while it runs. |
| `GET /api/capabilities` | Supported destination types, sort keys, and every limit enforced. |
| `GET /api/version` | Which build is running: version, commit, build time. |
| `GET /api/geocode` | Place lookup by name, proxied to Nominatim. |
| `GET /api/config` | Deployment-specific UI settings. Internal to the web app. |
| `GET /healthz` | Liveness probe. Answers `GET` and `HEAD`. |

## Bringing your own destinations

You do not need a polygon. Send coordinates directly and skip discovery:

```json
{
  "destination_type": "custom",
  "start_datetime": "...",
  "end_datetime": "...",
  "custom_destinations": [
    { "name": "Mt Rainier", "latitude": 46.8529, "longitude": -121.7604, "elevation_ft": 14411 },
    { "name": "Mt Adams",   "latitude": 46.2024, "longitude": -121.4909, "elevation_ft": 12281 }
  ]
}
```

Custom destinations can also accompany a polygon, in which case they are merged
into whatever discovery finds. A custom row matching a discovered one by name or
by coordinates to five decimals replaces it.

Supplying `elevation_ft` is optional but worth doing: it is what lets a row take
part in a `min_elevation_ft` / `max_elevation_ft` filter. Rows with an unknown
elevation are never filtered out.

## Watching a long analysis

Discovery is never sampled. Every named destination inside the polygon gets a
real forecast, so a large polygon over dense terrain can take tens of seconds.
`POST /api/analyze/stream` takes an identical request body and streams progress:

```bash
curl -N https://bluebirdforecast.com/api/analyze/stream \
  -H 'Content-Type: application/json' -d @request.json
```

```
data: {"type": "status", "message": "Searching for Destinations…"}

data: {"type": "progress", "processed": 50, "total": 120, "percent": 41}

data: {"type": "result", "data": {"results": [...], "total_queried": 120}}
```

One important catch: **the HTTP status is always 200, even for failures.** The
connection is already open and streaming by the time most problems surface, so
check the stream, not the status code. Exactly one `result` or one `error` event
ends the stream.

## Discovering the limits

Rather than hardcoding constants from this page, ask the service:

```bash
curl -s https://bluebirdforecast.com/api/capabilities | jq
```

It reports the searchable destination types (narrower than the enum in the
schema, since not every modelled type is discoverable yet), the sort keys, the
maximum polygon area, the cap on destinations per analysis, the accepted `limit`
range, and how far forward and back a window may reach. Those values are read
from the same constants the validators enforce, so they cannot drift.

Air quality deserves a note. Its horizon is far shorter than the weather
forecast, so `aqi_avg` and `aqi_max` come back `null` for hours beyond it. That
is expected, not an error, and an air-quality outage never fails an analysis.

## When something goes wrong

| Status | Meaning |
| --- | --- |
| `400` | The request parsed but does not describe a runnable analysis. Inverted window, undiscoverable destination type, missing `custom_destinations`, or too many candidates. |
| `404` | No such endpoint. The body names the path and points at `/docs`. |
| `405` | Right path, wrong method. The `Allow` header lists what the path accepts. |
| `422` | Request validation failed. Polygon too large, `limit` out of range, or a window outside the servable horizon. |
| `502` | An upstream failed. Every Overpass mirror was unreachable, or the weather API did not answer. Transient, and worth retrying. |

A `422` carries Pydantic's per-field `detail` list. Every other error carries a
single plain-language `detail` string, written to be shown to a person as-is.

## Generating a client

The schema is OpenAPI 3.1, so the usual generators work without special
handling:

```bash
npx openapi-typescript https://bluebirdforecast.com/openapi.json -o bluebird.d.ts
```

A copy of the schema is committed at [`backend/openapi.json`](../backend/openapi.json)
and checked in CI, so it always matches the code in the same commit.

## Please be considerate

Bluebird has no rate limiting, which is a request for good behavior rather than
an invitation. Every upstream it depends on (Overpass, Open-Meteo, Nominatim) is
free, keyless, and run by people paying for it. A single analysis can fan out to
hundreds of forecast requests.

Keep polygons no larger than you need, prefer one wide window over many narrow
ones, and cache results you intend to reuse. If you want to run something heavy,
the whole stack is one container and runs locally in a single command. See the
[README](../README.md).
