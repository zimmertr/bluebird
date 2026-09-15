# Local Development

Run the backend and frontend separately when you want hot-reload.

Backend:

```bash
cd backend
pip install -r requirements.txt
LOG_LEVEL=TRACE uvicorn app.main:app --reload --port 8000
```

While it runs, Prometheus metrics are served at `http://localhost:9464/metrics`
(its own port, never a route on the app — see
[ARCHITECTURE.md](ARCHITECTURE.md#metrics)); set `METRICS_PORT=0` to turn that
off.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server comes up on `http://localhost:5173` and proxies `/api` requests to the backend on `:8000`. `npm run build` produces `dist/` the way the image does, and `npm run preview` serves that build.

To run the whole stack the way it ships instead, build the image and bring it up
detached:

```bash
docker compose up --build -d
docker compose logs -f
```

## Tests and Checks

CI runs all of these on every PR, so run the ones your change touches first:

```bash
# Frontend typecheck
cd frontend && npx tsc --noEmit

# Frontend lint (ESLint). The linter installs itself, so this needs no
# `npm ci` of its own. See the note below for why it is a package apart.
docker run --rm -v "$PWD":/repo -w /repo/frontend node:22-alpine \
  sh -c "npm run lint"

# Frontend unit tests (Vitest)
docker run --rm -v "$PWD/frontend":/app -w /app node:22-alpine \
  sh -c "npm ci && npm test"

# Frontend API types still match the committed OpenAPI snapshot
# (`npm run generate:api` rewrites them instead of checking them).
# Mounts the repo root, because the generator reads backend/openapi.json.
# The script installs the generator first, so this needs no `npm ci` of its own.
docker run --rm -v "$PWD":/repo -w /repo/frontend node:22-alpine \
  sh -c "npm run check:api"

# Backend unit tests (pytest). The whole repository is mounted, not backend/
# alone: one test reads frontend/src to check the CSP allowlist against the
# hosts the browser actually fetches, and it skips where it cannot see them.
docker run --rm -v "$PWD":/repo -w /repo/backend python:3.14-slim \
  sh -c "pip install -r requirements-dev.txt && pytest"

# Backend lint, at the version CI pins: ruff's default rule set changes between
# releases. Run it from the REPO ROOT, which is what CI does. The rules live in
# backend/ruff.toml, and `known-first-party = ["app"]` there is what makes the
# import order the same from either working directory.
docker run --rm -v "$PWD":/repo -w /repo python:3.14-slim \
  sh -c "pip install ruff==0.16.0 && ruff check backend/"
```

### The cold-load budgets

CI audits the first screen with Lighthouse and fails the PR when a byte or
timing budget is crossed (issue #337). To run the same audit locally, build the
image, serve it on a docker network, and point Lighthouse CI at it from a
container that already carries Chromium:

```bash
docker build -t bluebird:lh .
docker network create lh-net 2>/dev/null || true
docker run -d --rm --name lh-target --network lh-net bluebird:lh

docker run --rm --network lh-net -v "$PWD":/repo -w /repo \
  -e CHROME_PATH=/usr/bin/chromium-browser \
  --entrypoint sh zenika/alpine-chrome:with-node -c \
  "npx -y @lhci/cli@0.15.x autorun --config=.github/lighthouserc.js \
     --collect.url=http://lh-target:8000/"

docker rm -f lh-target
```

The budgets themselves, and why the audit blocks every third-party host, are in
`.github/lighthouserc.js`. Reports land in `.lighthouseci/` (git-ignored); the
CI run keeps the same files as a workflow artifact. Measure before and after
whenever a change could touch what the first screen loads, and put both numbers
on the PR.

Two rules worth knowing before you send a change: any behavior change ships with
a matching test in the same PR, and any change to a route or Pydantic model
regenerates the committed OpenAPI snapshot with
`cd backend && python scripts/generate_openapi.py`, then the frontend types read
off it with `cd frontend && npm run generate:api` (CI fails the PR otherwise, on
both counts).

A third: any change to the weather or air-quality aggregation regenerates the
shared test vectors. Change the backend first, then
`cd backend && python scripts/generate_weather_vectors.py`, copy
`tests/data/weather_vectors.json` to `../frontend/src/utils/weather_vectors.json`,
and mirror the change in the TypeScript port in `frontend/src/utils/openMeteo.ts`.
Pytest fails on a stale backend copy, Vitest fails on a drifted port, and the
`vectors` CI job fails if the two copies differ.

ESLint is not a frontend dependency either, and for a sharper version of the
same reason. It lives in `frontend/tools/eslint`, a private package with its own
lockfile, and `npm run lint` delegates to it. typescript-eslint reads the
TypeScript compiler API at run time and **refuses TS 7 outright**; the TS 7 npm
package no longer ships that JS API at all, so the linter carries its own
TypeScript 6. This is the side-by-side arrangement TypeScript documents for the
case. The config is `frontend/tools/eslint/eslint.config.js`, and its paths are
written for a run whose working directory is `frontend/` — ESLint reads a
`--config` file's patterns against the working directory rather than against the
file's own folder.

The generator is not a frontend dependency. It lives in
`frontend/tools/api-types`, a private package with its own lockfile, and the two
frontend scripts only delegate to it. `openapi-typescript` loads the TypeScript
compiler API at run time and peers on TypeScript 5, the app runs TypeScript 7,
and npm resolves one version of a peer. A package rather than a version inside a
script also gives Dependabot something to bump. It installs on demand, so
`npm ci` in `frontend/` stays as fast as it was.

## Testing the browser path without spending quota

> A stopgap for [#224](https://github.com/zimmertr/bluebird/issues/224), which
> tracks mocking the providers properly. This covers only the browser's
> Open-Meteo calls, which is the half a backend mock cannot reach.

Open-Meteo is fetched **from the visitor's own browser against the visitor's own
IP**, so a regression-testing session spends the quota of whoever is sitting at
the machine — and anyone else behind the same address. A morning of manual
testing can leave the real app answering `Open-Meteo quota reached. Try again
later.` for the rest of the hour, which is indistinguishable from a real
outage.

Paste this into the browser console before pressing Analyze and every forecast
request is answered locally instead. **The numbers it returns are invented** —
a latitude-driven gradient with a daily wave — so it is for exercising layout,
state and interaction, never for judging a forecast.

```js
(() => {
  const real = window.fetch
  const series = (lat, lon, start, end) => {
    const time = [], precipitation = [], temperature_2m = [], wind_speed_10m = [], wind_direction_10m = []
    const freezing_level_height = []
    const t0 = Date.parse(start + 'Z'), t1 = Date.parse(end + 'Z')
    for (let h = 0; t0 + h * 3600000 <= t1; h++) {
      time.push(new Date(t0 + h * 3600000).toISOString().slice(0, 16))
      precipitation.push(Math.max(0, Math.sin(h / 9) * 0.04))
      temperature_2m.push(52 - (lat - 46) * 3 + Math.sin(h / 4) * 9)
      wind_speed_10m.push(5 + Math.abs(Math.sin(h / 6)) * 10)
      wind_direction_10m.push((h * 17 + lat * 30) % 360)
      freezing_level_height.push(9000 - (lat - 46) * 500 + Math.sin(h / 5) * 1200)
    }
    return { time, precipitation, temperature_2m, wind_speed_10m, wind_direction_10m, freezing_level_height }
  }
  window.fetch = function (...args) {
    const url = String(args[0]?.url ?? args[0])
    if (!url.includes('open-meteo')) return real.apply(this, args)
    const u = new URL(url)
    const lats = (u.searchParams.get('latitude') || '').split(',').map(Number)
    const lons = (u.searchParams.get('longitude') || '').split(',').map(Number)
    const start = u.searchParams.get('start_hour')
    const end = u.searchParams.get('end_hour')
    const aqi = url.includes('air-quality')
    const body = lats.map((lat, i) => {
      const s = series(lat, lons[i], start, end)
      return {
        latitude: lat,
        longitude: lons[i],
        utc_offset_seconds: 0,
        timezone: 'GMT',
        elevation: 1000,
        hourly: aqi ? { time: s.time, us_aqi: s.time.map(() => 35) } : s,
        // The freezing level's unit follows `precipitation_unit`, so a real
        // response to these requests quotes it in feet. Declared here too, or
        // a stubbed session would exercise the meters branch alone.
        hourly_units: aqi ? {} : { freezing_level_height: 'ft' },
      }
    })
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  }
  console.log('[bluebird-forecast] Open-Meteo stubbed. Values are synthetic. Reload to undo.')
})()
```

Reload the page to remove it. Two things it will not do: the destination search
still goes to the pod (and through it to Overpass), and the per-location cache
means a window you have already fetched is served from memory rather than from
the stub, so change the dates if you need a fresh fetch.

To force the paths that are otherwise hard to reach, add a branch to the
`fetch` above: return a `429` whose body reads
`{"reason": "Minutely API request limit exceeded."}` with a `Retry-After`
header to see the pacing countdown, or wrap the response in a `setTimeout` to
hold a loading state still. Gate a 429 on `!url.includes('air-quality')`, or
the air-quality fetch running alongside will swallow it and degrade silently
instead.
