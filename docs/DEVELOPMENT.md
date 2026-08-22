# Local Development

Run the backend and frontend separately when you want hot-reload.

Backend:

```bash
cd backend
pip install -r requirements.txt
LOG_LEVEL=TRACE uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server comes up on `http://localhost:5173` and proxies `/api` requests to the backend on `:8000`.

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

# Frontend unit tests (Vitest)
docker run --rm -v "$PWD/frontend":/app -w /app node:22-alpine \
  sh -c "npm ci && npm test"

# Backend unit tests (pytest)
docker run --rm -v "$PWD/backend":/app -w /app python:3.14-slim \
  sh -c "pip install -r requirements-dev.txt && pytest"

# Backend lint
pip install ruff && ruff check backend/
```

Two rules worth knowing before you send a change: any behavior change ships with
a matching test in the same PR, and any change to a route or Pydantic model
regenerates the committed OpenAPI snapshot with
`cd backend && python scripts/generate_openapi.py` (CI fails the PR otherwise).

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
  const series = (lat, lon, start, days) => {
    const time = [], precipitation = [], temperature_2m = [], wind_speed_10m = [], wind_direction_10m = []
    const t0 = Date.parse(start + 'T00:00Z')
    for (let h = 0; h < 24 * days; h++) {
      time.push(new Date(t0 + h * 3600000).toISOString().slice(0, 16))
      precipitation.push(Math.max(0, Math.sin(h / 9) * 0.04))
      temperature_2m.push(52 - (lat - 46) * 3 + Math.sin(h / 4) * 9)
      wind_speed_10m.push(5 + Math.abs(Math.sin(h / 6)) * 10)
      wind_direction_10m.push((h * 17 + lat * 30) % 360)
    }
    return { time, precipitation, temperature_2m, wind_speed_10m, wind_direction_10m }
  }
  window.fetch = function (...args) {
    const url = String(args[0]?.url ?? args[0])
    if (!url.includes('open-meteo')) return real.apply(this, args)
    const u = new URL(url)
    const lats = (u.searchParams.get('latitude') || '').split(',').map(Number)
    const lons = (u.searchParams.get('longitude') || '').split(',').map(Number)
    const start = u.searchParams.get('start_date')
    const end = u.searchParams.get('end_date')
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
    const aqi = url.includes('air-quality')
    const body = lats.map((lat, i) => {
      const s = series(lat, lons[i], start, days)
      return {
        latitude: lat,
        longitude: lons[i],
        utc_offset_seconds: 0,
        timezone: 'GMT',
        elevation: 1000,
        hourly: aqi ? { time: s.time, us_aqi: s.time.map(() => 35) } : s,
      }
    })
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  }
  console.log('[bluebird] Open-Meteo stubbed. Values are synthetic. Reload to undo.')
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
