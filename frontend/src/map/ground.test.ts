import { describe, expect, it } from 'vitest'
import { stubMap } from '../testSupport/stubMap'
import {
  GROUND_SHADE_LAYER,
  GROUND_SOURCE,
  GROUND_TINT,
  GROUND_TINT_LAYER,
  LIBERTY_LOOK,
  mountGround,
  scaled,
  settingsFor,
  tintColor,
} from './ground'

// A slice of Liberty, as `getStyle()` lists it, with the paint the ground
// computes from.
const LIBERTY = [
  { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
  { id: 'natural_earth', type: 'raster', source: 'ne2_shaded' },
  { id: 'landcover_wood', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', paint: { 'fill-opacity': 0.4 } },
  { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#9ec7e7' } },
  { id: 'road_minor_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
  { id: 'road_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#fff' } },
  { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', paint: { 'fill-opacity': 0.8 } },
  { id: 'label_town', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', paint: { 'text-color': '#333' } },
]

function setup() {
  const stub = stubMap({ styleLayers: LIBERTY })
  const ground = mountGround(stub.map, { attribution: 'credit' })
  return { stub, ground }
}

const ref = (id: string) => {
  const l = LIBERTY.find((x) => x.id === id)!
  return { id, type: l.type, source: l.source, sourceLayer: l['source-layer'] }
}

describe('the tint', () => {
  it('runs from the water through the valleys to snow, in each theme', () => {
    for (const theme of ['dark', 'light'] as const) {
      const heights = GROUND_TINT[theme].map(([m]) => m)
      expect(heights, theme).toEqual([...heights].sort((a, b) => a - b))
      expect(heights[0], theme).toBeLessThan(0)
      const expr = tintColor(theme)
      expect(expr.slice(0, 3)).toEqual(['interpolate', ['linear'], ['elevation']])
      expect(expr).toHaveLength(3 + 2 * heights.length)
    }
    // Dark valleys under pale snow, and the light ground's snow white.
    expect(GROUND_TINT.dark[1][1][0]).toBeLessThan(GROUND_TINT.dark[GROUND_TINT.dark.length - 1][1][0])
    expect(GROUND_TINT.light[GROUND_TINT.light.length - 1][1]).toEqual([253, 254, 255])
  })
})

describe('Liberty under the ground', () => {
  it('scales an opacity the style gave, and takes the share flat otherwise', () => {
    expect(scaled(0.4, 0.5)).toBe(0.2)
    expect(scaled(undefined, 0.3)).toBe(0.3)
    expect(scaled(['interpolate', ['linear'], ['zoom'], 5, 0, 10, 1], 0.3)).toBe(0.3)
  })

  it('clears the background and the Natural Earth shading the relief replaces', () => {
    for (const theme of ['dark', 'light'] as const) {
      expect(settingsFor(ref('background'), theme).map((s) => [s.property, s.value(1)])).toEqual([['background-opacity', 0]])
      expect(settingsFor(ref('natural_earth'), theme).map((s) => [s.property, s.value(1)])).toEqual([['raster-opacity', 0]])
    }
  })

  it('thins the land cover and the roads, more in the dark, and drops the casings there', () => {
    const fill = (theme: 'dark' | 'light') => settingsFor(ref('landcover_wood'), theme)[0].value(0.4) as number
    expect(fill('dark')).toBeCloseTo(0.4 * LIBERTY_LOOK.dark.fill)
    expect(fill('light')).toBeCloseTo(0.4 * LIBERTY_LOOK.light.fill)
    expect(fill('dark')).toBeLessThan(fill('light'))
    const casing = settingsFor(ref('road_minor_casing'), 'dark')
    expect(casing.map((s) => [s.property, s.value(undefined)])).toEqual([['line-opacity', 0]])
    const road = settingsFor(ref('road_minor'), 'dark').map((s) => s.property)
    expect(road).toEqual(['line-opacity', 'line-color'])
    expect(settingsFor(ref('road_minor'), 'light').map((s) => s.property)).toEqual(['line-opacity'])
  })

  it('repaints the labels and buildings in the dark alone, and leaves the buildings\' opacity to the imagery', () => {
    expect(settingsFor(ref('label_town'), 'dark').map((s) => s.property)).toEqual(['text-color', 'text-halo-color'])
    expect(settingsFor(ref('label_town'), 'light')).toEqual([])
    expect(settingsFor(ref('building'), 'dark').map((s) => s.property)).toEqual(['fill-color'])
    expect(settingsFor(ref('building'), 'light')).toEqual([])
  })

  it('fades the parks\' dashed edge, most in the dark', () => {
    const edge = { id: 'park_outline', type: 'line', source: 'openmaptiles', sourceLayer: 'park' }
    expect(settingsFor(edge, 'dark')[0].value(1)).toBe(LIBERTY_LOOK.dark.parkEdge)
    expect(settingsFor(edge, 'light')[0].value(1)).toBe(LIBERTY_LOOK.light.parkEdge)
    expect(LIBERTY_LOOK.dark.parkEdge).toBeLessThan(LIBERTY_LOOK.light.parkEdge)
  })

  it('leaves the app\'s own layers and every other source alone', () => {
    expect(settingsFor({ id: 'results-labels', type: 'symbol' }, 'dark')).toEqual([])
    expect(settingsFor({ id: 'smoke-outline', type: 'line', source: 'smoke' }, 'dark')).toEqual([])
  })
})

describe('mountGround', () => {
  it('reads Mapterhorn\'s tiles with its credit, and adds nothing until it has a theme', () => {
    const { stub } = setup()
    const source = stub.calls.find((c) => c[0] === 'addSource' && c[1] === GROUND_SOURCE)?.[2] as Record<string, unknown>
    expect(source).toMatchObject({ type: 'raster-dem', encoding: 'terrarium', attribution: 'credit' })
    expect(stub.stack).not.toContain(GROUND_TINT_LAYER)
  })

  it('stands the tint and its shade under every one of Liberty\'s layers', () => {
    const { stub, ground } = setup()
    ground.setTheme('dark')
    expect(stub.stack.slice(0, 3)).toEqual([GROUND_TINT_LAYER, GROUND_SHADE_LAYER, 'background'])
    expect(stub.paint[GROUND_TINT_LAYER]['color-relief-color']).toEqual(tintColor('dark'))
  })

  it('paints each theme from the style\'s own values, and puts back what the light look leaves', () => {
    const { stub, ground } = setup()
    ground.setTheme('dark')
    expect(stub.paint.landcover_wood['fill-opacity']).toBeCloseTo(0.4 * LIBERTY_LOOK.dark.fill)
    expect(stub.paint.label_town['text-color']).toBe(LIBERTY_LOOK.dark.text)
    expect(stub.paint.road_minor['line-color']).toBe(LIBERTY_LOOK.dark.roadInk)
    ground.setTheme('light')
    // From the style's 0.4, not from the dark look's value.
    expect(stub.paint.landcover_wood['fill-opacity']).toBeCloseTo(0.4 * LIBERTY_LOOK.light.fill)
    expect(stub.paint.label_town['text-color']).toBe('#333')
    expect(stub.paint.road_minor['line-color']).toBe('#fff')
    expect(stub.paint.water['fill-color']).toBe(LIBERTY_LOOK.light.water)
    expect(stub.paint[GROUND_TINT_LAYER]['color-relief-color']).toEqual(tintColor('light'))
  })

  it('does nothing for the theme it already wears', () => {
    const { stub, ground } = setup()
    ground.setTheme('light')
    const n = stub.calls.length
    ground.setTheme('light')
    expect(stub.calls.length).toBe(n)
  })
})
