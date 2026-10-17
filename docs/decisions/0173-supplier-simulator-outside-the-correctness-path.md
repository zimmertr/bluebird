# 0173. A supplier simulator stands in for every data supplier in development, and stays out of CI's correctness path

- Status: Accepted
- Date: 2026-10-17
- Decider: the maintainer (TJ), on issue #224: the simulator over record-and-replay fixtures and a caching proxy; Python under `sim/`; the basemap tiles simulated too, so nothing leaves the machine; a control endpoint for its failure modes; a compose overlay with `make` targets.
- Issues and PRs: #224, #180 (the 2026-07-29 quota incident), #248 (the console stopgap this replaces), #692
- Cited in code as: #224
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, "Every host the pod or the web app calls is an environment variable", and Development commands; [`sim/CLAUDE.md`](../../sim/CLAUDE.md); [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), "The supplier simulator"
- Related: 0172 (the hosts it stands behind), 0115 (nothing in CI reads a live tile), 0118 (a tile that is no tile sends the ring to the map server)

## Context

Open-Meteo meters each address at 600 weighted calls a minute and 10,000 a day, per service, and the page spends that from the visitor's own address. An afternoon of manual testing exhausted it and took the PR preview down for everyone on the same network (#224, 2026-08-05), and the paths behind the 2026-07-29 incident (#180), the pacer, the 429 parse, the over-cap refusal and best-effort AQI, could not be provoked on demand at all. The console `fetch` stub from #248 covered the browser's Open-Meteo calls alone, per tab, and died on reload. Since #675 the basemap's zoom-14 tiles are a data supplier too, so a stack that left them live would never send a ring's peaks and lakes to a simulated Overpass.

## Decision

- **One Python origin, `sim/`, on port 8080**, answers every supplier the pod and the page reach: the six Open-Meteo endpoints with the customer hosts checking a key the way Open-Meteo does, Overpass, Nominatim, NIFC, the five Forest Service closure layers, NOAA's dated HMS file, the basemap's style, TileJSON, zoom-14 vector tiles, glyphs and sprites, IEM's radar tiles and NOAA's snow renders with the identify readout. FastAPI on the backend's own hashed lock, so it adds no dependency manifest. Its Dockerfile is its own and its directory is in `.dockerignore`, so it ships in no image.
- **Every value is a pure function of place, hour and model.** A latitude gradient and a daily sine wave, as the issue proved was enough; one lattice module gives every place its one id, name and elevation across every supplier, so the summit in a tile is the summit Overpass discovers. Same request, same bytes, forever.
- **The basemap is simulated too**, as a blank ground with the lattice's peaks and lakes and empty glyph answers, so the map draws no text. The maintainer took that over labels for a vendored glyph file, and over leaving the tiles live, because offline and deterministic was the point.
- **Failure modes are a control document**, `GET`, `PUT` and `DELETE /control`: a fault per endpoint with a status, a reason, a `Retry-After`, a delay and a count, plus a forced candidate count for the over-cap refusal. Nothing fails on its own. A one-shot 429 is what the pacer's resume needs, and a persistent variable could not express it.
- **It is a convenience, never an oracle.** No CI job points the app at it. CI runs the simulator's own suite in the Backend Tests job, so a pod change the simulator no longer satisfies fails the PR that makes it. Pytest and `weather_vectors.json` remain the aggregation's truth. The simulator's own tests push its bodies through the pod's real readers, which is the guard against a sim that lies by being plausible.
- **A compose overlay and four `make` targets** start it: `make sim` brings the stack up pointed at it, `make sim-down` tears it down, `make test-sim` runs its tests and `make typecheck-sim` its mypy; `make lint-backend` covers `sim/` too. `sim/pod.env` carries the same seventeen variables for a uvicorn on the host.

## Evidence

- The issue's 2026-08-05 comment: a latitude gradient plus a daily wave exercised the table, the marker colours, the legend bands, the grid overlay, playback and the chart with no need for plausible meteorology.
- The 2026-07-29 incident (#180) and the 2026-08-05 preview outage are the costs the simulator removes; both are dated in the issue.
- No dated performance measurement: the simulator runs on a developer's machine and never in production.

## Alternatives rejected

- **Record and replay** (the issue's option B): only what was recorded, a quota hit for every new polygon, fixtures that rot silently, and the refusal and 429 cases hand-written anyway.
- **A caching proxy** (option C): TLS interception for the browser, the first run of every query still spent, and nothing for the failure paths.
- **Leaving the basemap tiles live.** Real names and a real map, but a ring's peaks and lakes would never reach the simulated Overpass, and the stack would need the network.
- **A vendored glyph range** so the simulated map could label places. A binary blob and a notice entry for text on a development map.
- **Env vars on the simulator for its failure modes.** Every change recreates the container and drops the per-location cache the failure is meant to be seen against.
- **TypeScript**, to reuse the test encoder and the Playwright fixtures. A new package, lockfile and Dependabot entry, and the pod-side suppliers written fresh either way.

## Consequences

- `sim/tests/` holds every answer to the pod's own readers (unit check and aggregation, the Overpass classifier, the ArcGIS pager and error shape, `parse_kml`), to determinism, and to the control document's faults; `make test-sim` runs them in the same Python image as the backend's suite.
- A sim test holds `sim/compose.yml`, `sim/pod.env` and the app's `env_url` reads to one set of seventeen names, so a host added to the app without a simulator entry fails.
- The `docs/DEVELOPMENT.md` section on testing without quota is the simulator's; the console stub is gone.
- What it costs: a second implementation of each supplier's contract, which drifts from reality by design and catches no real upstream schema change. The pytest stubs and the pinned vectors are where that is caught.
