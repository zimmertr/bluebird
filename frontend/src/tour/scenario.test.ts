import { describe, expect, it } from 'vitest'
import { resultRow } from '../testSupport/fixtures'
import { NO_CONSTRAINTS, filterConstraints } from '../utils/constraints'
import { TOUR_STEPS, stepIndex } from '../utils/tourSteps'
import demoData from './demoData.json'
import {
  AQI_BOUND,
  FIRE_AT,
  PASTED,
  POOL_NAMES,
  RING_POLYGON,
  type DemoData,
  aqiAt,
  castPlaces,
  exampleFire,
  exampleSmoke,
  keepsPopup,
  stateBefore,
} from './scenario'

const demo = demoData as unknown as DemoData
const NOW = Date.parse('2026-09-24T19:00:00Z')
const at = (name: string) => demo.pool.find((d) => d.name === name)!

describe('the recorded data', () => {
  it('holds every peak the scenario names, with the weather for each', () => {
    expect(demo.pool.map((d) => d.name).sort()).toEqual([...POOL_NAMES].sort())
    expect(demo.weather).toHaveLength(demo.pool.length)
  })

  it('answers the search with a menu, the Washington peak first', () => {
    expect(demo.geocode.length).toBeGreaterThan(1)
    expect(castPlaces(demo).searched.label).toBe('Glacier Peak')
    expect(castPlaces(demo).searched.lat).toBeCloseTo(48.11, 1)
  })
})

// The hours the demo's window asks for: 06:00 to 18:00, thirteen of them.
const HOURS = Array.from({ length: 13 }, (_, h) => h)
// Mount Misch and Kennedy Peak are pasted, so they stand where the paste says
// rather than where the recording found them.
const PASTED_AT: Record<string, [number, number]> = {
  'Mount Misch': [48.3437, -121.2005],
  'Kennedy Peak': [48.132, -121.1253],
}
function window(name: string): { avg: number; max: number } {
  const [lat, lon] = PASTED_AT[name] ?? [at(name).latitude, at(name).longitude]
  const values = HOURS.map((h) => aqiAt(lat, lon, h))
  return { avg: values.reduce((a, v) => a + v, 0) / values.length, max: Math.max(...values) }
}
const CAST = [
  'Gamma Peak', 'Glacier Peak', 'Kennedy Peak', 'Helmet Butte', 'Plummer Mountain',
  'Mount Misch', 'Dome Peak', 'Bannock Mountain', 'Sitting Bull Mountain',
]

describe('aqiAt', () => {
  // On the US AQI's own bands, by the window average the table ranks on, so
  // every colour the scale has shows in the markers and the table.
  it.each([
    ['Gamma Peak', 301, 500],
    ['Glacier Peak', 201, 300],
    ['Kennedy Peak', 151, 200],
    ['Helmet Butte', 101, 150],
    ['Plummer Mountain', 51, 100],
    ['Mount Misch', 0, 50],
    ['Dome Peak', 0, 50],
    ['Bannock Mountain', 0, 50],
    ['Sitting Bull Mountain', 0, 50],
  ] as const)('puts %s between %i and %i', (name, low, high) => {
    const { avg } = window(name)
    expect(avg).toBeGreaterThanOrEqual(low)
    expect(avg).toBeLessThanOrEqual(high)
  })

  // The bound step compares the window's worst hour, which runs above the
  // average, so which rows it takes away is pinned on that and not on the band.
  const rows = CAST.map((name) => resultRow({ name, aqi_avg: window(name).avg, aqi_max: window(name).max }))
  const kept = filterConstraints(rows, { ...NO_CONSTRAINTS, maxAqi: AQI_BOUND }).map((r) => r.name)

  it('takes exactly the four peaks under the smoke past a highest AQI of 100', () => {
    expect(CAST.filter((name) => !kept.includes(name)).sort()).toEqual(
      ['Gamma Peak', 'Glacier Peak', 'Helmet Butte', 'Kennedy Peak'],
    )
  })

  it('keeps the row the row step clicks, the top of the ranking, under the bound', () => {
    const top = [...rows].sort((a, b) => (a.aqi_avg ?? 0) - (b.aqi_avg ?? 0))[0]
    expect(kept).toContain(top.name)
  })

  it('is the same number every time it is asked', () => {
    expect(aqiAt(48.2, -121.0, 3)).toBe(aqiAt(48.2, -121.0, 3))
  })

  it('stays on the US AQI scale', () => {
    for (let h = 0; h < 24; h++) {
      const v = aqiAt(FIRE_AT.lat, FIRE_AT.lon, h)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(500)
    }
  })
})

describe('the example fire and smoke', () => {
  it('names the fire as an example', () => {
    const [fire] = exampleFire(NOW).features
    expect(fire.properties).toMatchObject({ attr_IncidentName: 'Example fire' })
  })

  it('draws a plume of each density, each ring closed', () => {
    const smoke = exampleSmoke(NOW)
    expect(smoke.features.map((f) => (f.properties as { density: string }).density)).toEqual(['Light', 'Medium', 'Heavy'])
    for (const f of smoke.features) {
      const ring = (f.geometry as { coordinates: number[][][] }).coordinates[0]
      expect(ring[0]).toEqual(ring[ring.length - 1])
    }
  })
})

describe('stateBefore', () => {
  const before = (key: string) => stateBefore(stepIndex(key), demo, NOW)

  it('starts from nothing but the player', () => {
    expect(before('search')).toEqual({ initial: { showPlayer: true }, autoAnalyze: false, replay: null })
  })

  it('holds each step\'s result from the step after it on', () => {
    expect(before('map-click').initial.pins?.map((p) => p.label)).toEqual(['Glacier Peak'])
    expect(before('draw-start').initial.pins?.map((p) => p.label)).toEqual(['Glacier Peak', 'Dome Peak'])
    expect(before('draw-done').initial).toMatchObject({ polygon: RING_POLYGON, destinationTypes: [] })
    expect(before('paste').initial).toMatchObject({ polygon: RING_POLYGON, destinationTypes: ['peak'] })
    expect(before('model-pick').initial.customCsv).toBe(PASTED)
    expect(before('model-rank').initial).toMatchObject({ compareModels: ['gfs_hrrr'] })
    expect(before('window-day').initial).toMatchObject({ forecastModel: 'gfs_hrrr', compareModels: [] })
    expect(before('window-hours').initial.selection).toEqual({ kind: 'days', startDate: '2026-09-25', endDate: '2026-09-25' })
    expect(before('metrics').initial.selection).toEqual({
      kind: 'days',
      startDate: '2026-09-25',
      endDate: '2026-09-25',
      hours: { start: '06:00', end: '18:00' },
    })
  })

  it('plays again what a press left open, and only there', () => {
    const replays = TOUR_STEPS.map((_s, i) => stateBefore(i, demo, NOW).replay)
    expect(Object.fromEntries(TOUR_STEPS.map((s, i) => [s.key, replays[i]]).filter(([, r]) => r !== null))).toEqual({
      'map-add': 'poi',
      'draw-corners': 'draw',
      'draw-done': 'edit-ring',
      'model-rank': 'model-list',
      popup: 'popup',
    })
  })

  it('has analyzed from the step after Analyze on, with the overlays on after Layers', () => {
    expect(before('analyze').autoAnalyze).toBe(false)
    expect(before('layers').autoAnalyze).toBe(true)
    expect(before('layers').initial.showWildfires).toBeUndefined()
    expect(before('results').initial).toMatchObject({ showWildfires: true, showSmoke: true })
  })

  it('holds the highest AQI from the step after the bound on', () => {
    expect(before('bound').initial.constraints).toBeUndefined()
    expect(before('row').initial.constraints).toEqual({ ...NO_CONSTRAINTS, maxAqi: 100 })
    expect(before('tutorial').initial.constraints?.maxAqi).toBe(100)
  })

  it('is defined for every step', () => {
    for (let i = 0; i < TOUR_STEPS.length; i++) expect(stateBefore(i, demo, NOW).initial.showPlayer).toBe(true)
  })
})

describe('keepsPopup', () => {
  it('keeps a popup open only where the step is about it', () => {
    expect(TOUR_STEPS.filter((_s, i) => keepsPopup(i)).map((s) => s.key)).toEqual(['map-add', 'popup'])
  })
})
