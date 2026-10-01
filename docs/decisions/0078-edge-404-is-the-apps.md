# 0078. The gateway's 404 is the app's, written down here and compared by the chart's CI

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #565 (option A, with a test pinning the two bodies)
- Issues and PRs: #565, #240, #317, #324, #132
- Cited in code as: #565
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/routes/notfound.py` and `scripts/generate_edge_not_found.py` bullets

## Context

On `bluebirdforecast.com` an `/api` path the chart does not publish, and an analyze request without `X-Open-Meteo-Key`, never reach the pod: an Istio `directResponse` in `bluebird-helm` answers them (#240, #317). That body was typed into the chart once and never followed the app. When #324 added the `error` object to the app's catch-all, the gateway kept answering `{"detail": ...}` alone, so the one `404` a keyless API caller is most likely to meet broke the contract `docs/API.md` states, and it carried none of the #132 headers either. The readiness review found both (#565, items 1 and 2).

## Decision

The app owns the gateway's `404`. `backend/edge_not_found.json` records its status, body and headers, written by `scripts/generate_edge_not_found.py` from the app itself: the body is `not_found_body` (the catch-all's own builder) with `this path` for the path, because a fixed answer cannot repeat the request, and the headers are every header the app sent on a real `404` to a request carrying an `Origin`, less `content-length`. `test_notfound.py` fails when the file is stale. The chart copies the file into its `-api-internal` route, and its `Lint & render` check renders the VirtualService and fails when that route's status, parsed body or `headers.response.set` differ from the file on bluebird's `main`.

The bare `/api` path gets a route of its own on the same handler, so a self-hosted instance answers it with the same JSON `404` instead of the static mount's HTML page.

## Evidence

Measured 2026-10-01 against production: `POST /api/analyze` without a key and `GET /api/nonexistent` both answered `{"detail":"No API endpoint at this path. ..."}` with `content-type` as the only header the route set, while `GET /api/version` from the pod carried the CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cache-Control: no-cache`. The `content-type` on that answer shows `headers.response.set` does apply to a `directResponse` route. In the app, `GET /api` with the static mount present answered `404 text/html` from `404.html`.

## Alternatives rejected

- Documenting the gateway's body as an exception to the contract (#565 option B). Version 1.0 would freeze a second error shape.
- A comment in each repo naming the other. That is how the body drifted in the first place.
- A tighter CSP for a JSON body (`default-src 'none'`). Defensible for a body nothing renders, but it would be a second policy invented at the edge; copying the pod's keeps the gateway's answer the pod's answer.
- Comparing against the release the chart's `appVersion` names rather than `main`. A chart PR that copies a changed body would then fail until the `appVersion` bump landed, and the bump would fail until the copy landed.

## Consequences

A header added to the pod, or a host added to its CSP, changes `edge_not_found.json` and turns every `bluebird-helm` PR red, the automated `appVersion` bump included, until a chart PR copies the change. Between this repo's merge and the chart's, the chart's own PRs fail. The check reads `raw.githubusercontent.com`, so an outage there fails a chart PR too.
