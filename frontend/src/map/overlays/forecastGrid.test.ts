import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRID_OPACITY, gridRedraws, mountForecastGrid, rasterImage, type GridDrawing } from './forecastGrid'
import { stubMap } from '../../testSupport/stubMap'
// The `?raw` idiom `MapView.test.ts` uses, for the rule about the file itself.
import source from './forecastGrid.ts?raw'

// No DOM in the node project: a canvas with no 2D context is what a browser
// without one hands back, and it is the branch the image builder must survive.
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => null }),
  })
})
afterEach(() => vi.unstubAllGlobals())

const base: GridDrawing = {
  spec: null,
  cells: [],
  style: 'smooth',
  sortBy: 'precip_total_in',
  playbackIndex: null,
}

describe('the functions this file may declare', () => {
  // Carried from the list MapView.test.ts kept: each needs a map or a canvas.
  it('declares only what needs a map or a canvas, plus the redraw rule', () => {
    const declared = [...source.matchAll(/^(?:export )?function (\w+)/gm)].map((m) => m[1]).sort()
    expect(declared).toEqual(['gridRedraws', 'mountForecastGrid', 'rasterImage'])
  })
})

describe('gridRedraws', () => {
  it('draws both halves the first time', () => {
    expect(gridRedraws(null, base)).toEqual({ field: true, arrows: true })
  })

  it('leaves the arrows alone for a style switch or a re-rank', () => {
    expect(gridRedraws(base, { ...base, style: 'blocks' })).toEqual({ field: true, arrows: false })
    expect(gridRedraws(base, { ...base, sortBy: 'wind_avg_mph' })).toEqual({
      field: true,
      arrows: false,
    })
  })

  it('redraws both for a new hour or new cells', () => {
    expect(gridRedraws(base, { ...base, playbackIndex: 3 })).toEqual({ field: true, arrows: true })
    expect(gridRedraws(base, { ...base, cells: [] })).toEqual({ field: true, arrows: true })
  })

  it('redraws nothing when nothing changed', () => {
    expect(gridRedraws(base, { ...base })).toEqual({ field: false, arrows: false })
  })
})

describe('mountForecastGrid', () => {
  it('adds the field and then its arrows, both hidden', () => {
    const stub = stubMap()
    mountForecastGrid(stub.map)
    expect(stub.stack).toEqual(['forecast-grid-fill', 'forecast-grid-wind'])
    expect(stub.layout['forecast-grid-fill'].visibility).toBe('none')
    expect(stub.layout['forecast-grid-wind'].visibility).toBe('none')
    expect(stub.paint['forecast-grid-fill']['raster-opacity']).toBe(GRID_OPACITY)
  })

  // The style is a magnification filter on one layer, not a second layer.
  it('switches the style by the resampling filter alone', () => {
    const stub = stubMap()
    const grid = mountForecastGrid(stub.map)
    grid.update({ ...base, style: 'blocks' })
    expect(stub.paint['forecast-grid-fill']['raster-resampling']).toBe('nearest')
    grid.update({ ...base, style: 'smooth' })
    expect(stub.paint['forecast-grid-fill']['raster-resampling']).toBe('linear')
  })

  // An image source keeps the last image it was given, so the field leaves the
  // map by the layer's visibility, never by a second image.
  it('hides the field when there is nothing to paint', () => {
    const stub = stubMap()
    const grid = mountForecastGrid(stub.map)
    grid.update({ ...base, style: 'blocks' })
    expect(stub.layout['forecast-grid-fill'].visibility).toBe('none')
    expect(stub.calls.some((c) => c[0] === 'updateImage')).toBe(false)
  })

  it('sets the arrows only when the cells or the hour move', () => {
    const stub = stubMap()
    const grid = mountForecastGrid(stub.map)
    const setData = () => stub.calls.filter((c) => c[0] === 'setData').length
    grid.update(base)
    expect(setData()).toBe(1)
    grid.update({ ...base, style: 'blocks' })
    expect(setData()).toBe(1)
    grid.update({ ...base, style: 'blocks', playbackIndex: 0 })
    expect(setData()).toBe(2)
  })

  // The same rule the markers' arrows follow, set only when its answer moves,
  // because a scrub calls this twice a second.
  it('shows its arrows for a wind ranking under the playhead', () => {
    const stub = stubMap()
    const grid = mountForecastGrid(stub.map)
    const visibility = () =>
      stub.calls
        .filter((c) => c[0] === 'setLayoutProperty' && c[1] === 'forecast-grid-wind')
        .map((c) => c[3])
    grid.update({ ...base, playbackIndex: 1 })
    grid.update({ ...base, sortBy: 'wind_avg_mph', playbackIndex: 1 })
    grid.update({ ...base, sortBy: 'wind_avg_mph', playbackIndex: 2 })
    grid.update({ ...base, sortBy: 'wind_avg_mph', playbackIndex: null })
    expect(visibility()).toEqual(['visible', 'none'])
  })
})

describe('rasterImage', () => {
  it('returns null where the canvas has no 2D context', () => {
    expect(rasterImage({ width: 2, height: 1, rgba: new Uint8ClampedArray(8) })).toBeNull()
  })
})
