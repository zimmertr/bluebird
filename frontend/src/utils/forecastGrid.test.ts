import { describe, it, expect } from 'vitest'
// Through the barrel, as App.tsx imports them, so this file also proves the
// barrel still carries the names the wiring reads.
import { GRID_STYLES, isGridStyle } from './forecastGrid'
// `?raw` gives the file's text without executing it: MapView.tsx is a component
// the node-env Vitest cannot mount, so what it wires is asserted as source. What
// App.tsx wires is the `app-grid-gate` check in tools/eslint/checks/app.js.
import mapViewSource from '../components/MapView.tsx?raw'
import basemapSource from '../map/basemap.ts?raw'

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

  // `raster-resampling` is the whole switch: one raster layer under two
  // magnification filters, so the default moves a paint property and nothing
  // else. A second layer would be a second thing to keep in step.
  it('changes a paint property and not a layer', () => {
    expect(mapViewSource).toContain("gridStyle === 'smooth' ? 'linear' : 'nearest'")
    expect(mapViewSource.match(/'raster-resampling'/g)).toHaveLength(2)
  })
})

// The field leaves the map by the layer's visibility, and it reaches the map as
// pixels this code has already decoded. Both halves are guarded here because a
// decode the renderer does for us fails SILENTLY: an image source keeps the
// last image it loaded, so a placeholder that will not decode clears nothing
// and the previous field stays painted under a ranking it never came from.
// That no encoded image or url reaches the map is the `app-grid-pixels` check.
describe('how the grid layer leaves the map', () => {
  it('builds the pixels it hands the source', () => {
    // `rasterImage`, which builds the pixels, lives in map/basemap.ts.
    expect(basemapSource).toContain('export function rasterImage(')
  })

  it('clears the field by hiding the layer', () => {
    expect(mapViewSource).toContain(
      "map.setLayoutProperty('forecast-grid-fill', 'visibility', 'none')",
    )
    // Hidden at declaration too, so nothing is on screen before a raster is.
    expect(mapViewSource).toMatch(/id: 'forecast-grid-fill',[\s\S]{0,400}?visibility: 'none'/)
  })
})
