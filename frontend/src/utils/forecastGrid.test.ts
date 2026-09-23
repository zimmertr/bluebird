import { describe, it, expect } from 'vitest'
// Through the barrel, as App.tsx imports them, so this file also proves the
// barrel still carries the names the wiring reads.
import { GRID_STYLES, isGridStyle } from './forecastGrid'
// `?raw` gives the file's text without executing it: App.tsx is a component
// tree the node-env Vitest cannot mount, so what it wires is asserted as source.
import appSource from '../App.tsx?raw'
import mapViewSource from '../components/MapView.tsx?raw'
import basemapSource from '../map/basemap.ts?raw'

// The decision has to be the one the map actually reads. App.tsx wires the
// checkbox, the fetch, the sub-choices and the legend, and none of that is
// reachable from the node-env Vitest — so the source is read as text, the same
// drift-guard idiom useCapabilities.test.ts uses for the published caps.
// One drawing for every scale on the map (TJ, 2026-09-22). The grid painted a
// hard rectangle per sample while `blocks` was the default, where the markers
// standing on it take a continuous colour from `interpolateRgb`.
describe('the grid opens as a field rather than as blocks', () => {
  it('starts on the smooth style', () => {
    expect(appSource).toContain("restored?.gridStyle ?? 'smooth'")
  })

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

describe('the grid layer reads that decision rather than re-deriving one', () => {
  it('gates the checkbox, the fetch and every grid surface on one flag', () => {
    // One call, so there is one answer.
    expect(appSource.match(/gridAllowed\(/g)).toHaveLength(1)
    expect(appSource).toContain('const gridAvailable = gridAllowed(analyzed)')
    // Derived from the analyzed snapshot, never from the panel's calendar: a
    // report on screen keeps its own answer while the calendar moves.
    expect(appSource).not.toMatch(/gridAllowed\((?!analyzed\))/)
    // The checkbox carries the disabled state, and the popover's CHOICE_ROW
    // fades the whole row off it.
    expect(appSource).toContain("key: 'grid'")
    expect(appSource).toContain('disabled: !gridAvailable')
    // The fetch and every surface hang off the one composed flag.
    expect(appSource).toContain('const gridOn = showGrid && gridAvailable')
    expect(appSource).toContain('enabled: gridOn,')
    for (const surface of [
      'const gridPainted = gridOn &&',
      'const gridCued = gridOn &&',
      'const gridFailed = gridOn &&',
    ]) {
      expect(appSource).toContain(surface)
    }
  })
})

// The field leaves the map by the layer's visibility, and it reaches the map as
// pixels this code has already decoded. Both halves are guarded here because a
// decode the renderer does for us fails SILENTLY: an image source keeps the
// last image it loaded, so a placeholder that will not decode clears nothing
// and the previous field stays painted under a ranking it never came from.
// MapView.tsx is a component the node-env Vitest cannot mount, so this is the
// `?raw` idiom the block above uses on App.tsx.
describe('how the grid layer leaves the map', () => {
  it('hands the source decoded pixels, never a url', () => {
    // An encoded image anywhere in the map's code is a decode waiting to fail.
    // `rasterImage`, which builds the pixels, lives in map/basemap.ts.
    for (const source of [mapViewSource, basemapSource]) {
      expect(source).not.toContain('data:image/png;base64')
      expect(source).not.toMatch(/updateImage\(\{\s*url/)
    }
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
