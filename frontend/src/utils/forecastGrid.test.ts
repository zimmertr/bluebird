import { describe, it, expect } from 'vitest'
// Through the barrel, as App.tsx imports them, so this file also proves the
// barrel still carries the names the wiring reads.
import { GRID_STYLES, isGridStyle } from './forecastGrid'
// What the layer the field draws into wires is the `map-grid-layer` check in
// tools/eslint/checks/map.js, and its behavior is `map/overlays/forecastGrid.test.ts`.
// What App.tsx wires is the `app-grid-gate` check in tools/eslint/checks/app.js.

// One drawing for every scale on the map (TJ, 2026-09-22). The grid painted a
// hard rectangle per sample while `blocks` was the default, where the markers
// standing on it take a continuous colour from `interpolateRgb`.
describe('the grid opens as a field rather than as blocks', () => {
  // The segment stays, and so does the parameter behind it. `grid=blocks` is a
  // link somebody has already shared, and the blocks view is the one that shows
  // how few samples are under the field, which is worth keeping reachable.
  it('keeps both styles reachable and shareable', () => {
    expect(GRID_STYLES).toEqual(['blocks', 'smooth'])
    expect(isGridStyle('blocks')).toBe(true)
  })
})
