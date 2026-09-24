# 0055. App.tsx and MapView.tsx are split into modules by concern

- Status: Accepted
- Date: 2026-09-22 (git: the merge of #475, the first of #410's six pull requests; #409's series began with #497 on 2026-09-23)
- Decider: TJ (git: author and merger of #475)
- Issues and PRs: #409, #410, #475, #492, #497, #531
- Cited in code as: #409, #410
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the second `src/components/MapView.tsx` bullet; and [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the hook bullets marked "cut out of `App.tsx`"

## Context

#409 is titled "App.tsx is one 3,100-line component with twenty concerns and no test". `App.tsx` and `MapView.tsx` render the map, and MapLibre cannot run under Vitest, so any logic left in them is untested.

## Decision

`MapView.tsx` is cut into feature modules under `src/map/` (#410, six pull requests), and `App.tsx` into hooks and components, one concern each (#409). `MapView` constructs the map and wires it: every feature mounts through one call, `mountFeatures` in `map/features.ts`, and almost nothing it draws is decided in it. The URL sync, last of the split because it reads state from every other hook, moved with its dependency list and its suppression verbatim.

## Evidence

The size in #409's title. No dated measurement.

## Alternatives rejected

- Logic left in `App.tsx`: untestable, and a suppression of the types cue shipped uncaught that way (see [0003](0003-analyze-is-spend-boundary.md)).

## Consequences

The linter's `map-view-wiring` check fails a source, layer, listener or popup written back into `MapView.tsx`, and a ref that mirrors a prop. `url-sync-hook` holds the URL sync's effects. The pure modules in `utils/` are testable because nothing in them pulls in a WebGL map.
