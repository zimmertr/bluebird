# Architecture

Bluebird Forecast is one FastAPI service that also serves the built React SPA as static files. The web app asks the server only for discovery (`POST /api/destinations`, which since #760 reads the server's own copy of OpenStreetMap and asks Overpass only on a deployment without one) and fetches the Open-Meteo forecasts **directly from the browser**, so each visitor spends their own free-tier quota instead of the server's one shared egress IP. The browser's aggregation is a port of the backend's, pinned identical by shared test vectors (`weather_vectors.json`, one committed file that both suites read). The browser path is the app's only analysis path: #240 removed the fallback that rerouted an analysis through `POST /api/analyze/stream` on the server's shared quota, so a browser that cannot reach Open-Meteo gets an honest error instead. The analyze endpoints themselves remain, and #317 put them back on the public gateway under one condition: the request must carry an Open-Meteo API key in the `X-Open-Meteo-Key` header, which the backend forwards to Open-Meteo's customer hosts so the fan-out spends the caller's quota rather than the pod's. The gateway matches the header rather than the key's validity (the chart's `ingress.keyedApiPrefixes`, a second rule beside `ingress.publicApiPrefixes`), so an analyze request with no header still answers the app's own JSON-404 shape from the edge, and a key Open-Meteo refuses comes back as a `401`. The header stays optional in the code, which is what keeps the unkeyed path open to in-cluster release probes, development, and self-hosted instances.

When a full server-side analysis runs (an API caller on the keyed path, a release probe, or a self-hosted instance), the backend:

1. Validates the polygon area.
2. Reads the named OSM features inside the polygon from the places table, or, while the table cannot answer, queries the Overpass API, falling back to a second mirror if the first is down or busy.
3. Batches the matched destinations into Open-Meteo weather requests, fetched concurrently under the weighted budget (the whole deployment's while the database holds it, the pod's otherwise), with the cloud deck's request beside them for every destination. Air quality rides alongside only when the ranking key or a bound needs it before the cut; otherwise it is attached to the returned rows after the cut, because the quota on this path is the pod's and shared.
4. Applies the request's metric bounds, ranks by `sort_by` and `sort_desc`, and returns the top `limit` rows, with `total_matched` beside `total_queried`.

Because the browser talks to Open-Meteo itself, that service sees each visitor's IP address and the coordinates being analyzed — the same information the server would otherwise send on the visitor's behalf. Wildfire perimeters are the exception among the browser-side data sources: they are fetched by the server into a shared snapshot (`app/services/nifc.py`) and served from `GET /api/wildfires`, because NIFC's quota belongs to NIFC's ArcGIS organization and is shared with every other consumer of the public dataset, so per-visitor requests competed for a resource none of them could see. Forest Service closure orders are the same call for the same reason: an ArcGIS feature service whose quota belongs to its organization (`app/services/usfs_closures.py`, `GET /api/closures`). Smoke plumes are the same call for a different reason — NOAA publishes one dated file a day, so a per-visitor fetch would be thousands of requests for one document (`app/services/hms.py`, `GET /api/smoke`). Rain-radar tiles and the snow-depth images are the counter-examples and stay in the browser: a viewport is a different set of images per visitor, so there is nothing shared for a snapshot to hold. Radar is cached at Iowa Environmental Mesonet's own edge; NOAA renders each snow image on request and refuses caching, so the browser is where that cost belongs rather than in a pod holding tiles for a layer most visitors never switch on. See [DATA.md](DATA.md#wildfires).

The whole thing builds as a single multi-stage Docker image:

- Stage 1 runs `node:26-alpine` to `npm run build` the SPA, and vendors Swagger UI's assets so `/docs` renders without reaching out to a CDN. The build also writes the npm half of `third-party-licenses.txt`: a Vite plugin (`frontend/plugins/thirdPartyLicenses.ts`) reads the bundle's module graph, the MapLibre worker's, the packages the stylesheets import and the vendored Swagger UI, and copies each package's own license files into it. A package with no license text fails the build.
- Stage 2 runs `python:3.15-alpine` with uvicorn, serving the API and the built SPA together. After `pip install` it appends the Python half of the same file from the metadata of every installed distribution (`backend/scripts/write_third_party_licenses.py`, run from a bind mount so it does not stay in the image), and copies the repository's `LICENSE` to `/app/LICENSE` and Swagger UI's `LICENSE`, `NOTICE` and `swagger-ui-bundle.js.LICENSE.txt` beside its files.

The finished file is served at `/third-party-licenses.txt`. It is a static file like any other under the mount, so the production gateway forwards it with no chart change: the chart's allowlist governs `/api` paths only. The terms page links it from its License section, and nothing on the first screen references it, so the cold load does not fetch it. `NOTICES.md` at the repository root stays the human summary; the served file is the complete one, with every license text. See [decision 0086](decisions/0086-license-notices-built-into-the-image.md).

What the first screen costs is gated rather than assumed (issue #337). The
entry document warms the three hosts a cold load and a first analysis cannot
avoid (`preconnect` for the map style and both Open-Meteo services, each marked
`crossorigin` because all three are read with `fetch`). The chart library is
loaded on demand, so a reader who never opens a chart never downloads it. The
logo the app draws is a 256px asset imported through the bundler, which is what
gives it a content hash and therefore an `immutable` cache header; the 1024px
`public/icon.png` is left unhashed for the Open Graph card and the iOS
home-screen icon, and no page load fetches it. `public/theme.js` is unhashed
too, because every HTML entry names it: it is the few lines that put a stored
light theme on the page before the first paint (#706), a file rather than an
inline script because the CSP's `script-src 'self'` refuses one, and it is
served `no-cache` like the documents that load it. CI audits `/` against byte and
timing budgets on every PR, described in [CICD.md](CICD.md#pr-preview-environments).

The browser holds each location's forecast for 15 minutes, and since issue #337
that cache survives a reload: what fits in a 2 MB budget is mirrored into
`sessionStorage` when the page is hidden and read back when it loads
(`frontend/src/utils/forecastStore.ts`). Only the build that wrote it reads it
back: the stored values are aggregates, so a reload into a new release discards
them rather than showing what the old build worked out. Record:
[0095](decisions/0095-forecast-snapshot-carries-its-build.md) Quota is the scarcest thing the app
spends, and before this a refresh re-bought coordinates the browser had already
paid for. Every stamp on the wire is whole seconds rather than ISO text
(`timeformat=unixtime`), which is 11 bytes instead of 18 and a multiply instead
of a regex.

None of the external APIs need a key. The three on the analysis path:

- **Overpass** handles the OSM feature queries when the places table cannot answer: a deployment with no database, one whose first fill has not finished, or a search the database dropped. Two public endpoints are tried in order: `overpass-api.de`, then `maps.mail.ru` (ordered by measured success rate and latency; see the dated table in `osm/mirrors.py`). A third, `overpass.kumi.systems`, was dropped after it answered none of eight attempts in 30 days.
- **Open-Meteo** provides the hourly forecast and air-quality data, batched up to 50 locations per request, and the archive that answers a window older than the forecast endpoint's reach.
- **OpenFreeMap** serves the vector map tiles.

Nominatim (place search), NIFC (wildfire perimeters), the US Forest Service (closure orders from Regions 3, 4 and 6), NOAA HMS (smoke), NOAA NOHRSC (snow depth), the Iowa Environmental Mesonet (radar) and OpenStreetMap's own servers (the planet file and its daily change files, which keep the places table) are keyless too; [DATA.md](DATA.md) covers every provider.

The snapshot overlays decode on a worker thread rather than on the event loop
(`asyncio.to_thread` in `app/services/arcgis.py`, which pages both ArcGIS
feeds, and in `app/services/hms.py`, issue #337). The fire payload is 16.5 MB of JSON holding
861k coordinates, and `app/services/snapshot.py` already keeps that refresh off
the request that triggered it. What it cannot do is keep an `async` function
that never awaits from holding the loop, which blocks every other request on
the pod for the length of the parse. The analyze routes parse and aggregate
their Open-Meteo batches on a worker thread for the same reason
(`app/services/openmeteo_fetch.py` and `app/services/weather.py`, issue #662).
The aggregation yields to the loop as
it runs and the parse does not, because the C JSON parser holds the GIL for the
whole body, so the largest batch the keyed route can send still stalls the loop
for about 0.23 s where it used to stall it for 1.9 s (measured 2026-10-06).
Responses are compressed at gzip level 6
rather than Starlette's default of 9, measured on the largest body this service
sends: level 9 costs 124 ms more CPU per request (measured 2026-09-14) and
saves 0.4% of the bytes. That CPU is spent on a worker thread rather than on
the loop, because Starlette compresses any body of 128 KiB or more there (the
longest loop gap through the middleware was 7.4 ms, measured 2026-10-06 in
#653), so what level 9 would cost is pod CPU and response time. The largest
of those bodies, an overlay's whole national set, is not compressed per
request at all: `app/services/held_body.py` gzips it once
per snapshot, on a worker thread, and the wildfire and closure routes send the
held bytes to every client that takes gzip (#628).

Every response leaves the pod carrying a Content-Security-Policy and the usual
hardening headers, added by `app/security_headers.py` outside every route,
static file and 404 (issue #132); the cache-header middleware sits beside it, and
since the two read different headers the order between them carries nothing. The policy is app-owned rather than mesh-owned because
its allowlist is the set of hosts the browser bundle fetches, which changes when
a frontend overlay changes; a pytest reads the frontend sources and fails when
the two disagree. The header table and the reasoning behind each directive are
in [TRAFFIC.md](TRAFFIC.md#security-response-headers).

## The shared cache

Since #760 every pod reads one PostgreSQL 18 database with PostGIS 3.6
(`backend/app/db/`), which holds what the app would otherwise ask an upstream
for again and again. Record: [0175](decisions/0175-shared-cache-in-postgresql.md)
A new major is a new cluster rather than an upgrade in place: the operator
upgrades only between images on one OS, and everything in the database is a
cache the fill and the refreshes rebuild. Record:
[0198](decisions/0198-a-new-postgres-major-is-a-new-cluster.md)

- **Places.** Every place discovery can find, worldwide, one row per
  OpenStreetMap element, each at one point: a node's position, or the centre
  of a way's or relation's bounding box, which is what Overpass's `out center`
  gives. Discovery and the pasted-coordinate lookup read it
  (`app/services/places/`) and ask Overpass only when it cannot answer; the
  map's trailhead and crag markers read it too, and draw nothing without it.
  Places of one kind and one name within 300 m are one place,
  merged when a reader reads rather than when the table is written, so the
  daily update can replace any row by its id. Record:
  [0176](decisions/0176-places-from-the-planet-and-daily-changes.md),
  [0177](decisions/0177-one-place-per-kind-and-name-within-300-m.md)
- **Snapshots.** The wildfire, closure and smoke overlays, one row each. One
  pod at a time fetches each upstream on that overlay's interval and writes the
  row, and every pod serves from it, so no reader calls an upstream while the
  database answers. A row's age is measured on the database's clock, and
  [record 0077](decisions/0077-snapshot-max-stale-24h.md)'s 24 hours still end
  it. On a first deploy each overlay answers `503` until its first refresh
  lands. Record: [0182](decisions/0182-shared-snapshots.md)
- **Counters.** The per-address buckets, the Nominatim gate, the Open-Meteo
  weighted budgets and the place-search cache, each exact across pods. They sit
  in unlogged tables, which skip the write-ahead log: cheap to write on every
  request, and lost in a crash, which costs a minute of looser limits. A sweep
  every nine minutes deletes a bucket idle for 45 minutes and every booking or
  search past its time. The discovery slot and the in-flight caps stay per pod.
  Record: [0181](decisions/0181-shared-limits-and-nominatim-intervals.md)

Every pod runs one refresh loop per source (`app/db/refresh.py`): the three
snapshots, the daily OpenStreetMap update and the counters' sweep. A PostgreSQL
advisory lock per source decides which pod does the work, so each source
refreshes once per interval whatever the replica count. A lock dies with its
connection, so when the refreshing pod dies the source passes to whichever pod
looks next, and each looks about every 30 s. A failure backs off from a minute,
doubling to an hour with a fifth of jitter either way, and the backoff is held
in the database, so the next pod does not retry at once. Migrations run at
startup under an advisory lock of their own (`app/db/migrations/`). The pool
connects in the background, so a pod whose database is down still starts.

The database is optional, and a pod runs in one of three modes:

- **No database** (`DATABASE_URL` unset): everything per pod, as before #760.
  Discovery asks Overpass, and each pod fetches its own snapshots and keeps its
  own counters. The backend suite, `docker compose` and a self-hosted instance
  without the chart's database run this way.
- **Writable:** everything above is shared.
- **Read-only** (`DATABASE_READ_ONLY`): the pod reads the places and the
  snapshots, keeps its counters and its search cache to itself, and runs no
  refresh and no migration. The PR previews read production's database this
  way, with a login that can only read. The maintainer accepted that on one
  condition (2026-10-18): only while the database holds nothing but public
  data the fill can rebuild. Record:
  [0183](decisions/0183-previews-read-production-read-only.md)

A database that drops or stops answering mid-request sends that request down
the pod's own path, so a database fault never becomes a `500`. For the counters a call is
bounded at 0.5 s, and one that fails pauses the shared path on that pod for
30 s, so an outage costs one slow request rather than one per request. The
forecast cache stays per pod: only keyed API callers use it, so sharing it
would change nothing a visitor sees.

The daily update (`app/services/places/update.py`) is one of the refresh
sources. Every hour it asks OpenStreetMap's replication server for the newest
day file, and it applies each one the table has not seen, in order and one
transaction per file, so a missed day is applied the next time a fetch
succeeds. A day file is about 110 MB. Day 5149 (2026-10-17, 115.7 MB) took
43.7 s to read at a peak of 224 MiB, touched 849,568 nodes, 445,258 ways and
17,858 relations, and wrote 344 places. A change file carries a way's edit
without the nodes that did not move, so an edited way or relation the file
cannot place keeps its old point and waits in `places_pending` until Overpass
places it. Each run names every waiting shape by id in one query, up to 2,000,
and a run Overpass does not answer leaves them waiting for the next. That day
left 1,510 shapes the file could not place, 1,147 of them moved, so a day fits
one query. A shape is not re-placed when only its nodes move, so a lake
redrawn by moving its shore keeps its old centre until someone edits the lake
itself. Record: [0185](decisions/0185-redrawn-shapes-from-overpass-by-id.md)

## The planet fill

The places table is built by a second image, `zimmertr/bluebird-fill`
(`fill/`), which the chart runs as a weekly CronJob (`17 9 * * 0`). Most weeks it
finds the table filled under this release's rules and exits in seconds. It
fills on its first run, when `RULES_VERSION` in
`backend/app/services/osm/rules.py` changes (the daily update applies a rule
only to the features edited after it ships, so a new rule needs a new table),
and when `FORCE_FILL` is set. Record:
[0184](decisions/0184-planet-fill-cronjob-and-image.md)

A fill downloads the planet file (95.4 GB on 2026-10-15, republished weekly)
to an ephemeral 120 GiB scratch volume, resuming a dropped connection, and
checks its MD5. It then runs the pipeline validated against Overpass on
Washington's extract on 2026-10-18, which matched it place for place, 0.0 m
apart: `osmium tags-filter` keeps every element carrying a tag some rule reads,
the rules choose which to keep, `osmium getid -r` copies those with everything
they reference, and a last pass places each one from an on-disk node index.
The rows load into a new table, which replaces the live one in one transaction,
so a failure at any step leaves the live table as it was and searches keep
reading it. The fill records the last day file its planet already holds, one
day earlier on purpose, since replaying a day rewrites the same rows, and the
daily update carries on from there.

The image carries `rules.py` itself, which is standard library only, so the
fill, the daily update and the Overpass fallback read one definition of each
kind. A relation stands at the centre of its own nodes and ways; only one with
neither, a climbing area made only of other areas, is placed from the
relations it holds, following the nesting and cutting a cycle where it closes.
Record: [0179](decisions/0179-relations-stand-at-their-own-points.md)

On Washington's extract (364.8 MB) the fill took 8 s and peaked at 3.8 GB, all
but 0.2 GB of it in `osmium getid -r`, whose memory follows OpenStreetMap's
highest ids rather than the extract's size. On the cluster, the planet took 82
minutes to reach the load on 2026-10-20: 24 minutes of download at 62 MB/s, 13
of `tags-filter`, 31 of `getid -r`, which peaked at 4.4 GB, and 12 of placing
1.24 million places. The CronJob allows 12 hours, requests 5 GiB and stops at
6 GiB. That run died at the load's first statement: its connection had sat
idle through the pipeline, and Istio's sidecar closes a connection that
carries no bytes for an hour. The fill now sends a statement every five
minutes while the pipeline runs.

## Metrics

The service emits Prometheus metrics (issue #77): request rate, errors, and duration per route template; per-mirror Overpass latency and failover counts; Open-Meteo batch latency, 429s by quota scope, weighted-call spend, pace waits, and sheds; cache hits and misses; per-bucket throttle counts; degraded-AQI batches; failed snapshot refreshes per overlay feed (`bluebird_forecast_snapshot_refresh_failures_total`, by `provider`, #580), which is the only sign of an upstream outage while the cache still serves its last good snapshot; every refresh of a shared-cache source by outcome (`bluebird_forecast_cache_refreshes_total`, by `cache` and `outcome`, #760); and the size distributions of the analyses people actually run. The counters wrap what the code already counts — the pacers in `app/ratelimit/upstream.py`, the hit/miss tallies on `TTLCache` — rather than keeping parallel books. Labels are bounded by construction (route templates, mirror hosts, closed outcome sets) and never carry coordinates or client identity; `backend/tests/test_telemetry.py` fails any sample that grows a label outside the allowlist.

The registry is served on its own port (`METRICS_PORT`, default 9464), never as a route on the app. That placement is a security boundary, not a convenience: the production gateway publishes `/api/*` by allowlist but passes non-API paths through to the pod, so a `/metrics` route on port 8000 would be publicly readable. The second port is unreachable through the gateway entirely, and the OpenAPI document stays unchanged. In Kubernetes the chart's PodMonitor scrapes the pod port directly — the Service never exposes it — and the cluster side (kube-prometheus-stack, Grafana, the bluebird dashboard) lives in `Kubernetes-Manifests` under `observability/`.

## Kubernetes Deployment

Manifests live in a separate repo, `zimmertr/Kubernetes-Manifests`, under `public/bluebird/`, and ArgoCD picks them up automatically. That directory is a Kustomization that inflates the `bluebird-helm` OCI chart with a `values.yml` and adds the three Argo Rollouts analysis templates. The stack runs an Argo Rollout with a canary strategy behind an Istio VirtualService on the cluster's shared Gateway, autoscaled between three and ten replicas with a PodDisruptionBudget and one pod per worker node, and the PodMonitor above switched on. TLS is a cert-manager `Certificate` for `bluebirdforecast.com`, declared with the cert-manager app in `public/cert-manager/resources/certificate-bluebird.yml` and issued into the shared gateway's namespace, `istio-gateway`, as the secret `bluebird`. The public hostnames reach that gateway through a Cloudflare Tunnel; nothing is port-forwarded from the internet. cloudflared runs from `public/cloudflared/`, and the tunnel, its ingress rules and its DNS records are Terraform in `terraform/cloudflare/`. [TRAFFIC.md](TRAFFIC.md) follows a request the rest of the way.

The database comes from CloudNativePG rather than a hand-written manifest. Its operator (the `cloudnative-pg` chart, 0.29.1) is an Argo CD app of its own, `misc/cloudnative-pg` in the `postgres-system` namespace, because its CRDs and webhooks serve the whole cluster. The app's chart runs PostgreSQL through CloudNativePG's `cluster` chart (0.9.0), a subchart aliased `database` and on by default (`database.enabled`), as three instances spread one to a worker where they fit. Every search reads the database, so a drain or a failed instance hands over to a standby in seconds. Each instance has its own 10 GiB `proxmox-flashpool` volume, provisioned dynamically, and the operator runs two replicas, since failover is its job. Within Bluebird Forecast's app, Argo CD syncs the database first and the app after it, since the app's pods read the Secret the operator writes. The operator runs outside the Istio mesh, so the API server reaches its webhooks directly. The database's pods take the namespace's sidecar like the rest; the cluster has no `PeerAuthentication`, so mutual TLS is permissive and the operator reaches their status port, and a STRICT policy in `bluebird-system` would need an exception for it. The fill's scratch volume uses `proxmox-datapool-scratch`, a StorageClass whose volumes are deleted with their claim, because each worker's 51 GB of ephemeral storage is smaller than the planet.

For the complete CI/CD picture — how a merge flows through GitHub Actions, Docker Hub, the `bluebird-helm` chart, Artifact Hub, and on to Argo CD, plus how per-PR preview environments spin up — see [`CICD.md`](CICD.md), which has Mermaid diagrams of each path.

The release pipeline updates the image tag on merge to `main`, and it is the only supported way to deploy: there is no hand-built image path and no rollback. A bad release is fixed by the next one; [CICD.md](CICD.md#when-a-release-is-bad) has the procedure.

To set the log level in the cluster, set the chart value in `values.yml`; the Rollout is chart-rendered, and Argo CD's `selfHeal` reverts a hand edit to the live object:

```yaml
# Kubernetes-Manifests/public/bluebird/values.yml
extraEnv:
  - name: LOG_LEVEL
    value: "WARNING"
```
