# 0055. App.tsx and MapView.tsx are split into modules by concern

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 90

- `src/components/MapView.tsx` — the map. It constructs the MapLibre instance (the worker URL and the vendor stylesheet, through `map.css`, enter here and nowhere else) and owns what is still wired inline: the `load` handler, the ring's POINTS (`ptsRef`, which exist before the map loads, since a restored link hydrates them, and after, since Clear and Done read them), the popup board every module shares, the opening frame (`frameOpening`, called from `load` and nowhere else) and every camera move. Every feature is mounted by ONE call, `mountFeatures` in `map/features.ts`, which owns the stacking order; the effects only hand the features props, and rows that arrive before `load` are drawn when `mapReady` flips rather than held in refs. The `map-view-wiring` check in `tools/eslint/checks/map.js` fails any source, layer, listener, popup, popup ref or direct feature mount written back into this file; it listens for `load` and nothing else. It was cut into feature modules under `src/map/` in six pull requests (#410). **No ref in it mirrors a prop**: what a handler registered once on `load` needs to read is on `map/controller.ts`, and the `map-view-wiring` check fails a ref seeded from a prop (the restored ring excepted, which is not a mirror) or an effect that only copies values into refs. Almost nothing it draws is DECIDED here — the popup markup, the marker colours, the lattice and its raster, the framing predicate and where a click joins the ring are pure modules in `utils/` that arrive as strings, features and numbers — and that split is what makes them testable at all, since a test that reached into this file would be pulling a WebGL map into it, which jsdom cannot draw. Memoized like `ResultsTable` and `TimeSeriesChart`, so its props must stay stable

## From `frontend/src/CLAUDE.md`, line 153

- `src/hooks/useUrlSync.ts` — the address bar as a copy of the panel, cut out of `App.tsx` (#409), last of the split because it reads state from every other hook:
