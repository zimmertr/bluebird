# 0172. Every upstream host is an environment variable, and the browser's six are published at runtime on `/api/config`

- Status: Accepted
- Date: 2026-10-17
- Decider: the maintainer (TJ), on issue #224: runtime config over the issue's own `VITE_` plan, every host rather than the Open-Meteo pair, and the chart declaring each at its production value.
- Issues and PRs: #224, #692 (the load test this unblocks), #317 (the keyed hosts), #132 (the CSP)
- Cited in code as: #224
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, "Every host the pod or the web app calls is an environment variable"; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `env.py`, `browser_upstreams.py`, `security_headers.py`, `routes/config.py` and `osm/mirrors.py` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `upstreams.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useConfig.ts` bullet; [`docs/CONFIGURATION.md`](../CONFIGURATION.md); [`docs/TRAFFIC.md`](../TRAFFIC.md)
- Related: 0006 (published limits read at runtime), 0025 (the keyed hosts), 0173 (the simulator these point at)

## Context

Seventeen hosts were module literals in seven backend modules and five frontend ones. Nothing could point the pod or the page anywhere else without a code change, so a development stack spent real Open-Meteo quota on every reload, the load test in #692 had no way to stub the pod's suppliers, and the keyed path to Open-Meteo's customer hosts (#317) could not be exercised without a paid key. The issue proposed `VITE_` variables for the browser. The frontend reads no build-time environment at all, the image is built once and deployed everywhere, and the pod already publishes runtime settings to the page on `GET /api/config`.

## Decision

- **Every host the pod calls is an environment variable**, read at import through `env_url` in `env.py` into the module name the services always had. Eleven of them: the six Open-Meteo endpoints (free and customer, for forecast, archive and air quality), the Overpass chain as one comma-separated `OVERPASS_URLS`, Nominatim, the NIFC perimeter layer, the Forest Service's ArcGIS base and NOAA's HMS directory. `env_url` keeps the value exactly as set, because every caller appends its own paths, and a value that does not start with `http://` or `https://` is logged and ignored, the posture `env_int` already had.
- **The six hosts the web app calls are `BROWSER_*` variables** in `browser_upstreams.py`. `GET /api/config` publishes them under `upstreams`, and `security_headers.py` builds `connect-src` and `img-src` from their origins. One module feeds both, so the policy allows exactly what the page was told to fetch.
- **The page reads them at runtime.** `utils/upstreams.ts` holds the production literals as the fallback, every consumer reads `upstreams()` where it builds a URL, `useConfig` sets them before it reports `settled`, and `MapStage` mounts the map only after that, since MapLibre reads its style URL once at construction. A link's run on open waits for the same flag.
- **Unset is byte-identical**: the same CSP string, the same requests, and a config body that differs only by the new member. The chart declares all seventeen at their production values, so a cluster sees them and changes nothing.

## Evidence

- Measured 2026-10-16 on `main` at b6d1ade: no `import.meta.env` or `VITE_` anywhere under `frontend/`, and no base URL read from the environment anywhere under `backend/app/` (the issue's 2026-10-08 comment lists the eleven literals).
- The unset CSP is held to `backend/edge_not_found.json` by `test_security_headers.py`, which did not change.
- The cold-load cost of the map waiting for `/api/config` is recorded on the PR: one same-origin request the page already made, now awaited before the map constructs.

## Alternatives rejected

- **Build-time `VITE_` variables**, as the issue first wrote. A simulator-pointed stack would be a second image build, the policy would still need the env, and the dev server would need its own `.env`. Two sources of truth for one fact.
- **A single simulator base URL** that every host derives from. The acceptance line was every host configurable, and the chart convention is one declared variable per knob.
- **Publishing the hosts on `/api/capabilities`.** That endpoint is the limits requests are validated against; `/api/config` is documented as deployment-specific settings the page reads on load, which is what these are.

## Consequences

- `test_env.py` pins `env_url`; a test per converted module proves its variable is honoured and its default stands; `test_osm.py` pins the unset two-mirror chain and a one-URL chain; `test_config.py` the published defaults; `test_security_headers.py` the derived policy and the unset string. On the browser side `upstreams.test.ts`, `useConfig.test.tsx`, `MapStage.test.tsx` and a case in each consumer's test hold the seam, and `coldLoad.test.ts` keeps the preconnect hints at the production defaults.
- `test_security_headers.py` still reads `frontend/src` for `https://` hosts, so the six production literals stay spelled in `upstreams.ts`, and a new host in the bundle still fails the suite until the policy classifies it.
- A pasted coordinate's tile lookup is not gated on `settled`; a paste in the first instant before the config answers reads the production tile host. Under the simulator's policy that fetch is refused by the CSP before it leaves, and the rows fall to the pod as an unreadable tile always has.
