# 0096. A path that spells a slash as `%2F` gets the edge's 404, from the gateway and from the pod

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer (TJ), on issues #620 and bluebird-helm#302 (option A: both layers refuse `%2f`)
- Issues and PRs: #620, bluebird-helm#302, #595, #565, #240, #317
- Cited in code as: #620, bluebird-helm#302
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/main.py` bullet

## Context

The production gateway publishes `/api` by allowlist (#240) and forwards the analyze routes only with an `X-Open-Meteo-Key` header (#317, [0025](0025-keyed-analyze-api.md)). Every one of those rules is an Envoy prefix match, which compares the path as literal text, and Istio's default path normalization (`BASE`) does not decode `%2F`. uvicorn does decode it, into `scope["path"]`, and Starlette routes on the decoded path. So `/api%2Fanalyze` matched no edge rule, fell to the stable route, and ran the analyze route without a key on the pod's shared free-tier quota; `/api%2Fanalyze%2Fstream`, `/api%2Fversion` and any route added later behaved the same. The security review found it (#595, finding CM-1).

## Decision

Both layers refuse it, and both answer the one `404` body the edge already sends ([0081](0081-edge-404-is-the-apps.md)).

- The chart's `-api-internal` route, the `directResponse` that answers every unpublished `/api/` path, gains a third match, `uri: {regex: "(?i)/api%2f.*"}` on the public gateway. It sits ahead of the stable route like the two matches it joins, so the body stays the one the `Edge 404` workflow compares.
- The pod's `EncodedSlashMiddleware` in `app/main.py` answers `not_found_body(EDGE_PATH_PHRASE)` with a `404` to any request whose `raw_path` contains `%2f` in either case, before routing. It covers every path rather than `/api` alone, because no route here takes a path parameter and so no request the app serves needs an encoded slash. It is added first, so it sits innermost and its answer leaves with the CORS, security and cache headers the edge record holds.

## Evidence

On main at `3e3dee8` (2026-10-06), through the test client: `POST /api%2Fanalyze` with `{}` answered `400` from the analysis's own validation, with the analysis called; `POST /api%2Fanalyze%2Fstream` answered `200`; `GET /api%2Fversion` answered `200`. The review reproduced the same answers from the released image `0.92.19` offline, and the gateway half on Envoy from `proxyv2:1.30.5` and upstream `v1.36.7` with the chart's route order: `/api%2Fanalyze` and `/api%2fanalyze` reached the stable route, while `/%61pi/analyze`, `/api/./analyze` and `/api/version/../analyze` were normalized to `/api/analyze` and refused. Whether Cloudflare and the tunnel pass `%2F` through unchanged was inferred from their documentation, not measured; the maintainer's one request after release settles it.

## Alternatives rejected

- A new first route on the public gateway matching an encoded slash anywhere in a path (#620 option B). It would be a second copy of the `404` body and headers outside the one route the `Edge 404` workflow compares; the pod's middleware covers the rest of the path.
- Mesh-wide `DECODE_AND_MERGE_SLASHES` in Kubernetes-Manifests (option C). It closes the class for every workload, but changes routing for the other sites on the shared gateway; it stays open as a separate choice.
- Widening the Cloudflare rate rule to count `/api%2F...` (option D). A zone change outside the repositories, and it counts the request without refusing it.
- The chart rule alone. A port-forward, a preview with the allowlist off, or a self-hosted instance has no gateway, and a later edge rule could miss a shape again.
- Naming the decoded path in the pod's answer, as the catch-all does. `No API endpoint at /api/analyze` would be false, and the edge's phrase keeps the two layers' answers identical.

## Consequences

`test_notfound.py` holds the pod's half: the encoded paths answer the edge record's status, body and headers and never reach the analysis, while the plain keyed path, the published paths, and a `%2F` in a query string are untouched. bluebird-helm's render test and `Edge 404` workflow hold the chart's half. An encoded slash elsewhere in a path still passes the gateway, by design, and is refused by the pod. A request the middleware refuses is counted in the metrics under `unmatched`, since no route claimed it.
