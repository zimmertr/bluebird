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

CI runs all of these on every PR, so run the ones your change touches first.
Each is one `make` target at the repo root, and each target runs its check
inside Docker, so nothing needs installing on the host beyond Docker and
`make`:

| Target | What it runs |
|---|---|
| `make typecheck` | `npx tsc --noEmit` over the frontend |
| `make lint-frontend` | `npm run lint` (ESLint), then the self-test that proves the rules are not vacuous |
| `make test-frontend` | `npm ci && npm test` (Vitest) |
| `make check-api` | `npm run check:api`: the frontend API types still match the committed OpenAPI snapshot |
| `make test-backend` | `pytest` |
| `make check-openapi` | `python scripts/generate_openapi.py --check`: the committed snapshot still matches the app |
| `make typecheck-backend` | `mypy app` at the version `requirements-dev.txt` pins, with the settings in `backend/mypy.ini` |
| `make lint-backend` | `ruff check backend/` at the version CI pins |
| `make lighthouse` | the cold-load audit below |
| `make browser` | the browser suite below |

The `Makefile` is the list of commands, and every target has the same shape.
This is `make test-frontend`, typed out:

```bash
docker run --rm -v "$PWD":/repo -w /repo/frontend node:$(cat .node-version)-alpine \
  sh -c "npm ci && npm test"
```

One Vitest run covers two projects, split by file extension: `node` runs every
`*.test.ts` (pure logic, no DOM) and `dom` runs every `*.test.tsx` (a component
rendered in jsdom and driven with Testing Library). Add `-- --project dom` (or
`node`) to the `npm test` above to run one of them.

Five things that shape follows from:

- **Every container mounts the repo root**, never `frontend/` or `backend/`
  alone. Two browser suites read the manifests the backend commits under
  `backend/tests/data/`, the API type check reads `backend/openapi.json`, one
  backend test reads `frontend/src` to check the CSP allowlist against the
  hosts the browser actually fetches (it skips where it cannot see them), and
  a bare `frontend/` mount lets Tailwind scan a stale `dist/`.
- **The Node major lives in `.node-version` alone.** The Makefile reads it for
  every container and CI reads it through `setup-node`, so the checks run on
  the runtime the image builds the app with. The `Dockerfile` cannot read a
  file in a `FROM` line, so it keeps a literal tag, and
  `backend/tests/test_node_version.py` fails when the two disagree.
- **`lint-frontend` and `check-api` run no `npm ci`.** The linter and the type
  generator are packages apart, and each script installs its own (see the
  notes below).
- **`typecheck-backend` installs the app's own dependencies**, not mypy
  alone. The pydantic plugin and the FastAPI and Starlette signatures it
  checks against come from them, and without them those calls read as `Any`
  and hide real errors.
- **`lint-backend` runs from the repo root**, which is what CI does. The rules
  live in `backend/ruff.toml`, and `known-first-party = ["app"]` there is what
  makes the import order the same from either working directory. Ruff is
  pinned because its default rule set changes between releases.

### Where a source check lives

Some rules are about what a file SAYS rather than what it does: a component
must not spell a hue, `App.tsx` must not key an effect on a per-keystroke
array, one module alone may call `fetch`. Those used to be Vitest files that
imported a source with `?raw` and searched its text. Since issue #408 the rule
of where one lives is the one in the root `CLAUDE.md`, decided by what the check
needs to know:

- **A ban or a presence rule over one tree's syntax is a lint.** It lives in
  `frontend/tools/eslint/`: the class bans in `eslint.config.js`, and every
  per-file check under `checks/` as a rule of its own (`plugin.js` says how a
  check is written). A lint reads the syntax tree, so a comment about a rule is
  not a violation of it, and it reports the line in the editor. Each check has
  fixtures under `fixtures/checks/`, and `selftest.js` fails unless they report
  every message the check carries, alone and at the check's real file.
- **A measurement or a comparison between two artifacts stays a test.** A
  contrast ratio, a pixel sum, a count of approved tooltips, a source against a
  value a module exports, TypeScript against Python, `index.html` against the
  sources, CSS (which ESLint does not parse).
- **A few text tests stay by decision**, named below.
- On the backend, a banned import is a ruff rule: `TID251` in
  `backend/ruff.toml` fails a bare `HTTPException` wherever a request is
  answered.

The per-file checks, by module:

| Module | Checks | What they hold |
|---|---|---|
| `checks/accessibility.js` | `glyphs-hidden`, `markup-glyph-hidden`, `new-tab-anchors-named`, `model-picker-roles`, `compare-notes-no-control`, `disabled-reason-twin` | Every glyph is `aria-hidden`; a new-tab link says so; the model picker's roles and names; the chart's notes carry no control; every `aria-describedby` has an `SR_ONLY` twin |
| `checks/app.js` | `app-effect-keys`, `app-chart-selection`, `app-memoized`, `app-memo-props`, `results-panels-memo-props`, `app-panel-point-sample`, `app-arriving-field`, `app-resize-grips`, `app-results-mode` | `App.tsx`'s effects and memoized children: no effect keyed on a per-keystroke array, stable props on the three memoized components, the Metrics table's one-hour flag read off the panel and the results table's off the report, one `ResizeGrip` spelling, the results bar and mode control |
| `checks/app.js` | `forecast-selection-hook`, `ranking-knobs-hook`, `results-layout-hook`, `destination-inputs-hook`, `draw-mode-hook`, `presented-report-hook`, `report-csv-rows-keys`, `analyze-command-hook`, `timeline-hook`, `chart-compare-hook`, `table-view-hook`, `export-csv-fire-gate` | The hooks cut out of `App.tsx` (#409): each carries the requirements its subject took with it, and a count of the effects it took, so `app-effect-keys`' floor for `App.tsx` and the hook counts add up to the effects there were |
| `checks/app.js` | `app-legend-anchors`, `map-legend-anchors`, `layers-popover-dismiss`, `app-transport-anchor`, `app-docked-panels` | No bottom offset or bottom-anchored legend spelled in a component; the Layers popover closes on a click away and on Escape; the docked panel defaults and floors |
| `checks/app.js` | `grid-layer-hook`, `app-grid-gate`, `app-grid-asked-once`, `app-grid-pixels`, `app-paced-fetch`, `app-grid-pace`, `app-compare-pace`, `app-compare-pace-bar` | One flag gates the forecast grid; the grid gets decoded pixels; every paced fetch hands over `onPace` and clears its wait |
| `checks/app.js` | `app-url-writes`, `app-no-storage`, `app-pair-color`, `app-pair-color-index`, `app-pair-color-rows` | `App.tsx` writes history in one place and names no storage; one allocator gives every comparison colour |
| `checks/data.js` | `one-api-door`, `schema-types-only`, `entries-inside-boundary`, `chart-lazy`, `chart-never-static`, `logo-hashed` | One module calls `fetch`; the generated schema is imported for types; every entry renders inside the boundary; the chart loads lazily; the logo is the hashed asset |
| `checks/data.js` | `area-cap-published`, `archive-reach-published`, `aqi-horizon-published`, `panel-limit-props`, `calendar-limit-args`, `aqi-fetch-horizon-arg` | A published limit is read from `/api/capabilities` and reaches a surface as a prop or an argument, never as a number |
| `checks/data.js` | `open-meteo-throw-tail`, `open-meteo-copy`, `comparison-blocker-copy`, `snow-mark-shared` | Error copy ends on the standing tail and avoids the retired phrases; the approved blocker lines; the snow mark comes from one module |
| `checks/data.js` | `column-drag-shared`, `column-drag-header`, `column-drag-picker`, `drag-ghost-inert` | Both surfaces that reorder columns use the shared gesture module |
| `checks/map.js` | `map-view-wiring`, `map-shared-rules`, `map-home-basemap`, `map-home-popups`, `map-home-results` | `MapView.tsx` declares no helper, adds no source or layer, listens for `load` alone, opens no popup, mounts every feature once through `mountFeatures`, seeds no ref from a prop, reads the restored ring only on load, writes the controller in one effect, is exported as `memo(MapView)` and imports `map.css`; every map helper has one home |
| `checks/map.js` | `map-basemap-layers`, `map-basemap-declares`, `map-grid-declares`, `map-results-declares`, `map-poi-declares`, `map-popups-declares`, `map-attribution-folded`, `map-grid-layer` | The clickable peaks and lakes share one floor, one look and one lake class, and each halo is built from its label; the top-level functions each map module may declare; the attribution folds on add; the grid switches its style by one filter and leaves the map by its layer's visibility |
| `checks/styles.js` | `style-call-site-classes`, `style-own-glyphs`, `style-icon-module`, `style-own-popover`, `style-popover-shell`, `style-one-placement`, `style-placement-caller`, `style-placement-module`, `style-page-ground` | No call site re-widths a segment, sizes an icon or a choice, draws a glyph, positions a panel or spells the page ground |
| `checks/styles.js` | `style-map-column`, `style-map-wrapper`, `style-map-legend-column`, `style-map-button-column`, `style-map-layers-column`, `style-results-bar`, `style-app-micro`, `style-legend-ramp`, `style-layer-rows`, `style-search-box`, `style-chart-metric`, `style-axis-item`, `style-rank-cell` | The map column, the results bar, the legend strip, the Layers rows, the search box, the chart select and the rank cell wear their roles |
| `checks/styles.js` | `style-metrics-table`, `style-panel-messages`, `style-footer-notice`, `style-footer-notice-once`, `style-panel-no-status`, `style-draw-counter`, `style-model-picker-quiet`, `style-window-messages`, `style-popup-glyph` | The Metrics grid's boxes and buttons; every notice renders once, below Analyze; the draw counter is the one bare `STATUS`; the popup draws no glyph |

The text tests that stay, and why:

| Test | What it reads | Why it stays a test |
|---|---|---|
| `metrics.test.ts` | twelve consumer files | The precipitation `toFixed` guard: kept by the maintainer's decision |
| `branding.test.ts` | every file under `src/` | The branding scan: kept by the maintainer's decision (its backend twin, `test_branding.py`, too) |
| `styles.test.ts` | the `sources` glob | The divider and fade guards: kept by the maintainer's decision. The radius scale reads its allowed set from `RADIUS`; the tooltip counts are a count of approved tooltips |
| `styles.test.ts` | the `roleImporters` glob | Every exported role has an importer: a comparison between `styles.ts` and every other file |
| `styles.test.ts` | the five panel files | `CHOICE_ROW` and `CHOICE_INPUT` counts per file, and their total: a sum across files |
| `styles.test.ts` | `MapButtonColumn.tsx`, `LayersPopover.tsx`, `SearchBox.tsx`, `MapLegend.tsx` | The `MAP_ROW_H` count across three files, the order of the Layers rows, and the legend box, a region bounded by a comment rather than by a node |
| `styles.test.ts` | `index.css`, `map.css` | CSS, which ESLint does not parse |
| `legal.test.ts` | the pages and the provider list | The pages' claims against `LICENSE` and `dataSources.ts` |
| `coldLoad.test.ts` | `map/basemap.ts` | The style host against the preconnect hints in `index.html` |
| `api-compat.test.ts` | `tools/api-types/package.json` | The generator's manifest against the frontend scripts |
| `hooks/useCapabilities.test.ts` | `forecastWindow.ts` | Each window bound against the value the module exports |
| `utils/openMeteo.test.ts` | the two hooks, the three Open-Meteo modules | The coverage sentence and the unreadable-body sentence against the constants the modules export |
| `utils/openMeteoAggregate.test.ts` | `openMeteoAggregate.ts`, `aggregation.py` | The TypeScript port against the Python it mirrors |
| `utils/resultsSheet.test.ts` | `hooks/useResultsLayout.ts`, `styles.ts` | The `LEGEND_TOP` classes and the panel default against the numbers the arithmetic uses |
| `utils/basemapPoi.test.ts` | `map/basemap.ts` | The clickable layers against the ids `POI_LAYERS` exports, and the line-placed lake's label offset against the peak's: a comparison with a module's own constants, and a measurement |

### The cold-load budgets

CI audits the first screen with Lighthouse and fails the PR when a byte or
timing budget is crossed (issue #337). `make lighthouse` runs the same audit
locally: it builds the image, serves it on a docker network, and points
Lighthouse CI at it from a container that already carries Chromium. A failed
audit leaves the served container running, and `docker rm -f lh-target`
clears it.

The budgets themselves, and why the audit blocks every third-party host, are in
`.github/lighthouserc.js`. Reports land in `.lighthouseci/` (git-ignored); the
CI run keeps the same files as a workflow artifact. Measure before and after
whenever a change could touch what the first screen loads, and put both numbers
on the PR.

### The browser suite

CI also operates the built image in a browser (issue #412): Playwright draws a
ring and analyzes, opens a share link, clicks the map under the legend stack
and scrolls the stack, taps the chart at a phone's width to move the map's
playhead, and runs axe on the panel, the results,
and the Layers popover. Every third-party host is answered from fixtures in
`frontend/e2e/fixtures.ts`, so a run spends no Open-Meteo quota.
`make browser` runs it locally: it builds the image, serves it on a docker
network, and runs the suite from the pinned Playwright image with the repo
root mounted (the fixtures read `backend/tests/data/weather_vectors.json`). A
failed run leaves the served container running, and `docker rm -f e2e-target`
clears it.

The image tag, `PLAYWRIGHT_IMAGE` in the `Makefile`, must match the
`@playwright/test` version in `frontend/e2e/package.json`: each Playwright
release pins its own browser build, and the image carries the build for its
own version only. When Dependabot bumps the package, move the tag in the same
PR. The image brings its own Node, so this is the one container `.node-version`
does not pick. CI does not use
the image; it installs Chromium alone on the runner.

The suite is a package apart from `frontend/package.json`, like the two under
`frontend/tools/`, but for a different reason: Playwright does not fight
TypeScript 7 (it strips the types itself and carries no TypeScript peer), but a
devDependency of the app would be downloaded by every `npm ci` the image build
and the Frontend job run, and neither uses it. `npm run lint` covers
`frontend/e2e/` without installing it, because the lint reads no types.

Axe fails the run on serious and critical violations only, and the app has
none today. To accept one for a while, add it to `KNOWN` in
`frontend/e2e/accessibility.spec.ts` with its issue; an entry that stops
occurring fails the run.

### The render probe

`make perf` measures what the memo rule in the root `CLAUDE.md` protects: the
synchronous work an overlay toggle and a keystroke in the coordinates box cost
with 946 destinations displayed in the table, the chart and the map, and the
same for the three live knobs a reader drives most: a flip of the ranking's
direction, a cut of the results cap to 100, and its restore (issue #409). It serves the built image the way `make browser` does and runs
`frontend/e2e/perf/renderCost.spec.ts` from the same Playwright image, with the
same fixtures, so it spends no quota either. The spec times each interaction
inside the page, from the dispatch through two task yields, seven times, and
prints the medians on a `render cost:` line. It takes a few minutes, because
the client pacer spaces the 946-location fetch, which is why the smoke suite's
config ignores `perf/` and CI never runs it. Run it on `main` and on your branch
on the same machine, and put both lines in the PR: the numbers compare with
each other, not with a measurement taken on other hardware. A failed run leaves
the served container running, and `docker rm -f perf-target` clears it.

Two rules worth knowing before you send a change: any behavior change ships with
a matching test in the same PR, and any change to a route or Pydantic model
regenerates the committed OpenAPI snapshot with
`cd backend && python scripts/generate_openapi.py`, then the frontend types read
off it with `cd frontend && npm run generate:api` (CI fails the PR otherwise, on
both counts).

A third: any change to the weather or air-quality aggregation regenerates the
shared test vectors. Change the backend first, then
`cd backend && python scripts/generate_weather_vectors.py`, and mirror the
change in the TypeScript port in `frontend/src/utils/openMeteoAggregate.ts`. Pytest
fails on a stale `backend/tests/data/weather_vectors.json` and Vitest fails on
a drifted port. Both suites read that one file, so there is no second copy to
keep in step.

A fourth, for what a vector cannot express: the numbers and the one sentence
the browser copies from the backend ride
`backend/tests/data/mirrored_constants.json`. Change a listed value on the
backend first, then
`cd backend && python scripts/generate_mirrored_constants.py`, and change the
browser's half. Pytest fails on a stale manifest and Vitest fails on a browser
value that no longer matches it. `CLAUDE.md` lists every mirrored pair and what
enforces it.

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
