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
import {
  COMPASS_IDLE_CLASS,
  OPEN_METEO_ATTRIBUTION,
  SCALE_MAX_WIDTH_PX,
  addAttribution,
  addControls,
  hideCompassWhileNorthUp,
  withOpenMeteo,
} from './controls'

function stub() {
  const added: [string, unknown, string][] = []
  const removed: string[] = []
  const classes = new Set<string>()
  const handlers: Record<string, () => void> = {}
  const camera = { bearing: 0, pitch: 0 }
  const map = {
    boxZoom: { disable: vi.fn() },
    addControl: (control: { constructor: { name: string } }, at: string) =>
      added.push([Object.getPrototypeOf(control).constructor.name, control, at]),
    getContainer: () => ({
      querySelector: () => ({ classList: { remove: (c: string) => removed.push(c) } }),
      classList: {
        toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
      },
    }),
    getBearing: () => camera.bearing,
    getPitch: () => camera.pitch,
    on: (event: string, fn: () => void) => {
      handlers[event] = fn
    },
  }
  return { map: map as unknown as maplibregl.Map, added, removed, boxZoom: map.boxZoom, classes, handlers, camera }
}

describe('addControls', () => {
  it('spends shift on pinning rather than box zoom, and puts each control in its corner', () => {
    const { map, added, boxZoom } = stub()
    addControls(map)
    expect(boxZoom.disable).toHaveBeenCalledTimes(1)
    expect(added.map(([, , at]) => at)).toEqual(['top-right', 'top-right', 'bottom-left'])
  })

  // Stated rather than defaulted, because map.css keeps the attribution clear
  // of the scale at this width.
  it('draws the scale no wider than the room map.css keeps for it', () => {
    const { map, added } = stub()
    addControls(map)
    const [, scale] = added.find(([, , at]) => at === 'bottom-left')!
    expect((scale as { options: Record<string, unknown> }).options).toEqual({ maxWidth: SCALE_MAX_WIDTH_PX })
  })
})

describe('hideCompassWhileNorthUp', () => {
  it('hides the compass while north-up and flat, and shows it once either moves', () => {
    const { map, classes, handlers, camera } = stub()
    hideCompassWhileNorthUp(map)
    expect(classes.has(COMPASS_IDLE_CLASS)).toBe(true)

    camera.bearing = 12
    handlers.rotate()
    expect(classes.has(COMPASS_IDLE_CLASS)).toBe(false)

    camera.bearing = 0
    handlers.rotate()
    expect(classes.has(COMPASS_IDLE_CLASS)).toBe(true)

    camera.pitch = 30
    handlers.pitch()
    expect(classes.has(COMPASS_IDLE_CLASS)).toBe(false)
  })

  // The hiding is map.css's, since the compass is the library's markup;
  // styles.test.ts, which reads that file, holds the rule to this name.
  it('names the class map.css hides the compass under', () => {
    expect(COMPASS_IDLE_CLASS).toBe('compass-idle')
  })

  it('is what addControls wires up beside the zoom buttons', () => {
    const { map, classes, handlers } = stub()
    addControls(map)
    expect(Object.keys(handlers).sort()).toEqual(['pitch', 'rotate'])
    expect(classes.has(COMPASS_IDLE_CLASS)).toBe(true)
  })
})

describe('addAttribution', () => {
  it('keeps the library credit, adds Open-Meteo, decides compact alone, and folds it on add', () => {
    const { map, added, removed } = stub()
    const control = addAttribution(map, true) as unknown as { options: Record<string, unknown> }
    expect(control.options).toEqual({ customAttribution: ['MapLibre', OPEN_METEO_ATTRIBUTION], compact: true })
    expect(added.map(([, , at]) => at)).toEqual(['bottom-right'])
    expect(removed).toEqual(['maplibregl-compact-show'])
  })

  // The same line at a desk, spelled out rather than folded.
  it('carries the Open-Meteo credit spelled out as well as compact', () => {
    const { map } = stub()
    const control = addAttribution(map, false) as unknown as { options: { customAttribution: string[] } }
    expect(control.options.customAttribution).toContain(OPEN_METEO_ATTRIBUTION)
  })
})

// The Open-Meteo credit is a standing member of the attribution line (#687),
// the existing link with no words added, after whatever the library credits.
describe('the Open-Meteo credit on the attribution line', () => {
  const links = (html: string) => html.match(/<a\b[^>]*>[^<]*<\/a>/g) ?? []

  it('is the bare link to Open-Meteo, opening in a new tab', () => {
    expect(links(OPEN_METEO_ATTRIBUTION)).toHaveLength(1)
    expect(OPEN_METEO_ATTRIBUTION).toMatch(/href="https:\/\/open-meteo\.com\/"/)
    expect(OPEN_METEO_ATTRIBUTION).toMatch(/target="_blank"/)
    expect(OPEN_METEO_ATTRIBUTION).toMatch(/rel="noopener noreferrer"/)
    expect(OPEN_METEO_ATTRIBUTION.replace(/<[^>]+>/g, '')).toBe('Open-Meteo.com')
  })

  it('joins the library credit once, after it, whatever shape it comes in', () => {
    const line = (custom: string | string[] | undefined) => withOpenMeteo(custom).join(' | ')
    for (const custom of ['MapLibre', ['MapLibre'], undefined]) {
      const credits = withOpenMeteo(custom)
      expect(credits[credits.length - 1]).toBe(OPEN_METEO_ATTRIBUTION)
      expect(line(custom).split('Open-Meteo.com')).toHaveLength(2)
    }
    expect(withOpenMeteo('MapLibre')).toEqual(['MapLibre', OPEN_METEO_ATTRIBUTION])
  })
})
