# 0230. The release gate asks the canary for discovery and calls no third party

- Status: Accepted. Changes no earlier record: the key header of [0025](0025-keyed-analyze-api.md) stays optional in the code.
- Date: 2026-10-27
- Decider: the maintainer (TJ), on #787, choosing C from options A, B and C
- Issues and PRs: #787, #806, #760, #317, #289, bluebird-helm#103, Kubernetes-Manifests#1727
- Cited in code as: #787
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "The browser path is the only path"; [`docs/CICD.md`](../CICD.md), Step 2

## Context

Canary step 2, `api-test`, posted the canary's `/api/analyze` with a fixed body: a ring over Tiger Mountain, `destination_types: [peak]`, `forecast_mode: current` and `limit: 3`. It passed on `len(result.results) >= 1`. That analysis spent the free Open-Meteo daily quota, which Open-Meteo counts per IP address, and the cluster and every browser on the home network leave through one address.

On 2026-10-21 revision 47 (0.119.0) aborted at step 2. AnalysisRun `bluebird-7cb585dbc7-47-2` recorded five measurements, each `received non 2xx response code: 429`, the status the pod answers with the code `upstream_rate_limited`. Over the three minutes ending 23:13:30Z, Prometheus showed 8 Open-Meteo requests from the canary, all refused at `scope="daily"`, and no Overpass request. The way past was `kubectl argo rollouts promote --full`, which also skipped `error-rate`. The same refusal held 0.57.0 (#289) and chart 0.12.0 (bluebird-helm#103) on 2026-08-22.

The gate was also the main caller of the path it tested. The web app analyzes in the browser (#240), and the edge publishes the analyze routes only to requests that carry `X-Open-Meteo-Key` (#317).

## Decision

`api-test` keeps its name and its metric, and posts `http://bluebird-canary.bluebird-system.svc.cluster.local:8000/api/destinations` with `{"destination_types": ["peak"], "polygon": <the same ring>}`. It passes on `len(result.destinations) >= 1`, with `count: 1`, `failureLimit: 0` and `timeoutSeconds: 120` as before.

- The places table answers that request (#760). Overpass answers only when the table cannot: no database, a first fill not yet finished, or a dropped connection. That fallback is the app's own, and the gate keeps it.
- Open-Meteo is off the gate's path. Forecast correctness stays with CI: pytest, and the Playwright suite against the built image.
- `CANARY_ROUTES` in `backend/app/telemetry.py` names `POST /api/destinations` where it named `POST /api/analyze`, so the pod creates that route's 500, 502 and 503 series at 0 for `error-rate`.
- The `X-Open-Meteo-Key` header does not change, and stays optional in the code.

## Evidence

- One request to production through the gateway on 2026-10-27, with the gate's new body: `200`, 8 peaks (the first East Tiger Mountain, 2995 ft), in 0.27 s.
- Argo Rollouts v1.10.1, the installed version, marks every non-2xx answer an Error in its web provider before `successCondition` runs (`metricproviders/webmetric/webmetric.go`, line 110, per #787). No condition on the old body could tell a spent quota from a broken release.

## Alternatives rejected

- **A, a paid Open-Meteo key for the gate.** It kept a real analysis on every release. Open-Meteo's Substack post put the Standard plan at $29 a month for 1 million calls; its pricing page listed no price when checked on 2026-10-27. Rejected on cost.
- **B, a `job` provider that counts `429 upstream_rate_limited` as a pass.** The web provider cannot read a non-2xx body, so this puts a script and a pinned image where a native provider stands, and on a spent day the release still ships with no analysis run in the cluster.
- **D, a separate egress address for the cluster.** Infrastructure work outside this repository.

## Consequences

- A spent daily quota or an Open-Meteo outage no longer holds a release.
- A release still cannot ship while discovery cannot answer, from the table or from Overpass.
- Nothing shows the release reaching Open-Meteo from inside the cluster before promotion.
- PR previews, port-forwards and self-hosted instances still take the unkeyed analyze path. The release probe does not.
- The two PRs can merge in either order. A mismatch costs one rollout whose gate route has no 5xx series created at 0, so `error-rate` would forgive two 5xx on that route where it means to forgive one.
- The discovery gate's `api-test` took under a second on revision 56 (2026-10-28), against the analyze gate's 13 s median measured 2026-09-15.
