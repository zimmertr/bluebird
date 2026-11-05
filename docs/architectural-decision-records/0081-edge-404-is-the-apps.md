# 0081. The gateway's 404 is the app's, and a keyed route's CORS preflight reaches the pod

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #565 (option A, with a check pinning the two bodies that is visible but not blocking, and the preflight fixed now)
- Issues and PRs: #565, #598, bluebird-helm#280, #240, #317, #324, #132
- Cited in code as: #565
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/routes/notfound.py` and `scripts/generate_edge_not_found.py` bullets

## Context

On `bluebirdforecast.com` an `/api` path the chart does not publish, and an analyze request without `X-Open-Meteo-Key`, never reach the pod: an Istio `directResponse` in `bluebird-helm` answers them (#240, #317). That body was typed into the chart once and never followed the app. When #324 added the `error` object to the app's catch-all, the gateway kept answering `{"detail": ...}` alone, so the one `404` a keyless API caller is most likely to meet broke the contract `docs/API.md` states, and it carried none of the #132 headers either. The readiness review found both (#565, items 1 and 2).

The same rule had a second gap. A browser on another origin sends a CORS preflight before a keyed `POST`, and a preflight carries no request headers of its own, only their names in `Access-Control-Request-Headers`. So the keyed rule never matched it, the gateway answered it with the `404`, and the browser never sent the `POST`: the keyed API could not be called from a web page on another origin.

## Decision

The app owns the gateway's `404`. `backend/edge_not_found.json` records its status, body and headers, written by `scripts/generate_edge_not_found.py` from the app itself: the body is `not_found_body` (the catch-all's own builder) with `this path` for the path, because a fixed answer cannot repeat the request, and the headers are every header the app sent on a real `404` to a request carrying an `Origin`, less `content-length`. `test_notfound.py` fails when the file is stale. The chart copies the file into its `-api-internal` route.

The comparison of the two is visible, never blocking. bluebird-helm's `Edge 404` workflow renders the VirtualService and compares that route's status, parsed body and `headers.response.set` with the file on bluebird's `main`, on every chart PR and on every push to the chart's `main`. It is not a required check: branch protection requires `Lint & render` alone and auto-merge waits on required checks only, so a mismatch turns that workflow red without stopping a chart PR or the automated `appVersion` bump. The push run is what keeps a mismatch in view, because the bump merges itself within minutes and a red mark on it alone would vanish with it.

The chart's keyed rule gains a second match per prefix: `OPTIONS` with an `Origin` and an `Access-Control-Request-Method`, with no key required. The pod's `CORSMiddleware` answers that request itself, before routing, echoing the requested headers (so `X-Open-Meteo-Key` and `Content-Type` are allowed) and listing `POST` among the methods. A keyless `POST` matches neither and still gets the `404`.

The bare `/api` path gets a route of its own on the catch-all, so a self-hosted instance answers it with the same JSON `404` instead of the static mount's HTML page.

## Evidence

Measured 2026-10-01 against production: `POST /api/analyze` without a key and `GET /api/nonexistent` both answered `{"detail":"No API endpoint at this path. ..."}` with `content-type` as the only header the route set, while `GET /api/version` from the pod carried the CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cache-Control: no-cache`. The `content-type` on that answer shows `headers.response.set` does apply to a `directResponse` route. A preflight `OPTIONS /api/analyze` with `Origin`, `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: content-type,x-open-meteo-key` answered `404`, where the same preflight to `/api/capabilities` answered `200`. In the app, `GET /api` with the static mount present answered `404 text/html` from `404.html`, and the pod answered the analyze preflight `200` with `access-control-allow-headers: x-open-meteo-key, content-type`.

## Alternatives rejected

- Documenting the gateway's body as an exception to the contract (#565 option B). Version 1.0 would freeze a second error shape.
- A comment in each repo naming the other. That is how the body drifted in the first place.
- Making the comparison part of the required `Lint & render`. An app-side header change would then stall the automated `appVersion` bump and every chart PR until a copy landed (the maintainer, 2026-10-01).
- A tighter CSP for a JSON body (`default-src 'none'`). Defensible for a body nothing renders, but it would be a second policy invented at the edge; copying the pod's keeps the gateway's answer the pod's answer.
- Comparing against the release the chart's `appVersion` names rather than `main`. A chart PR that copies a changed body would wait on the `appVersion` bump, and the bump on the copy.
- An explicit `allow_headers` list on the pod naming `Content-Type` and `API_KEY_HEADER`. The wildcard already echoes both, and a list would start refusing any other header a caller sends today.
- Forwarding every `OPTIONS` on the keyed prefixes. Requiring `Origin` and `Access-Control-Request-Method` admits exactly what `CORSMiddleware` answers before routing, and nothing that would reach a route.

## Consequences

A header added to the pod, or a host added to its CSP, changes `edge_not_found.json` and turns the `Edge 404` workflow red on the next chart PR and on the chart's `main` until a chart PR copies the change; nothing is blocked meanwhile, so the gateway can send the old headers for as long as nobody acts on the red run. The workflow reads `raw.githubusercontent.com`, so an outage there turns it red too.

A preflight for any path under a keyed prefix now reaches the pod without a key. The pod answers it from `CORSMiddleware` with a `200` and an empty body, whatever the path, so it confirms nothing the API reference does not already publish and spends nothing upstream; it does cost a request on a pod, as any public SPA path does.
