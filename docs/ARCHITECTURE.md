# Architecture

Bluebird is one FastAPI service that also serves the built React SPA as static files. The web app asks the server only for discovery — `POST /api/destinations`, one Overpass query — and fetches the Open-Meteo forecasts **directly from the browser**, so each visitor spends their own free-tier quota instead of the server's one shared egress IP. The browser's aggregation is a port of the backend's, pinned identical by shared test vectors (`weather_vectors.json`, checked by both suites and diffed in CI). The browser path is the app's only analysis path: #240 removed the fallback that rerouted an analysis through `POST /api/analyze/stream` on the server's shared quota, so a browser that cannot reach Open-Meteo gets an honest error instead. The analyze endpoints themselves remain, for in-cluster release probes, development, and self-hosted instances — but the production gateway publishes the API by allowlist and they are deliberately not on it, so from the internet they answer the app's own JSON-404 shape (the chart's `ingress.publicApiPrefixes`).

When a full server-side analysis runs (an API caller, or that fallback), the backend:

1. Validates the polygon area.
2. Queries the Overpass API for named OSM features, falling back across three mirrors if the first is down.
3. Batches the matched destinations into Open-Meteo weather and air-quality requests, all fired concurrently with `asyncio.gather`.
4. Sorts by the requested metric and returns the top N.

Because the browser talks to Open-Meteo itself, that service sees each visitor's IP address and the coordinates being analyzed — the same information the server would otherwise send on the visitor's behalf. Wildfire perimeters are the exception among the browser-side data sources: they are fetched by the server into a shared snapshot (`app/services/nifc.py`) and served from `GET /api/wildfires`, because NIFC's quota belongs to NIFC's ArcGIS organization and is shared with every other consumer of the public dataset, so per-visitor requests competed for a resource none of them could see. Smoke plumes are the same call for a different reason — NOAA publishes one dated file a day, so a per-visitor fetch would be thousands of requests for one document (`app/services/hms.py`, `GET /api/smoke`). Rain-radar tiles are the counter-example and stay in the browser: they are cached at Iowa Environmental Mesonet's own edge, and a viewport is a different set of tiles per visitor, so there is nothing shared for a snapshot to hold. See [DATA.md](DATA.md#wildfires).

The whole thing builds as a single multi-stage Docker image:

- Stage 1 runs `node:26-alpine` to `npm run build` the SPA, and vendors Swagger UI's assets so `/docs` renders without reaching out to a CDN.
- Stage 2 runs `python:3.14-alpine` with uvicorn, serving the API and the built SPA together.

None of the external APIs need a key:

- **Overpass** handles the OSM feature queries. Three public endpoints are tried in order: `overpass-api.de`, then `maps.mail.ru`, then `overpass.kumi.systems` (ordered by measured latency; see the dated table in `osm.py`).
- **Open-Meteo** provides the hourly forecast and air-quality data, batched up to 50 locations per request.
- **OpenFreeMap** serves the vector map tiles.

## Metrics

The service emits Prometheus metrics (issue #77): request rate, errors, and duration per route template; per-mirror Overpass latency and failover counts; Open-Meteo batch latency, 429s by quota scope, weighted-call spend, pace waits, and sheds; cache hits and misses; per-bucket throttle counts; degraded-AQI batches; and the size distributions of the analyses people actually run. The counters wrap what the code already counts — the pacers in `app/ratelimit.py`, the hit/miss tallies on `TTLCache` — rather than keeping parallel books. Labels are bounded by construction (route templates, mirror hosts, closed outcome sets) and never carry coordinates or client identity; `backend/tests/test_telemetry.py` fails any sample that grows a label outside the allowlist.

The registry is served on its own port (`METRICS_PORT`, default 9464), never as a route on the app. That placement is a security boundary, not a convenience: the production gateway publishes `/api/*` by allowlist but passes non-API paths through to the pod, so a `/metrics` route on port 8000 would be publicly readable. The second port is unreachable through the gateway entirely, and the OpenAPI document stays unchanged. In Kubernetes the chart's PodMonitor scrapes the pod port directly — the Service never exposes it — and the cluster side (kube-prometheus-stack, Grafana, the bluebird dashboard) lives in `Kubernetes-Manifests` under `observability/`.

## Kubernetes Deployment

Manifests live in a separate repo, `zimmertr/Kubernetes-Manifests`, under `public/bluebird/`, and ArgoCD picks them up automatically. The stack runs an Argo Rollout with a canary strategy, an Istio VirtualService and Gateway, and a cert-manager `Certificate` for `bluebirdforecast.com`, all managed with Kustomize.

For the complete CI/CD picture — how a merge flows through GitHub Actions, Docker Hub, the `bluebird-helm` chart, Artifact Hub, and on to Argo CD, plus how per-PR preview environments spin up — see [`CICD.md`](CICD.md), which has Mermaid diagrams of each path.

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
