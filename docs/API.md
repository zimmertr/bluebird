# Using the Bluebird Forecast API

Everything the web app does, it does through this API. There are no accounts and
no authentication. Discovery, geocoding, the limits endpoint, the build
endpoint, and the two cached map overlays are open to anyone. `/api/smoke`
takes nothing but the request; `/api/wildfires` takes a bounding box.

Forecasts are the exception. On `bluebirdforecast.com` the two analyze routes
need an Open-Meteo API key in the `X-Open-Meteo-Key` header. One analysis can
spend more than a thousand weighted Open-Meteo calls, this deployment has a
single free-tier quota to answer every visitor from, and it does not spend that
quota on API callers. A keyed request spends the key's own quota instead: the
pod forwards the key to Open-Meteo, and it reaches no log line, no metric, and
no error message. Open-Meteo sells keys; the `api_key_header` field of
`GET /api/capabilities` names the header to put one in.

The web app needs no key, and stays free. The browser fetches its own forecasts
from Open-Meteo directly, so a visitor's analysis spends the visitor's address
and free-tier quota rather than the deployment's.

A self-hosted instance needs no key either. The requirement is enforced at the
public gateway rather than in the code, so your own instance answers an unkeyed
analyze request from its own free tier.

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
  -H "X-Open-Meteo-Key: $OPEN_METEO_KEY" \
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
server quietly ignores. `at` works for past hours too, not just future ones, and
reaches back a year: past `limits.past_data_days` the window is answered from
Open-Meteo's archive endpoint instead, which is described below.

Omitting `forecast_mode` still works and is inferred: both timestamps mean
`window`, neither means `current`. Sending exactly one without a mode is
refused, because it reads equally as `at` or as a `window` missing its end, and
guessing would turn a fat-fingered window into a one-hour sample without
telling you.

### Asking about last summer

A window older than `limits.past_data_days` is answered from Open-Meteo's
archive endpoint, back as far as `limits.archive_days`. Nothing in the request
says so and nothing in the response shape changes:

```bash
curl -s -X POST https://bluebirdforecast.com/api/analyze \
  -H 'Content-Type: application/json' \
  -H "X-Open-Meteo-Key: $OPEN_METEO_KEY" \
  -d '{"destination_types": [],
       "custom_destinations": [{"name": "Mount Rainier",
                                "latitude": 46.8523, "longitude": -121.7603}],
       "start_datetime": "2025-09-12T00:00:00Z",
       "end_datetime":   "2025-09-12T23:59:00Z"}' | jq '.results[0]'
```

Three things behave differently, all of them the archive's nature rather than a
limitation here. `forecast_model` is ignored, because the archive answers from a
reanalysis rather than from a forecast model. The wind columns report the
10 m wind rather than wind at the destination's elevation, because the archive
carries no pressure-level winds. And the three `freeze_*` fields and
`series.freeze_ft` are null, because the archive carries no freezing level
either. [DATA.md](DATA.md#open-meteo) has the detail.

A window that starts older than `limits.past_data_days` and ends inside it is
served by both endpoints, with one day of tolerance: a window that starts less
than a day before the boundary is served by the forecast endpoint alone, whose
tail is populated that far back. Nothing in the request or the response says so, and
there is no `400` to handle: each batch is fetched twice, the archive answering
the hours before the boundary and the forecast endpoint the hours from it on, and
each location's hourly arrays are joined in time order before the aggregation
runs. So the aggregates and the `series` describe one window, not two halves.

Three things follow from where the seam falls, and all three are the archive's
nature rather than a limitation here:

- The boundary is `now - limits.past_data_days`, floored to the UTC day. The
  archive answers through the hour before it; the forecast endpoint answers from
  it. No hour is fetched twice, so no hour is counted twice in
  `precip_total_in`.
- `forecast_model` applies to the later half only. The archive names no model, so
  its hours come from the reanalysis whatever the request asked for.
- Wind is the 10 m wind for the archive's hours and wind at the destination's
  elevation for the forecast endpoint's, because only the latter carries
  pressure-level winds. The freezing level is null for the archive's hours for
  the same reason. A window crossing the seam therefore mixes the two within
  one series.

Because the boundary moves with the clock, the same window asked about twice on
different days can be answered as one request or two.

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

Four more things follow from the choice, and the same endpoint publishes all of
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

**Six of the eight are blends.** `blend: true` marks them. A blend serves a fine
regional grid for the first day or two and a coarse global one after that, so a
single series changes model partway along and two hours of one response can come
from two models. Read the flag rather than the `_seamless` suffix: the suffix is
Open-Meteo's naming habit rather than a contract, and a blended product added
under another name would read as a single model.

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
| `GET /api/smoke` | Smoke plumes over North America, cached from NOAA's Hazard Mapping System. |
| `GET /api/config` | Deployment-specific UI settings. Internal to the web app. |
| `GET /healthz` | Liveness probe. Answers `GET` and `HEAD`. |

On `bluebirdforecast.com` the gateway publishes the API by **allowlist**
(#240): it forwards exactly the endpoints the web app itself calls, plus
`/api/version`, and any other `/api` path answers the same JSON `404` an
unknown path gets.

The two analyze endpoints are on that allowlist **only with the
`X-Open-Meteo-Key` header** (#317). Send the header and the gateway forwards
the request; leave it out and `/api/analyze` answers the same JSON `404`, at the
edge, before the deployment is asked to spend anything. The gateway tests only
that the header is there. Whether the key is any good is Open-Meteo's answer,
which comes back as a `401` (see the error table below).

An unkeyed analyze request still works from inside the deployment's own network
and on a self-hosted instance, because the gate is the gateway rather than the
code.

### Place lookup

`GET /api/geocode?q=Mount%20Rainier` is a thin proxy to Nominatim. `q` is
required (1 to 200 characters) and `limit` takes 1 to 10, default 5. The
response is Nominatim's `jsonv2` list, verbatim: each row carries `lat`, `lon`,
`display_name`, and `extratags`, where a summit's `ele` lives. The proxy exists
because Nominatim's usage policy asks for a real User-Agent, which a browser
fetch cannot set. That policy also forbids autocomplete, so call it on an
explicit search action, never per keystroke. The pod paces its own calls to
Nominatim's rate; when that queue is full the route answers `503` with
`error.code` `busy`.

### Which build is running

`GET /api/version` answers `{version, commit, built_at}`: the semantic version
of the release, the git SHA it was built from, and the ISO 8601 UTC build time.
All three read `"dev"` outside a released image.

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

The rain-radar and snow-depth overlays have no endpoint here and never will:
those images go from [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/ogc/)
and from [NOAA NOHRSC](https://www.nohrsc.noaa.gov/nsa/) straight to the browser.
See [DATA.md](DATA.md#rain-radar) and [DATA.md](DATA.md#snow-depth) for how each
is addressed.

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
  "total": 1,
  "total_found": null,
  "truncated": false
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
| `min_freeze_ft` / `max_freeze_ft` | its `freeze_min_ft` is at or above the floor **and** its `freeze_max_ft` at or below the ceiling |
| `min_aqi` / `max_aqi` | its `aqi_max` is inside the range |

```bash
curl -s https://bluebirdforecast.com/api/analyze \
  -H 'Content-Type: application/json' \
  -H "X-Open-Meteo-Key: $OPEN_METEO_KEY" \
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
against. The freezing level is the one family where neither end is the bad
one, and it reads straight: the floor asks that the level never dropped below
the value, the ceiling that it never rose above it. Precipitation and air
quality have no minimum aggregate to read, so both of their bounds compare one
field: the window total, and the worst hour.

**They run before the ranking and before `limit`.** So `limit: 10` with a wind
ceiling returns the ten driest destinations that stay calm, not whichever of
the ten driest happened to be calm.

**A null passes every bound.** Two fields can be null. `aqi_max` is null
whenever the window outruns the air-quality horizon (`limits.aqi_forecast_days`
in `GET /api/capabilities`) or the best-effort fetch failed. The three `freeze_*` fields are null under every
model that publishes no freezing level, which is most of them. An absent
number is not evidence of bad air, and a model that carries no freezing level
says nothing about the weather, so those rows are kept, exactly as an untagged
summit survives an elevation band.

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

## Reading only the summary

Every result row carries `series`: the hourly precipitation, temperature, wind,
freezing level and AQI behind its aggregates, aligned index-for-index to the
shared `times` grid. Those hours are nearly the whole body. One analysis at the candidate cap
across the longest window the API accepts measures 12.92 MB with them and
0.61 MB without.

Send `include_series: false` when you read only the aggregates:

```bash
curl -s https://bluebirdforecast.com/api/analyze \
  -H 'Content-Type: application/json' \
  -H "X-Open-Meteo-Key: $OPEN_METEO_KEY" \
  -d '{
    "destination_types": [],
    "forecast_mode": "window",
    "start_datetime": "2026-08-01T14:00:00Z",
    "end_datetime":   "2026-08-02T02:00:00Z",
    "include_series": false,
    "custom_destinations": [
      { "name": "Mt Rainier", "latitude": 46.8529, "longitude": -121.7604 }
    ]
  }' | jq '{hours: (.times | length), row: .results[0]}'
```

```json
{
  "hours": 13,
  "row": {
    "name": "Mt Rainier",
    "type": "custom",
    "latitude": 46.8529,
    "longitude": -121.7604,
    "elevation_ft": 14411,
    "osm_id": "node/12345678",
    "precip_total_in": 0.0157,
    "precip_avg_in_hr": 0.0012,
    "precip_min_in_hr": 0,
    "precip_max_in_hr": 0.0079,
    "temp_min_f": 18.3,
    "temp_max_f": 27.1,
    "temp_avg_f": 22.4,
    "wind_min_mph": 12.6,
    "wind_max_mph": 41.2,
    "wind_avg_mph": 24.8,
    "freeze_min_ft": 9800,
    "freeze_max_ft": 11400,
    "freeze_avg_ft": 10650,
    "aqi_avg": 31,
    "aqi_min": 18,
    "aqi_max": 47,
    "series": null
  }
}
```

Only the hours go. The aggregates are reduced from exactly the same hours, the
forecast bounds and the ranking still read them, and air quality is still
fetched and summarized under the same best-effort terms. `times` is still sent,
and under this flag it is the only statement of which hours the aggregates
cover. `POST /api/analyze/stream` takes the flag identically, on the `result`
event's payload.

The default is `true`, so a caller that never sends the field sees the shape it
always saw. The other request defaults a caller may lean on: `limit` is 10,
`sort_by` is `precip_total_in`, and `sort_desc` is `false`, so an analysis with
no ranking fields returns the ten driest destinations.

The response also carries an `error` field that is always null on this route. A
failed analysis answers a `4xx` or `5xx` with a `detail` message instead; the
field exists because the streaming endpoint reuses the shape.

## When a search finds too much

Every candidate gets a real forecast, so analyses are capped at a candidate
count that `GET /api/capabilities` publishes. An over-limit search refuses
with a `400` that carries remedies, not just
words: `found`, `limit`, and — when one exists — a computed
`suggested_min_elevation_ft` with `suggested_keeps`, the elevation floor
that would bring the search under the cap, alongside the `error` object with
`"code": "refusal"`. Prefer that filter: it keeps the ranking exact.

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
  -H 'Content-Type: application/json' \
  -H "X-Open-Meteo-Key: $OPEN_METEO_KEY" -d @request.json
```

```
data: {"type": "status", "message": "Searching for Destinations…"}

data: {"type": "status", "message": "Searching for Destinations…", "detail": "Trying backup map server 2 of 3…"}

data: {"type": "progress", "processed": 0, "total": 120, "percent": 0}

data: {"type": "progress", "processed": 50, "total": 120, "percent": 42, "batches_done": 1, "total_batches": 3, "message": "Retrieving forecasts: 50 of 120 peaks…"}

data: {"type": "result", "data": {"results": [...], "total_queried": 120, "total_matched": 120}}

data: {"type": "error", "message": "Open-Meteo is rate-limiting. Try again later.", "error": {"code": "upstream_rate_limited", "retryable": true}, "scope": "minutely", "retry_after_s": 60}
```

A `status` event may carry an optional `detail` line alongside `message`: a
fall-over to a backup map server, or a weather-quota pace wait with its resume
estimate ("Open-Meteo quota: resuming in about 34s"). The first `progress`
event carries the three counters alone; every per-batch one after it adds
`batches_done`, `total_batches`, and a `message` line. `message` stays the
stable phase heading, so a client can key its UI on it and show `detail` as
secondary text. During quiet stretches — a paced analysis can legitimately
wait most of a minute for quota — the stream emits `{"type": "keepalive"}`
events; ignore them. A terminal `error` event carries the same `error` object
the JSON routes answer with, since a stream that has already opened has no
status code left to fail with. It also carries the refusal remedy fields when
the search was over-limit, or `scope` and `retry_after_s` when an upstream rate
limit ended the analysis. A key Open-Meteo refuses ends it the same way, with
`Open-Meteo rejected the API key.` in `message`.

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
schema, since not every modelled type is discoverable yet, and `custom` names
rows you supply rather than something to find), the sort keys, the
maximum polygon area, the cap on destinations per analysis, the accepted `limit`
range, how far forward and back a window may reach, the selectable forecast
models with each one's reach and whether it blends two grids (under
`forecast_models`), how far ahead air quality reaches
(`limits.aqi_forecast_days`), the header an Open-Meteo key travels in
(`api_key_header`), the per-address request pacing behind `429` responses
(under `limits.rate`), and the data providers behind every answer (under
`data_sources`, one `{name, url, provides}` entry each). Those values are read
from the same constants the validators and limiters enforce, so they cannot
drift.

Three of the window limits look redundant and are not. `limits.max_past_days` is
how far back a request is *accepted*. `limits.past_data_days` is where the
forecast endpoint's own data stops, which is the boundary between the two weather
endpoints rather than a wall: past it a window is answered from the archive.
`limits.archive_days` is how far back that reaches, and it is the number worth
building a date picker against. The far end has the same split, between
`limits.max_future_days` and each model's `forecast_hours`.

Air quality deserves a note. Its horizon is far shorter than the weather
forecast, so `aqi_avg` and `aqi_max` come back `null` for hours beyond it. That
is expected, not an error, and an air-quality outage never fails an analysis.

So does the freezing level. `freeze_min_ft`, `freeze_avg_ft` and `freeze_max_ft`
are the window's freezing level in feet above sea level, and `series.freeze_ft`
carries it per hour. They are `null` for every row of an analysis run on a model
that does not publish the variable, which is five of the eight — only
`gfs_seamless`, `gfs_hrrr` and `icon_seamless` answer it (measured 2026-09-12).
Nothing else on the row is affected: the aggregation reduces it separately, so a
model with no freezing level still returns complete precipitation, temperature
and wind. A `0` is a value rather than a gap, meaning the freezing level reached
sea level. Ranking by one of these keys sorts `null` last in either direction,
exactly as the AQI keys do. [DATA.md's Open-Meteo
section](DATA.md#open-meteo) has what the number can and cannot say about an
overnight refreeze.

Two things about the value itself, for anyone rendering it. It is sampled from
a model grid measured in tens of kilometers, so nearby destinations often carry
identical numbers and none of them is a reading at that summit. And `us_aqi` is
the US EPA scale applied worldwide, not the index the surrounding country
publishes. [DATA.md's air quality section](DATA.md#air-quality) has
the reasoning, along with the equivalent caveats for the other providers.

## When something goes wrong

| Status | `error.code` | Meaning |
| --- | --- | --- |
| `400` | `validation`, `model_coverage`, `refusal` | The request parsed but does not describe a runnable analysis. Inverted window, undiscoverable destination type, missing `custom_destinations`, a regional `forecast_model` asked about somewhere outside its grid, or too many candidates — the over-limit case carries the structured remedy fields described above. |
| `401` | `invalid_api_key` | Open-Meteo refused the `X-Open-Meteo-Key` this analyze request carried. Only `POST /api/analyze` answers it as a status; on the stream the same failure arrives as a terminal `error` event. No retry helps. |
| `404` | `not_found` | No such endpoint. The body names the path and points at `/docs`. On `bluebirdforecast.com` an analyze request with no `X-Open-Meteo-Key` header gets this from the gateway, so a `404` on a path that exists means the header was missing. |
| `405` | `method_not_allowed` | Right path, wrong method. The `Allow` header lists what the path accepts. |
| `422` | `validation`, or absent | Request validation failed. Polygon too large, `limit` out of range, or a window outside the servable horizon. |
| `429` | `rate_limited`, `upstream_rate_limited` | Either this client is sending faster than the per-address limit, or the upstream weather service rate-limited the deployment mid-analysis. The `Retry-After` header says how many seconds to wait in both cases. Analyze (both analyze routes share one), destinations, geocode, wildfires and smoke each have their own per-address bucket; `GET /api/capabilities` publishes them under `limits.rate`. |
| `502` | `upstream_unavailable` | An upstream failed. Every Overpass mirror was unreachable, or the weather API did not answer. Transient, and worth retrying. |
| `503` | `busy`, `snapshot_unavailable` | The instance is at capacity, or a national overlay has nothing cached yet: a budget of in-flight upstream calls stayed saturated too long and the request was shed rather than queued forever, or this instance has never once completed its NIFC or NOAA fetch. Transient by nature; `Retry-After` says when a retry is worthwhile. |

A `422` carries Pydantic's per-field `detail` list. Every other error carries a
single plain-language `detail` string, written to be shown to a person as-is.

That table is exhaustive: nothing else is emitted deliberately, and in
particular a slow upstream surfaces as `502` rather than `504`. So a `504` or a
`524` reaching your client came from a proxy in front of the deployment, not
from Bluebird Forecast, and means the analysis outran that proxy's patience. Retrying it
identically will usually outrun it again; use `POST /api/analyze/stream`, whose
progress and keepalive events hold the connection open, or narrow the search.

On `POST /api/analyze/stream`, a `429` arrives as a plain HTTP response because
rate limiting runs before the stream opens. A capacity problem discovered
mid-analysis, though, arrives as an `error` event on the already-open `200`
stream, exactly like any other upstream failure. A refused API key is one of
those: the key is only tested when the first forecast batch goes out, which is
after the stream has opened, so it arrives as
`{"type": "error", "message": "Open-Meteo rejected the API key.", "error":
{"code": "invalid_api_key", "retryable": false}}` rather than as the `401` the
JSON route answers.

### Branching on the error

`detail` is written for a person and may be reworded at any time. Beside it
every error but Pydantic's own `422` carries an `error` object that is
contract:

```json
{
  "detail": "OpenStreetMap is not available. Try again later.",
  "error": { "code": "upstream_unavailable", "retryable": true }
}
```

Branch on `code`, and read `retryable` for the one question worth asking of a
failure: `true` means the identical request can succeed later, and on a `429`
or `503` the `Retry-After` header says when. `false` means only you can change
the outcome, so a retry loop will spin forever.

| `error.code` | Status | `retryable` | Raised when |
| --- | --- | --- | --- |
| `validation` | `400`, `422` | `false` | The request does not describe runnable work: an inverted window, a type that is not discoverable, a polygon missing beside `destination_types`, a `bbox` that will not parse. |
| `refusal` | `400` | `false` | The search covers more candidates than the analysis cap allows. Carries the remedy fields above. |
| `model_coverage` | `400` | `false` | A regional `forecast_model` was asked about somewhere outside its grid. |
| `invalid_api_key` | `401` | `false` | Open-Meteo refused the key in `X-Open-Meteo-Key`. |
| `not_found` | `404` | `false` | No endpoint at that path. |
| `method_not_allowed` | `405` | `false` | Right path, wrong verb. `Allow` lists the verbs it takes. |
| `rate_limited` | `429` | `true` | This address is sending faster than the per-address bucket allows. |
| `upstream_rate_limited` | `429` | `true` | Open-Meteo rate-limited the deployment mid-analysis. |
| `upstream_unavailable` | `502` | `true` | An upstream failed or could not be reached. |
| `busy` | `503` | `true` | An in-flight upstream budget stayed saturated, so the request was shed. |
| `snapshot_unavailable` | `503` | `true` | This instance has never completed a fetch of the wildfire or smoke snapshot, so it has nothing to serve, not even stale. |
| `internal` | stream only | `true` | An unexpected failure ended an SSE analysis. The JSON routes have no equivalent. |

Pydantic's `422` is the one exception, and deliberately: its `detail` is a list
of per-field objects rather than a sentence, and the field paths in it are
already machine-readable. The `bbox` parameter on `GET /api/wildfires` is
parsed by hand, so its `422` does carry `validation`.

## Generating a client

The schema is OpenAPI 3.1, so the usual generators work without special
handling:

```bash
npx openapi-typescript https://bluebirdforecast.com/openapi.json -o bluebird-forecast.d.ts
```

A copy of the schema is committed at [`backend/openapi.json`](../backend/openapi.json)
and checked in CI, so it always matches the code in the same commit. The app
generates its own types from that copy the same way, and CI fails a stale one,
so the command above is a path this repository exercises on every pull request.

## Please be considerate

Every upstream Bluebird Forecast depends on (Overpass, Open-Meteo, Nominatim) is run by
people paying for it, and the two that answer without a key are free — and
Open-Meteo meters weighted calls (each location in a batch counts), so a single
large analysis can spend over a thousand of them. That is what a key buys: an
analyze request that carries one spends its own quota rather than anybody
else's, which is the whole reason the route is public again. Light per-address
rate limits and an instance-wide upstream budget enforce a floor of good
behavior: past them you get a `429` or `503` with `Retry-After` instead of
service, key or no key. The numbers are published by `GET /api/capabilities`
under `limits.rate`, and the full picture of what calls what lives in
[`TRAFFIC.md`](TRAFFIC.md).

The limits are sized so a person iterating on a map never meets them. Scripts
should stay well under them anyway: keep polygons no larger than you need,
prefer one wide window over many narrow ones, and cache results you intend to
reuse. If you want to run something heavy, the whole stack is one container and
runs locally in a single command (see the [README](../README.md)), with every
limit tunable or off via environment variables
([CONFIGURATION.md](CONFIGURATION.md)).
