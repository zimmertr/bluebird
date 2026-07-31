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
| `POST /api/destinations` | Discovery alone: the polygon's candidates with no forecasts attached. |
| `GET /api/capabilities` | Supported destination types, sort keys, and every limit enforced. |
| `GET /api/version` | Which build is running: version, commit, build time. |
| `GET /api/geocode` | Place lookup by name, proxied to Nominatim. |
| `GET /api/wildfires` | Active US wildfire perimeters in a bounding box, cached from NIFC. |
| `GET /api/config` | Deployment-specific UI settings. Internal to the web app. |
| `GET /healthz` | Liveness probe. Answers `GET` and `HEAD`. |

### Discovery without forecasts

`POST /api/destinations` takes a `polygon`, a `destination_type`, and the
optional elevation band, and returns every named candidate inside — the same
never-sampled discovery an analysis starts with, under the same candidate
ceiling (with its own, cheaper rate-limit bucket), just without the weather. It exists so a
client can attach forecasts itself: the bundled web app calls it and then
fetches Open-Meteo **directly from the browser**, spending the visitor's own
free-tier quota instead of this deployment's (falling back to
`POST /api/analyze/stream` when Open-Meteo is unreachable from the browser).
If you are building a client and want ranked forecasts in one call,
`POST /api/analyze` remains the endpoint for that; if you want to do your own
ranking or your own weather, this one saves you a scrape.

### Wildfire perimeters

`GET /api/wildfires` returns active US wildfire perimeters intersecting a
bounding box, as GeoJSON that drops straight into a map library:

```bash
curl -s "https://bluebirdforecast.com/api/wildfires?bbox=-122.1,46.6,-121.4,47.0&detail=full"
```

```json
{
  "type": "FeatureCollection",
  "fetched_at": 1785495937012,
  "features": [
    {
      "type": "Feature",
      "properties": {
        "attr_IncidentName": "Dollar Lake",
        "poly_GISAcres": 1240.3,
        "attr_PercentContained": 35,
        "attr_ModifiedOnDateTime_dt": 1784926301250
      },
      "geometry": { "type": "Polygon", "coordinates": [[[-121.83, 46.79], "…"]] }
    }
  ]
}
```

`bbox` is `west,south,east,north` in decimal degrees. `detail` picks the
geometry fidelity: `coarse` (the default) simplifies perimeters to roughly 56
metres, which is finer than a map pixel at any zoom that fits a whole fire and
about a thirteenth of the bytes; `full` returns them as surveyed, for measuring
distances rather than drawing shapes.

Two timestamps appear and they answer different questions. `fetched_at` is when
this instance last retrieved the dataset from NIFC. The per-feature
`attr_ModifiedOnDateTime_dt` is when NIFC last revised that particular
perimeter, which routinely runs days older and is a fact about the fire, not
about this service.

This endpoint exists because NIFC's quota belongs to NIFC's ArcGIS organization
and is shared with every other consumer of the public dataset, so calling them
per visitor competes with the rest of the internet for it. An instance holds one
national snapshot and refreshes it on a timer, and serves it **past its refresh
deadline** when NIFC is unreachable, on the grounds that a perimeter mapped an
hour ago still answers a ten-mile proximity question. Read `fetched_at` if that
matters to you. Only an instance that has never completed a fetch answers `503`.
Coverage is the United States only, so an empty result elsewhere means "not
covered", not "nothing burning". See [DATA.md](DATA.md#wildfires).

### Resolving your own coordinates

The same endpoint also answers a second question: what does OpenStreetMap know
about coordinates you already have? Send `custom_destinations` and each one is
matched to the nearest peak, filling in the `elevation_ft` and `osm_id` a bare
coordinate pair cannot carry. Send them without a polygon (with
`destination_type: "custom"`) to resolve and discover nothing:

```json
{
  "destination_type": "custom",
  "custom_destinations": [
    { "name": "McClellan Butte", "latitude": 47.406905, "longitude": -121.622215 }
  ]
}
```

```json
{
  "destinations": [
    {
      "name": "McClellan Butte",
      "type": "custom",
      "latitude": 47.406905,
      "longitude": -121.622215,
      "elevation_ft": 5164.0,
      "osm_id": "node/3055500576"
    }
  ],
  "total": 1
}
```

Send them alongside a polygon to get both in one call, merged by the rule
below. Either way at least one of `polygon` or `custom_destinations` is
required; a request with neither is a `400`.

Three things worth knowing about resolution:

- **It never overwrites.** A row that arrives with its own `elevation_ft` is
  left exactly as sent, and is not looked up at all.
- **It is best-effort.** If the map service is unreachable the rows come back
  as sent rather than failing the request, so a null elevation means "nobody
  could say", never "the request failed".
- **Not every point resolves.** A coordinate with no OSM peak beside it keeps
  a null elevation. That is a real answer about OSM's coverage, not an error.

The same resolution runs inside `POST /api/analyze` and
`POST /api/analyze/stream`, so a custom row is ranked and filtered on the
elevation OSM knows even when you never call this endpoint yourself.

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

Supplying `elevation_ft` is optional. Leave it out and the service resolves it
against OpenStreetMap for you (see [Resolving your own
coordinates](#resolving-your-own-coordinates)), which is what lets a row take
part in a `min_elevation_ft` / `max_elevation_ft` filter. Send it and your
value stands, untouched. Rows whose elevation is still unknown after all that
are never filtered out.

## When a search finds too much

Every candidate gets a real forecast, so analyses are capped at a candidate
count that `GET /api/capabilities` publishes. An over-limit search refuses
with a `400` that carries remedies, not just
words: `found`, `limit`, and — when one exists — a computed
`suggested_min_elevation_ft` with `suggested_keeps`, the elevation floor
that would bring the search under the cap. Prefer that filter: it keeps the
ranking exact.

If you would rather cut than filter, opt in explicitly with
`"top_by_elevation": true` on `POST /api/analyze`, `/api/analyze/stream`, or
`/api/destinations`: the highest-elevation candidates up to the cap are
analyzed (rows with unknown elevation are dropped first), and the response
says so with `"truncated": true` and the pre-cut count in `total_found`.
Truncation never happens without that flag — an unasked-for cut would
misrepresent the ranking.

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

data: {"type": "status", "message": "Searching for Destinations…", "detail": "Trying backup map server 2 of 3…"}

data: {"type": "progress", "processed": 50, "total": 120, "percent": 41}

data: {"type": "result", "data": {"results": [...], "total_queried": 120}}
```

A `status` event may carry an optional `detail` line alongside `message`: a
fall-over to a backup map server, or a weather-quota pace wait with its resume
estimate ("Weather service quota: resuming in about 34s"). `message` stays the
stable phase heading, so a client can key its UI on it and show `detail` as
secondary text. During quiet stretches — a paced analysis can legitimately
wait most of a minute for quota — the stream emits `{"type": "keepalive"}`
events; ignore them. A terminal `error` event carries the refusal remedy
fields when the search was over-limit, or `scope` and `retry_after_s` when an
upstream rate limit ended the analysis.

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

Two things about the value itself, for anyone rendering it. It is sampled from
a model grid measured in tens of kilometers, so nearby destinations often carry
identical numbers and none of them is a reading at that summit. And `us_aqi` is
the US EPA scale applied worldwide, not the index the surrounding country
publishes. [DATA.md's air quality section](DATA.md#air-quality) has
the reasoning, along with the equivalent caveats for the other providers.

## When something goes wrong

| Status | Meaning |
| --- | --- |
| `400` | The request parsed but does not describe a runnable analysis. Inverted window, undiscoverable destination type, missing `custom_destinations`, or too many candidates — the over-limit case carries the structured remedy fields described above. |
| `404` | No such endpoint. The body names the path and points at `/docs`. |
| `405` | Right path, wrong method. The `Allow` header lists what the path accepts. |
| `422` | Request validation failed. Polygon too large, `limit` out of range, or a window outside the servable horizon. |
| `429` | Either this client is sending faster than the per-address limit, or the upstream weather service rate-limited the deployment mid-analysis. The `Retry-After` header says how many seconds to wait in both cases. Analyze, destinations, and geocode have separate per-address buckets; `GET /api/capabilities` publishes them under `limits.rate`. |
| `502` | An upstream failed. Every Overpass mirror was unreachable, or the weather API did not answer. Transient, and worth retrying. |
| `503` | The instance is at capacity: its budget of in-flight upstream calls stayed saturated too long, so the request was shed instead of queued forever. Transient by nature; `Retry-After` says when a retry is worthwhile. |

A `422` carries Pydantic's per-field `detail` list. Every other error carries a
single plain-language `detail` string, written to be shown to a person as-is.

That table is exhaustive: nothing else is emitted deliberately, and in
particular a slow upstream surfaces as `502` rather than `504`. So a `504` or a
`524` reaching your client came from a proxy in front of the deployment, not
from Bluebird, and means the analysis outran that proxy's patience. Retrying it
identically will usually outrun it again; use `POST /api/analyze/stream`, whose
progress and keepalive events hold the connection open, or narrow the search.

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
keyless, and run by people paying for it — and Open-Meteo meters weighted
calls (each location in a batch counts), so a single large analysis can spend
over a thousand of them. Light per-address rate limits and an
instance-wide upstream budget enforce a floor of good behavior: past them you
get a `429` or `503` with `Retry-After` instead of service. The numbers are
published by `GET /api/capabilities` under `limits.rate`, and the full picture
of what calls what lives in [`TRAFFIC.md`](TRAFFIC.md).

The limits are sized so a person iterating on a map never meets them. Scripts
should stay well under them anyway: keep polygons no larger than you need,
prefer one wide window over many narrow ones, and cache results you intend to
reuse. If you want to run something heavy, the whole stack is one container and
runs locally in a single command (see the [README](../README.md)), with every
limit tunable or off via environment variables
([CONFIGURATION.md](CONFIGURATION.md)).
