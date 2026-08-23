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
    "destination_types": ["peak"],
    "forecast_mode": "current",
    "limit": 3
  }' | jq '.results[] | {name, precip_total_in, wind_avg_mph}'
```

Two things to notice. Polygon positions are `[longitude, latitude]`, which is
GeoJSON order and the reverse of how people usually say coordinates. And the
ring closes by repeating its first position.

One thing to know about the numbers: the wind fields report wind at each
destination's own elevation, interpolated from pressure-level winds and floored
at the surface value, not the bare 10 m wind most forecast APIs hand back. The
derivation and its limits are in [DATA.md](DATA.md#open-meteo); rows with no
`elevation_ft` carry the plain 10 m wind.

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
though the archive behind it is shorter than the range of dates the request
validator accepts — see `limits.past_data_days` below.

Omitting `forecast_mode` still works and is inferred: both timestamps mean
`window`, neither means `current`. Sending exactly one without a mode is
refused, because it reads equally as `at` or as a `window` missing its end, and
guessing would turn a fat-fingered window into a one-hour sample without
telling you.

## Choosing a forecast model

`forecast_model` names which weather model answers. It defaults to
`gfs_seamless` and never sends Open-Meteo's `best_match` blend, which picks per
location and does not report its pick.

```jsonc
{ "forecast_model": "gfs_hrrr",
  "forecast_mode": "window",
  "start_datetime": "2026-08-01T14:00:00Z",
  "end_datetime":   "2026-08-02T02:00:00Z" }
```

`forecast_models` in `GET /api/capabilities` is the list, **best first**. That
order is this deployment's editorial ranking for mountain terrain, not a sort on
any field in the response — it weights grid spacing over forecast length, so it
is roughly the reverse of ordering by `forecast_hours`. Render it as given.

Three more things follow from the choice, and the same endpoint publishes all of
them.

**Each model carries a `summary`** saying why to reach for it, written for
someone planning a trip rather than for a meteorologist: what it is best at,
then what it blends in. Six of the eight fold a fine regional grid into a coarse
global one for roughly two days, which is why `finest_grid_km` and
`forecast_hours` do not describe the same moment. Nothing here blends across
agencies, and the blend clause names only what is *added*, never the headline
model, since three of these labels are named after one of their own parts (NOAA
GFS is HRRR plus GFS, JMA GSM is MSM plus GSM, Meteo-France ARPEGE is AROME plus
ARPEGE).

Grid figures describe the variant this service requests, not the headline
national model: `ecmwf_ifs025` is the 0.25° open-data feed rather than ECMWF's
9 km HRES, and ECCC GEM reads as a 15 km global model unless you count the
2.5 km grid that is the reason to pick it here.

**Each model reaches a different distance.** `forecast_hours` says how far. It
is separate from `limits.max_future_days`, which is the hard edge the request
validator refuses past: inside that edge a model does not fail, it just returns
`null` for hours beyond its own reach, so a window reaching too far yields rows
with fewer hours behind them rather than an error.

**One model is regional.** `regional: true` marks it — today only `gfs_hrrr`,
run over the continental US and neighbouring parts of Canada and Mexico. A
request naming it is refused with `400` if *any* destination falls outside that
grid, including destinations you never named, since discovery happens
server-side. The message names the model; it cannot name the destination,
because the upstream refuses the whole batch without saying which location it
objected to. Switching to a global model is the fix.

An unsupported id is a `422`, never a silent fall back to the default: answering
with a model other than the one asked for is exactly what naming a model is
meant to prevent.

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

On `bluebirdforecast.com` the gateway publishes the API by **allowlist**
(#240): it forwards exactly the endpoints the web app itself calls, plus
`/api/version`, and any other `/api` path answers the same JSON `404` an
unknown path gets. The two analyze endpoints are the deliberate omissions,
because one request can spend more than a thousand weighted Open-Meteo calls
from the deployment's shared quota. They work unchanged on a self-hosted
instance and from inside the deployment's own network.
| `GET /api/smoke` | Smoke plumes over North America, cached from NOAA's Hazard Mapping System. |
| `GET /api/smoke/forecast` | Forecast smoke over a viewport, hour by hour, from NOAA's HRRR model. |
| `GET /api/config` | Deployment-specific UI settings. Internal to the web app. |
| `GET /healthz` | Liveness probe. Answers `GET` and `HEAD`. |

### Discovery without forecasts

`destination_types` is a set, not a value. Ask for several and they come back
from **one** Overpass query rather than one per type, so peaks and lakes
together cost what peaks alone would, and every row is tagged with the type it
actually is rather than the type you asked for. Order and duplicates are
ignored. An empty set discovers nothing, which is how a request analyzes only
its `custom_destinations`; `custom` is not a discoverable type and is rejected
inside the list.

`include_unnamed_peaks` widens the peak search to summits tagged with an
elevation but no name, returned as `Peak 5961`. It defaults to false and is
ignored unless `peak` is among the types: measured over one 8x10 km box, it
roughly triples the candidate count, and every candidate is a weighted upstream
call and a step closer to the analysis ceiling.

`POST /api/destinations` takes a `polygon`, a set of `destination_types`, and
the optional elevation band, and returns every named candidate inside — the same
never-sampled discovery an analysis starts with, under the same candidate
ceiling (with its own, cheaper rate-limit bucket), just without the weather. It exists so a
client can attach forecasts itself: the bundled web app calls it and then
fetches Open-Meteo **directly from the browser**, spending the visitor's own
free-tier quota instead of this deployment's. That is the web app's only
analysis path: since #240 it has no fallback through the server, so a browser
that cannot reach Open-Meteo gets an error rather than spending the shared
quota. If you are building a client and want ranked forecasts in one call,
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
  "coverage": { "type": "MultiPolygon", "coordinates": ["…"] },
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
about a thirteenth of the bytes; `full` returns them as surveyed. The web app
itself uses `coarse` for drawing and for its proximity check alike — 56 metres
cannot move a 10-mile answer — so `full` exists for callers who need the
surveyed shapes.

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
covered", not "nothing burning". The `coverage` foreign member states this
machine-readably: a coarse (±50 km, biased outward) US outline as a GeoJSON
MultiPolygon, with Alaska split at the antimeridian so no ring wraps 180°.
Test your query area against it before reading an empty `features` array as
an all-clear — that test is exactly what the app does with it. Static per
release. See [DATA.md](DATA.md#wildfires).

### Smoke plumes

`GET /api/smoke` returns the current smoke analysis for North America. It takes
no parameters:

```bash
curl -s https://bluebirdforecast.com/api/smoke
```

```json
{
  "type": "FeatureCollection",
  "fetched_at": 1754347200000,
  "analysis_date": "2026-08-04",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "density": "Heavy",
        "satellite": "GOES-WEST",
        "observed_start": 1754308800000,
        "observed_end": 1754319600000
      },
      "geometry": { "type": "Polygon", "coordinates": [[[-123.18073, 41.42071], "..."]] }
    }
  ]
}
```

There is no bounding box because there is nothing to save by sending one: a busy
day measured under half a megabyte for the whole continent, where the wildfire
endpoint's 16.5 MB genuinely needed the filter.

`density` is `Light`, `Medium` or `Heavy`. HMS has changed that vocabulary once
already, so a value this service does not recognize comes back as `Light` with
the unrecognized string in `density_raw`, rather than being dropped: a plume
nobody can classify is still smoke somebody is standing in.

Two timestamps again, answering different questions. `fetched_at` is when this
instance last retrieved the file. `observed_start` and `observed_end` bound the
imagery each plume was traced from, which is the window the plume actually
describes, and they are null where HMS did not state them.

`analysis_date` is the one field worth reading before trusting the rest. HMS
publishes one dated file per day and its first analyst pass lands around late
morning Eastern, so before then this service falls back to yesterday's analysis
rather than reporting an outage — and this field is how you can tell. It is a
`YYYY-MM-DD` date in US Eastern time.

Perimeters and plumes share a caching contract: one national snapshot per
instance, refreshed on a timer, served **past its refresh deadline** when the
upstream is unreachable, and only a `503` from an instance that has never once
completed a fetch. Coverage is North America, so an empty result elsewhere means
"not covered", not "clear air". See [DATA.md](DATA.md#smoke).

### Forecast smoke

`GET /api/smoke/forecast` is the forecast counterpart to the endpoint above.
Where HMS is an analyst tracing what a satellite already saw, this is a model
saying where that smoke goes next. It takes a bounding box and a window:

```bash
curl -s "https://bluebirdforecast.com/api/smoke/forecast\
?bbox=-114.0,46.6,-113.0,47.5\
&start=2026-08-23T14:00:00Z&end=2026-08-23T17:00:00Z"
```

```json
{
  "cycle": "2026-08-23T00:00:00Z",
  "fetched_at": 1787472000000,
  "west": -114.0, "south": 46.6, "east": -113.0, "north": 47.5,
  "cols": 25, "rows": 33,
  "pitch_km": 3.0,
  "hours": [
    { "time": 1787493600000, "cells": [0, 0, 1, 2, 3, "..."] }
  ]
}
```

`cells` is `cols * rows` density classes, row-major from the **south-west**
corner, so the value at column `c` and row `r` is `cells[r * cols + c]`. `0` is
below the reporting floor, `1` `2` and `3` are Light, Medium and Heavy, and
**`255` means the cell falls outside the model's area**. That last one is not
clean air and must not be drawn as any density: it is the same distinction the
wildfire column makes between a check that cleared and a check that never ran.

The classes are concentrations rather than an analyst's judgement, cut at 1, 10
and 21 micrograms per cubic metre. They carry the same three names as
`GET /api/smoke` on purpose, so a caller drawing both layers needs one legend.

The lattice is aligned to longitude and latitude and tiles the requested box
exactly, which is why it can be drawn as a plain image over those four edges.
That is a resampling, not the model's own grid: HRRR is on a Lambert conformal
projection turned as much as 15 degrees from north over the western states, and
its cells drawn directly would sit on a slant. `pitch_km` is how wide one cell
is, never finer than the model's own 3 km, and coarser when the box is large
enough to need it.

Two limits are normal answers rather than errors. A window past the run's last
hour returns `"hours": []` — HRRR reaches 48 hours, and only the 00/06/12/18Z
runs go that far, which is why `cycle` is always one of those four. A box
outside the contiguous United States returns cells of `255`. Read `cycle` before
trusting the rest: it says which run these hours came from.

The caching contract is the one perimeters and plumes share: one snapshot per
instance, refreshed on a timer, served past its refresh deadline when NOAA is
unreachable, and a `503` only from an instance that has never once completed a
fetch. See [DATA.md](DATA.md#forecast-smoke).

The rain-radar overlay has no endpoint here and never will: those tiles go from
[Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/ogc/) straight to
the browser. See [DATA.md](DATA.md#rain-radar) for the tile addressing.

### Resolving your own coordinates

The same endpoint also answers a second question: what does OpenStreetMap know
about coordinates you already have? Send `custom_destinations` and each one is
matched to the nearest peak, filling in the `elevation_ft` and `osm_id` a bare
coordinate pair cannot carry. Send them without a polygon (leaving
`destination_types` empty) to resolve and discover nothing:

```json
{
  "destination_types": [],
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
  "destination_types": [],
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

## Asking for only what you would actually go to

Ranking orders every candidate; it never removes one. `sort_by` accepts every
aggregate column a result row carries — the window's peak wind
(`wind_max_mph`) as readily as its average — and `sort_desc` picks the
direction. The accepted keys are published by `GET /api/capabilities` under
`sort_keys`.

To say "and nothing wetter than this", set bounds. Each is optional, each is a
number or omitted, and they combine as an AND:

| Field pair | Keeps a destination when |
| --- | --- |
| `min_precip_total_in` / `max_precip_total_in` | its `precip_total_in` is inside the range |
| `min_temp_f` / `max_temp_f` | its `temp_min_f` is at or above the floor **and** its `temp_max_f` at or below the ceiling |
| `min_wind_mph` / `max_wind_mph` | its `wind_min_mph` is at or above the floor **and** its `wind_max_mph` at or below the ceiling |
| `min_aqi` / `max_aqi` | its `aqi_max` is inside the range |

```bash
curl -s https://bluebirdforecast.com/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "destination_types": [],
    "forecast_mode": "window",
    "start_datetime": "2026-08-01T14:00:00Z",
    "end_datetime":   "2026-08-02T02:00:00Z",
    "max_precip_total_in": 0.1,
    "max_wind_mph": 20,
    "max_aqi": 100,
    "limit": 5,
    "custom_destinations": [
      { "name": "Mt Rainier", "latitude": 46.8529, "longitude": -121.7604 },
      { "name": "Mt Adams",   "latitude": 46.2024, "longitude": -121.4909 }
    ]
  }' | jq '{total_queried, total_matched, kept: [.results[].name]}'
```

Four things are worth knowing before relying on them.

**A ceiling reads the worst hour, a floor the best.** `max_wind_mph: 20` does
not mean "averages under 20", it means "never exceeds 20", so a destination
that gusts to 45 at noon is gone. That is the only reading you can plan
against. Precipitation and air quality have no minimum aggregate to read, so
both of their bounds compare one field: the window total, and the worst hour.

**They run before the ranking and before `limit`.** So `limit: 10` with a wind
ceiling returns the ten driest destinations that stay calm, not whichever of
the ten driest happened to be calm.

**A null passes every bound.** Only `aqi_max` can be null, and it is null
whenever the window outruns the roughly five-day air-quality horizon or the
best-effort fetch failed. An absent number is not evidence of bad air, so those
rows are kept, exactly as an untagged summit survives an elevation band.

**An AQI bound costs more than the others.** Air quality is normally fetched
only for the rows being returned. Bounding it forces the fetch for every
candidate, since a bound cannot be applied to a value that was never fetched.

`total_matched` in the response is how many candidates satisfied the bounds
before `limit` cut the list; `total_queried` stays what it always was, how many
were analyzed. With no bound set they are equal, so a client can report "N of M
matching" without knowing whether anything filtered.

These are not the same kind of thing as `min_elevation_ft` /
`max_elevation_ft`. Elevation is known before any forecast exists, so it is
applied at discovery and a constrained analysis genuinely costs fewer upstream
calls. Nothing here can do that: a destination's precipitation is unknowable
until it has been fetched, so these shrink the answer, never the work.

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

data: {"type": "result", "data": {"results": [...], "total_queried": 120, "total_matched": 120}}
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
range, how far forward and back a window may reach, the selectable forecast
models with each one's reach (under `forecast_models`), and (under
`limits.rate`) the per-address request pacing behind `429` responses. Those
values are read from the same constants the validators and limiters enforce, so
they cannot drift.

Two of the window limits look redundant and are not. `limits.max_past_days` is
how far back a request is *accepted*; `limits.past_data_days` is how far back
the weather API still *holds data*. Past the latter a request succeeds and comes
back with nothing in it, so the second number is the one worth building a date
picker against. The far end has the same split, between `limits.max_future_days`
and each model's `forecast_hours`.

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
| `400` | The request parsed but does not describe a runnable analysis. Inverted window, undiscoverable destination type, missing `custom_destinations`, a regional `forecast_model` asked about somewhere outside its grid, or too many candidates — the over-limit case carries the structured remedy fields described above. |
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
