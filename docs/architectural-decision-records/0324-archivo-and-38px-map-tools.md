# 0324. The app wears Archivo, preloaded, and the map's tools are 38px

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Supersedes [0304](0304-the-refreshed-look-and-a-denser-table.md) in part (the face).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17, asking for the build to look like the prototype; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0324
- Guide: `frontend/src/index.css` (the face), `frontend/index.html` (the preload), `frontend/src/styles.ts` (`MAP_CORNER.stack`), `frontend/src/map.css` (`.map-tools`); `docs/STYLES.md`

## Context

Record 0304 bundled Inter so every reader measures the same widths. The prototype is set in Archivo, a grotesque with a width axis, and its figures run a step narrow, so a column of numbers takes less of the table than the names beside it. Its map tools (zoom, compass, layers, locate) are 38px squares with 12px corners in one column, where the build drew MapLibre's 29px buttons.

## Decision

- **Archivo replaces Inter.** `@fontsource-variable/archivo`'s default stylesheet, the weight axis alone, under the same CSP and the same `font-display: swap` fallback to the system stack. OFL-1.1, listed in `NOTICES.md`.
- **Imported from each entry's script, not from `index.css`.** Tailwind inlines a CSS `@import` without rebasing the url()s inside it, so the package's `./files/...` paths reached the browser as written and 404ed. Vite processes a stylesheet a script imports and emits its font files hashed under `/assets`.
- **Preloaded.** `index.html` preloads the Latin file, so it arrives beside the scripts and the first paint draws Archivo; swapped in after first paint, the face moved the first screen by 0.118, over the Core Web Vitals line the cold-load gate holds.
- **No narrow figures.** The prototype's figures run a step narrow on Archivo's width axis, but the file carrying that axis is 90 kB against the weight axis's 34 kB, and it took the cold load past its byte budget (713,549 of 700,000 B) and its first paint past 4,500 ms. The figures stay tabular at the face's own width.
- **38px tools.** Every button in the map's tool column is 38px square with 12px corners, the zoom pair rounded as one, its glyph scaled with it; the column's gap is 6px at a desk and 12px on touch.
- **The palette stays.** The prototype's ramp is within a step of the slate tokens every role already measures in both themes, so the tokens are kept rather than re-derived.

## Evidence

- 2026-11-21: production (0.143.19) serves `url(./files/inter-...woff2)` from `/assets/src-*.css`, and `/assets/files/inter-latin-wght-normal.woff2` answers 404, so Inter has never drawn there; the system stack has. The PR preview showed the same for Archivo (503 on the unhashed path) until the import moved to the entries. With the width axis loaded and no preload, Lighthouse read CLS 0.118, FCP 4,668 ms and 713,549 B; the weight-only Latin file is 34.9 kB.

- Every width `styles.test.ts` pins was measured in Inter; each is re-measured in Archivo on the PR preview and the pinned numbers move with it.

## Consequences

- A label that fitted its box in Inter is re-checked in Archivo: `UK Met Office` in the model picker and `Precipitation (in/hr)` in the chart's metric picker.
