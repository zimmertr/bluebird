# Supplier sim layout

Every module under `sim/`: what it owns, and why it is separate. The sim is a
development stand-in for every data supplier the pod and the web app reach
(issue #224, [record 0173](../docs/decisions/0173-supplier-simulator-outside-the-correctness-path.md)).
It runs only through `sim/compose.yml` and never in the app's image. CI runs
its own tests and nothing else: no CI job points the app at it, because it is
not a correctness oracle. Pytest and the pinned vectors are.
Its package is called `app` like the backend's, and `tests/conftest.py`
appends the backend's `app/` to its search path so the tests can read every
answer with the pod's own parsers.

**A new module gets a bullet here, in the same PR that adds it**, at the
density of the ones around it.

- `app/main.py` — the FastAPI app: open CORS with `Retry-After` exposed (a
  cross-origin page cannot read that header otherwise, and the 429 countdown
  would never see a fault's `retry_after_s`), the one INFO line per answer
  (method, path, status) that shows a load test nothing went elsewhere,
  `/healthz`, and the routers at the prefixes the contract's URL layout names.
- `app/control.py` — the switchboard: the control document behind
  `GET`/`PUT`/`DELETE /control`, and `fault(endpoint)`, the dependency every
  router takes, which spends a fault's count before its delay so two racing
  requests cannot both take a one-shot, then answers its status in the
  supplier's own error shape (Open-Meteo JSON, ArcGIS JSON or text). Its own
  module because every router imports it and it imports no router.
- `app/values.py` — every invented number: the latitude gradient and the
  daily wave per variable, the model's phase shift, the terrain height, the
  US AQI, the snowpack. Pure functions with no clock and no random source, so
  one place decides what any supplier says about a place and an hour.
- `app/lattice.py` — the shared geography: peaks, unnamed peaks, lakes,
  trailheads, crags and towns, each on its own global lattice with ids that
  are a pure function of the cell and names injective on a 64 by 32 block.
  Separate because every supplier that reports a place reads it, so a summit
  in a tile is the summit Overpass discovers, with one id and one elevation.
- `app/open_meteo.py` — the forecast, archive and air-quality endpoints on
  the free and the customer prefixes. Units declared in the spelling the two
  unit checks compare, the archive's levels and freezing level as nulls under
  `undefined`, five models with no freezing level, AQI null past its horizon,
  and an unknown variable refused with a 400 the way Open-Meteo does.
- `app/mvt.py` — the vector-tile writer, a port of
  `frontend/src/testSupport/mvt.ts` field for field, plus the empty glyphs
  PBF. Protobuf by hand because a tile needs four wire rules.
- `app/tiles.py` — the basemap: the style and TileJSON built on the URL the
  browser reached the sim on, the tiles in the OpenMapTiles layers the app
  reads (Planetiler's feature ids, the pod's feet arithmetic, thinned below
  zoom 14), the empty glyphs, and a sprite with one slate disc per icon id
  `map/basemap.ts` names, so the app's peak, lake and town layers place a
  marker a reader can click while the map draws no text.
- `app/png.py` — a paletted PNG writer on `zlib` and `struct`, so a colour the
  app reads back off a raster arrives exactly as written.
- `app/radar.py` — IEM's radar tiles: storms on a coarse lattice that drift
  east with the frame's age, painted in N0Q palette colours so the radar card
  reads a reflectivity.
- `app/snow.py` — NOHRSC's export renders in NOAA's legend colours and the
  identify answer `snowPoint.ts` reads, both off one depth field so the
  colour under a click and the number on the card agree.
- `app/overpass.py` — the interpreter: each statement's tag filters tested
  against what every lattice kind is tagged with, over a `poly:` ring, an
  `around:` radius, a box, or no filter at all (the home box, 45 to 49 N and
  124 to 117 W, so a worldwide query stays bounded), and
  `overpass.candidates` for the over-cap refusal. A 200 fault is the partial
  answer with a `remark`, which the pod refuses.
- `app/nominatim.py` — place search: the query hashed to a point in the home
  box, or read as one when it is a coordinate pair, and answered with the
  nearest towns, peaks and lakes in `jsonv2`'s shape, strings where
  Nominatim sends strings.
- `app/nifc.py` — the wildfire perimeter layer over the lower 48, a coarse
  copy that honours `maxAllowableOffset`, and the ArcGIS query handler and
  error shape both ArcGIS suppliers share: a 429 arrives inside an HTTP 200,
  as ArcGIS reports quota, and an unknown `outFields` entry is refused.
- `app/usfs.py` — the five closure layers: Region 6's points, lines and
  areas, and the two-phase order feeds of Regions 3 and 4, half of whose
  orders `is_area_closure` keeps. Every feature stands inside the pod's
  coverage outline.
- `app/hms.py` — one dated smoke KML for each of today and the days either
  side, a 404 for any other, so a 404 fault sends the pod to yesterday.
  Plumes are a pure function of the date.
- `tests/` — the drift guards: each answer through the backend's readers,
  byte-identical repeats, the faults, the encoder against a hand-computed
  tile, the rasters against the palettes the TypeScript holds, and the
  overlay, `pod.env` and the pod's `env_url` reads held to one set of names.
  `pod_client.py` routes the pod's own `httpx.AsyncClient` to the sim in
  process, so a test runs the pod's fetch end to end against it.
- `Dockerfile`, `Dockerfile.dockerignore`, `compose.yml`, `pod.env` — the
  image on the root Dockerfile's base and the backend's hashed lock, its own
  build context (the root `.dockerignore` leaves `sim/` out of the app's), the
  compose overlay `make sim` runs, and the same seventeen variables for a
  uvicorn on the host.
