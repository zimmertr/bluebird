import { describe, expect, it, vi } from 'vitest'

// MapLibre's controls need a DOM. These record what they were built with.
// Hoisted, because `vi.mock` runs before the imports.
vi.mock('maplibre-gl', () => {
  class Control {
    constructor(public options: Record<string, unknown> = { customAttribution: 'MapLibre' }) {}
  }
  return {
    AttributionControl: class extends Control {},
    GeolocateControl: class extends Control {},
    NavigationControl: class extends Control {},
    ScaleControl: class extends Control {},
  }
})

import type * as maplibregl from 'maplibre-gl'
import { addAttribution, addControls } from './controls'

function stub() {
  const added: [string, unknown, string][] = []
  const removed: string[] = []
  const map = {
    boxZoom: { disable: vi.fn() },
    addControl: (control: { constructor: { name: string } }, at: string) =>
      added.push([Object.getPrototypeOf(control).constructor.name, control, at]),
    getContainer: () => ({
      querySelector: () => ({ classList: { remove: (c: string) => removed.push(c) } }),
    }),
  }
  return { map: map as unknown as maplibregl.Map, added, removed, boxZoom: map.boxZoom }
}

describe('addControls', () => {
  it('spends shift on pinning rather than box zoom, and puts each control in its corner', () => {
    const { map, added, boxZoom } = stub()
    addControls(map, false)
    expect(boxZoom.disable).toHaveBeenCalledTimes(1)
    expect(added.map(([, , at]) => at)).toEqual(['top-right', 'top-right', 'bottom-left'])
    expect((added[0][1] as { options: Record<string, unknown> }).options).toEqual({ showZoom: true })
  })

  // A coarse pointer (#696): a pinch zooms, so the zoom buttons go, and the
  // locate button stands above the attribution's (i) at the bottom right.
  it('drops the zoom buttons on touch and moves the locate button to the bottom right', () => {
    const { map, added } = stub()
    addControls(map, true)
    expect(added.map(([name, , at]) => [name, at])).toEqual([
      [expect.stringContaining('Navigation'), 'top-right'],
      [expect.stringContaining('Geolocate'), 'bottom-right'],
      [expect.stringContaining('Scale'), 'bottom-left'],
    ])
    expect((added[0][1] as { options: Record<string, unknown> }).options).toEqual({ showZoom: false })
  })
})

describe('addAttribution', () => {
  it('keeps the library credit, decides compact alone, and folds it on add', () => {
    const { map, added, removed } = stub()
    const control = addAttribution(map, true) as unknown as { options: Record<string, unknown> }
    expect(control.options).toEqual({ customAttribution: 'MapLibre', compact: true })
    expect(added.map(([, , at]) => at)).toEqual(['bottom-right'])
    expect(removed).toEqual(['maplibregl-compact-show'])
  })
})
