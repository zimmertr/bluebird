# Using the Bluebird API

Everything the web app does, it does through this API, and all of it is open to
you. There are no API keys, no accounts, and no authentication of any kind.

- **Interactive reference:** [bluebirdforecast.com/docs](https://bluebirdforecast.com/docs)
- **Machine-readable schema:** [bluebirdforecast.com/openapi.json](https://bluebirdforecast.com/openapi.json) (OpenAPI 3.1)

This page is the friendly tour. `/docs` is the authority: it is generated from
the running code, so it can never drift from what the service actually does. It
also has a "Try it out" button that sends real requests from your browser.

## A first request

Rank the peaks around Tiger Mountain by how dry it is right now:

```bash
curl -s https://bluebirdforecast.com/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "polygon": {
      "type": "Polygon",
      "coordinates": [[
        [-122.03, 47.44], [-121.91, 47.44], [-121.91, 47.53],
        [-122.03, 47.53], [-122.03, 47.44]
      ]]
    },
    "destination_type": "peak",
    "forecast_mode": "current",
    "limit": 3
  }' | jq '.results[] | {name, precip_total_in, wind_avg_mph}'
```

Two things to notice. Polygon positions are `[longitude, latitude]`, which is
GeoJSON order and the reverse of how people usually say coordinates. And the
ring closes by repeating its first position.

## Choosing a forecast window

`forecast_mode` says which of three questions you are asking, and determines
which timestamps the request needs:

| Mode | Timestamps | Question |
| --- | --- | --- |
| `current` | none | How is it right now? |
| `at` | `start_datetime` | How is it at one specific hour? |
| `window` | `start_datetime` and `end_datetime` | How is it across a span? |

```jsonc
{ "forecast_mode": "current" }

{ "forecast_mode": "at",
  "start_datetime": "2026-08-01T14:00:00Z" }

{ "forecast_mode": "window",
  "start_datetime": "2026-08-01T14:00:00Z",
  "end_datetime":   "2026-08-03T02:00:00Z" }
```

Sending a timestamp a mode does not use is a `422` rather than something the
server quietly ignores. `at` works for past hours too, not just future ones,
since the weather API serves roughly 90 days of history.

Omitting `forecast_mode` still works and is inferred: both timestamps mean
`window`, neither means `current`. Sending exactly one without a mode is
refused, because it reads equally as `at` or as a `window` missing its end, and
guessing would turn a fat-fingered window into a one-hour sample without
telling you.

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
  "forecast_mode": "current",
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

One important catch: **check the status code first, then the stream.** A request
that fails validation is rejected with a `422` before the stream opens, exactly
as on `POST /api/analyze`. But once the stream does open, the status stays `200`
for the rest of the exchange even if the analysis then fails, because the
connection is already streaming by the time an upstream problem surfaces. So a
`200` here means your request was accepted, not that it succeeded. Exactly one
`result` or one `error` event ends the stream.

## Discovering the limits

Rather than hardcoding constants from this page, ask the service:

```bash
curl -s https://bluebirdforecast.com/api/capabilities | jq
```

It reports the searchable destination types (narrower than the enum in the
schema, since not every modelled type is discoverable yet), the sort keys, the
maximum polygon area, the cap on destinations per analysis, the accepted `limit`
range, how far forward and back a window may reach, and (under `limits.rate`)
the per-address request pacing behind `429` responses. Those values are read
from the same constants the validators and limiters enforce, so they cannot
drift.

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
| `429` | This client is sending faster than the per-address limit. The `Retry-After` header says how many seconds to wait, and the same request succeeds once it has elapsed. Analyze and geocode have separate buckets; `GET /api/capabilities` publishes both under `limits.rate`. |
| `502` | An upstream failed. Every Overpass mirror was unreachable, or the weather API did not answer. Transient, and worth retrying. |
| `503` | The instance is at capacity: its budget of in-flight upstream calls stayed saturated too long, so the request was shed instead of queued forever. Transient by nature; `Retry-After` says when a retry is worthwhile. |

A `422` carries Pydantic's per-field `detail` list. Every other error carries a
single plain-language `detail` string, written to be shown to a person as-is.

On `POST /api/analyze/stream`, a `429` arrives as a plain HTTP response because
rate limiting runs before the stream opens. A capacity problem discovered
mid-analysis, though, arrives as an `error` event on the already-open `200`
stream, exactly like any other upstream failure.

## Generating a client

The schema is OpenAPI 3.1, so the usual generators work without special
handling:

```bash
npx openapi-typescript https://bluebirdforecast.com/openapi.json -o bluebird.d.ts
```

A copy of the schema is committed at [`backend/openapi.json`](../backend/openapi.json)
and checked in CI, so it always matches the code in the same commit.

## Please be considerate

Every upstream Bluebird depends on (Overpass, Open-Meteo, Nominatim) is free,
keyless, and run by people paying for it, and a single analysis can fan out to
hundreds of forecast requests. Light per-address rate limits and an
instance-wide upstream budget enforce a floor of good behavior: past them you
get a `429` or `503` with `Retry-After` instead of service. The numbers are
published by `GET /api/capabilities` under `limits.rate`, and the full picture
of what calls what lives in [`TRAFFIC.md`](TRAFFIC.md).

The limits are sized so a person iterating on a map never meets them. Scripts
should stay well under them anyway: keep polygons no larger than you need,
prefer one wide window over many narrow ones, and cache results you intend to
reuse. If you want to run something heavy, the whole stack is one container and
runs locally in a single command, with every limit tunable or off via
environment variables. See the [README](../README.md).
