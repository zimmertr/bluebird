# Architecture

Bluebird is one FastAPI service that also serves the built React SPA as static files. The web app asks the server only for discovery — `POST /api/destinations`, one Overpass query — and fetches the Open-Meteo forecasts **directly from the browser**, so each visitor spends their own free-tier quota instead of the server's one shared egress IP. The browser's aggregation is a port of the backend's, pinned identical by shared test vectors (`weather_vectors.json`, checked by both suites and diffed in CI), and if Open-Meteo is unreachable from the browser the app falls back to `POST /api/analyze/stream`, the same server pipeline API callers use.

When a full server-side analysis runs (an API caller, or that fallback), the backend:

1. Validates the polygon area.
2. Queries the Overpass API for named OSM features, falling back across three mirrors if the first is down.
3. Batches the matched destinations into Open-Meteo weather and air-quality requests, all fired concurrently with `asyncio.gather`.
4. Sorts by the requested metric and returns the top N.

Because the browser talks to Open-Meteo itself, that service sees each visitor's IP address and the coordinates being analyzed — the same information the server would otherwise send on the visitor's behalf. Wildfire perimeters are the exception among the browser-side data sources: they are fetched by the server into a shared snapshot (`app/services/nifc.py`) and served from `GET /api/wildfires`, because NIFC's quota belongs to NIFC's ArcGIS organization and is shared with every other consumer of the public dataset, so per-visitor requests competed for a resource none of them could see. See [DATA.md](DATA.md#wildfires).

The whole thing builds as a single multi-stage Docker image:

- Stage 1 runs `node:26-alpine` to `npm run build` the SPA, and vendors Swagger UI's assets so `/docs` renders without reaching out to a CDN.
- Stage 2 runs `python:3.14-alpine` with uvicorn, serving the API and the built SPA together.

None of the external APIs need a key:

- **Overpass** handles the OSM feature queries. Three public endpoints are tried in order: `overpass-api.de`, then `maps.mail.ru`, then `overpass.kumi.systems` (ordered by measured latency; see the dated table in `osm.py`).
- **Open-Meteo** provides the hourly forecast and air-quality data, batched up to 50 locations per request.
- **OpenFreeMap** serves the vector map tiles.

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
