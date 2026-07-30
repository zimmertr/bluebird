# Traffic: how requests reach Bluebird, and what Bluebird calls

[`CICD.md`](CICD.md) covers how code becomes a running deployment. This page
covers the running deployment's traffic: the path a request takes from a
browser to a pod, every external API the system talks to, and the rate
limiting that protects the shared free services underneath. It exists because
half of this configuration (Cloudflare, upstream usage policies) lives outside
this repo, and undocumented edge config is unreproducible edge config.

## Inbound: browser to pod

```mermaid
flowchart LR
    U[Browser / API client] --> CF[Cloudflare proxy\nbluebirdforecast.com]
    CF --> O[Origin: residential IP\nsingle port-forward]
    O --> IG[Istio ingress gateway]
    IG --> VS[VirtualService bluebird\ncanary weights]
    VS --> P1[pod]
    VS --> P2[pod]
    VS --> P3[pod]
```

- **Cloudflare** proxies the zone (orange-cloud DNS). It terminates the public
  TLS session, hides the origin IP, and is where the coarse edge rate rule
  lives (below). It sets `CF-Connecting-IP` on every forwarded request, and
  overwrites any value the client sent.
- **The origin** is a single port-forward on a residential IP. Until
  [#148](https://github.com/zimmertr/bluebird/issues/148) moves ingress to a
  Cloudflare Tunnel, someone who discovers that IP can reach the cluster
  without passing Cloudflare, which is why the app never *trusts* Cloudflare
  to have filtered anything (see "Client identity" below).
- **Istio** routes `bluebirdforecast.com` through the `bluebird`
  VirtualService to the stable/canary services managed by Argo Rollouts
  (3 replicas stable; roughly double mid-rollout).

There is deliberately **no Envoy/Istio rate limiting layer**. Istio still has
no first-class rate-limit API; the mechanism is a raw `EnvoyFilter` wrapping
`envoy.filters.http.local_ratelimit`, which is per-pod (same imprecision as
the app's own limiter), can't key on client address without brittle descriptor
config, and is the most version-sensitive kind of YAML in the stack. Both jobs
it could do are already covered: Cloudflare rejects floods before they cross
the ocean, and the app enforces the precise per-client and per-upstream
limits. Decision recorded in
[#75](https://github.com/zimmertr/bluebird/issues/75).

## Edge rate rule (Cloudflare)

One zone rate-limiting rule backstops everything, at the only layer that sits
in front of the whole cluster:

| | |
| --- | --- |
| Ruleset | `Bluebird API rate limit` (phase `http_ratelimit`) |
| Expression | `(starts_with(http.request.uri.path, "/api/"))` |
| Threshold | 20 requests per 10 seconds, counted per `ip.src` + `cf.colo.id` |
| Action | Block for 10 seconds (the free-plan mitigation window), `429` + `Retry-After: 10` |

The rule is blunt on purpose: normal use (a page load, an analysis, a search)
is a handful of `/api` calls, so a client tripping it is hammering. The app's
own limits are the precise ones. This rule is configured via the Cloudflare
API, not in git; if it changes, change this table in the same breath.

> **Status:** applied and verified 2026-07-28 — a 25-request burst passed ~20,
> then received edge `429`s with `Retry-After: 10`, recovered after the
> window, and left non-`/api/` paths untouched. Counting is per Cloudflare
> colo, so a client spread across colos can briefly exceed the nominal
> threshold; the app-layer limits below are the precise backstop.

## App-layer limits

Two mechanisms in `backend/app/ratelimit.py`, both in-memory and per pod.
With R replicas the effective ceiling is about R times the configured number;
that slop is accepted (the goal is a bound, not precision), and the shared
datastore planned in [#65](https://github.com/zimmertr/bluebird/issues/65)
can make both exact later. All knobs are env vars, documented in the
[CONFIGURATION.md table](CONFIGURATION.md#configuration) and published to
clients by `GET /api/capabilities`.

**Per-client token buckets** on the expensive routes only. Over the limit:
`429` + `Retry-After`.

| Bucket | Routes | Default |
| --- | --- | --- |
| analyze | `POST /api/analyze`, `POST /api/analyze/stream` | 12/min, burst 6 |
| destinations | `POST /api/destinations` | 30/min, burst 10 |
| geocode | `GET /api/geocode` | 30/min, burst 10 |

Destinations is deliberately its own bucket (issue #180): discovery is one
map query with no forecasts, and sharing the analyze bucket let the browser
flow starve real analyses.

**Pod-wide upstream budgets** capping what all concurrent requests may have
in flight against each provider. Saturation queues up to
`UPSTREAM_BUDGET_WAIT_S` (30s), then sheds: `503` + `Retry-After` (the SSE
stream reports it as an `error` event; best-effort AQI just degrades to
null). A `500` is never the answer to load.

### Client identity

Rate limiting keys on, in order: `CF-Connecting-IP` (Cloudflare overwrites
it, so proxied traffic can't rotate it), else the **rightmost**
`X-Forwarded-For` hop (each proxy appends to the right, so that's the peer
our edge actually saw; the leftmost hop is client-typed and rotating it must
not mint fresh buckets), else the socket peer. The access log prints the same
value enforcement counted.

Honest caveat: traffic that reaches the origin directly (bypassing
Cloudflare) can forge both headers until #148 closes that path. The upstream
budgets are the backstop a spoofer cannot bypass, because they don't care who
you claim to be.

## Outbound: what calls what

| Provider | Called by | From | Policy | Governor |
| --- | --- | --- | --- | --- |
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | backend (`osm.py`), 1 query per discovery/analysis plus 1 to resolve a custom list's coordinates (batched, so one query covers a whole 100-row paste), 3-mirror failover | cluster egress IP | ~2 slots per IP **per mirror operator** (overpass-api.de documents 2) | `UPSTREAM_CONCURRENCY_OVERPASS=2` per pod **per mirror** — one budget per endpoint, slot held only while that mirror's request is in flight, released before failover |
| [Open-Meteo forecast](https://open-meteo.com) | **browser** (`openMeteo.ts`) for the web app; backend (`weather.py`) only for API callers and the browser's fallback | each visitor's own IP; cluster egress IP for the server path | **weighted calls** per IP: 600/min, 5,000/hr, 10,000/day (see accounting below), non-commercial | browser: a rolling ~550 weighted/min pacer on the visitor's own quota, a 15-min per-location result cache, one automatic minutely-429 resume, and abort-on-first-failure so nothing spends after the outcome is decided. Server path: `UPSTREAM_WEIGHT_PER_MINUTE_WEATHER=550` per pod — the full safe rate on **every** pod, not a per-replica share, because one analysis runs end to end on one pod and must cover its whole fan-out. The cluster can therefore exceed 550/min when several pods fetch at once; accepted, since this path is the exception and the per-minute pacer never bounded the hourly or daily quotas anyway (issue #65's shared store is the exact fix) + in-flight cap 4 + the same cache |
| [Open-Meteo air quality](https://open-meteo.com/en/docs/air-quality-api) | same split, best-effort on both paths, fetched **lazily**: only for the displayed rows unless the ranking key is an AQI metric | same split | same accounting, metered separately | browser and server: same pacing shape (`UPSTREAM_WEIGHT_PER_MINUTE_AQI=550` per pod, undivided for the same reason), failures degrade to null, and the first 429 short-circuits the remaining AQI batches |
| [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | backend (`geocode.py`) proxying the search box | cluster egress IP | absolute ~1 req/s per service, real User-Agent required | `NOMINATIM_MIN_INTERVAL_MS=3500` spacing per pod (~0.86/s aggregate at 3 replicas; the previous 2s ≈ 1.5/s quietly exceeded the policy) + per-client geocode bucket |
| [NIFC WFIGS](https://data-nifc.opendata.arcgis.com) (wildfire overlay) | **browser**, per viewport | each visitor's own IP | public ArcGIS service | none needed; load scales with visitors, not with us |

Everything the browser fetches itself costs our egress IP nothing — that is
[#170](https://github.com/zimmertr/bluebird/issues/170): the web app calls
`POST /api/destinations` (one Overpass query) and attaches forecasts itself,
so a browser analysis spends the visitor's Open-Meteo quota, not ours. A
custom-CSV analysis makes that one call too, to resolve its coordinates
against OSM for the elevation a coordinate pair cannot carry
([#207](https://github.com/zimmertr/bluebird/issues/207)) — cheap, cached per
coordinate set, and skipped entirely when every row already knows its
elevation, which is why a pins-only refresh still touches no server endpoint
at all (an accepted observability trade: those analyses do not appear in
server logs). The browser aggregation is pinned to the backend's by the shared
vectors in `weather_vectors.json`, and when Open-Meteo is unreachable from a
browser (corporate proxies), the SPA falls back to the server pipeline.
Nominatim can never move client-side: its policy requires an identifying
`User-Agent`, which browsers refuse to set.

## Weighted-call accounting

Open-Meteo does not bill HTTP requests. Per their published accounting
(pricing page and the official multi-location post):

    weight = locations × max(1, days/14) × max(1, variables/10)

so a 50-location batch costs at least 50 calls, and the full 16-day window
makes it 57. The per-factor floor is inferred from observed enforcement, not
documented (issue #180 tracks the upstream confirmation); assuming it is the
conservative choice. **Every capacity number in this file is written in this
unit** — the 2026-07-29 incident happened because three layers of this
system priced spend in HTTP requests and were consistently wrong by the
batch factor of 50.

## Worst-case math

One analysis of 1,500 destinations (the `MAX_ANALYZE_PEAKS` cap) over the
full 16-day window costs ~1,710 weighted weather calls (1,500 × 16/14), plus
AQI for the displayed rows only (≤ the `limit`), against a 600/minute/IP
budget — call it **~3 minutes of paced fetching, worst case**, narrated in
the UI with a countdown. A repeat of the same analysis inside the cache TTL
costs ~0. For a browser analysis all of that lands on the visitor's own IP
and the server pays 1 Overpass query (or 0, within the 10-minute discovery
cache); the full spend lands on the cluster egress IP only for direct API
callers and the browser's unreachable-fallback, where the per-pod weighted
budgets (550/min per service, the full safe rate on every pod) pace it. The
per-client buckets bound one address to 12 analyses + 30 discoveries per
minute per pod; the in-flight caps (4+4+2-per-mirror) bound burst
concurrency. Multiply by replicas for the cluster ceiling — and note that
replica count is now autoscaled (3 to 10) rather than fixed, on top of a
canary roughly doubling it for a rollout's duration, so the cluster ceiling is
a range, not a number. That looseness is why these budgets are deliberately
per-pod ceilings rather than a rationed share; issue #65's shared store is
what would make the cluster figure exact. Re-derive this paragraph if any
constant in it changes.
