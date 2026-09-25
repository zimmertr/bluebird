import { describe, expect, it } from 'vitest'
import { TOUR_STEPS, stepIndex } from '../utils/tourSteps'
import demoData from './demoData.json'
import {
  FIRE_AT,
  PASTED,
  POOL_NAMES,
  RING_POLYGON,
  type DemoData,
  aqiAt,
  castPlaces,
  exampleFire,
  exampleSmoke,
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

describe('aqiAt', () => {
  // On the US AQI's own bands: past 100 is unhealthy for sensitive groups,
  // and 50 or under is good.
  it('is unhealthy beside the fire and good far from it, all day', () => {
    for (let h = 0; h < 13; h++) {
      for (const name of ['Glacier Peak', 'Kennedy Peak', 'Gamma Peak']) {
        expect(aqiAt(at(name).latitude, at(name).longitude, h), name).toBeGreaterThan(100)
      }
      for (const name of ['Dome Peak', 'Mount Misch', 'Bannock Mountain', 'Sitting Bull Mountain', 'Plummer Mountain']) {
        expect(aqiAt(at(name).latitude, at(name).longitude, h), name).toBeLessThanOrEqual(50)
      }
    }
  })

  it('is the same number every time it is asked', () => {
    expect(aqiAt(48.2, -121.0, 3)).toBe(aqiAt(48.2, -121.0, 3))
  })

  it('stays on the US AQI scale', () => {
    for (let h = 0; h < 24; h++) {
      const v = aqiAt(FIRE_AT.lat, FIRE_AT.lon, h)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(300)
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
    expect(before('search')).toEqual({ initial: { showPlayer: true }, autoAnalyze: false })
  })

  it('holds each step\'s result from the step after it on', () => {
    expect(before('map').initial.pins?.map((p) => p.label)).toEqual(['Glacier Peak'])
    expect(before('polygon').initial.pins?.map((p) => p.label)).toEqual(['Glacier Peak', 'Dome Peak'])
    expect(before('coordinates').initial).toMatchObject({ polygon: RING_POLYGON, destinationTypes: ['peak'] })
    expect(before('model').initial.customCsv).toBe(PASTED)
    expect(before('calendar').initial).toMatchObject({ forecastModel: 'gfs_hrrr', compareModels: [] })
    expect(before('metrics').initial.selection).toMatchObject({
      kind: 'days',
      startDate: '2026-09-25',
      endDate: '2026-09-25',
      hours: { start: '06:00', end: '18:00' },
    })
  })

  it('has analyzed from the step after Analyze on, with the overlays on after Layers', () => {
    expect(before('analyze').autoAnalyze).toBe(false)
    expect(before('layers').autoAnalyze).toBe(true)
    expect(before('layers').initial.showWildfires).toBeUndefined()
    expect(before('results').initial).toMatchObject({ showWildfires: true, showSmoke: true })
  })

  it('is defined for every step', () => {
    for (let i = 0; i < TOUR_STEPS.length; i++) expect(stateBefore(i, demo, NOW).initial.showPlayer).toBe(true)
  })
})
