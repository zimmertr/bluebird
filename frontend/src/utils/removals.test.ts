import { describe, expect, it } from 'vitest'
import { DestinationResult } from '../types'
import { Place } from './geocode'
import { pinKey } from './customList'
import { recordRemoval, restorePlace, RemovedEntry } from './removals'

function row(name: string, over: Partial<DestinationResult> = {}): DestinationResult {
  return {
    name,
    type: 'peak',
    latitude: 46.85,
    longitude: -121.76,
    elevation_ft: null,
    osm_id: null,
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_min_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 0,
    temp_max_f: 0,
    temp_avg_f: 0,
    wind_min_mph: 0,
    wind_max_mph: 0,
    wind_avg_mph: 0,
    aqi_avg: null,
    aqi_min: null,
    aqi_max: null,
    series: null,
    ...over,
  }
}

function place(over: Partial<Place> = {}): Place {
  return {
    label: 'Mount Rainier',
    description: 'Mount Rainier, Pierce County, Washington',
    kind: 'peak',
    lat: 46.85,
    lon: -121.76,
    ...over,
  }
}

const NONE: ReadonlySet<string> = new Set()

describe('recordRemoval', () => {
  it('captures the backing place when the removed row was searched', () => {
    const p = place()
    const removed = recordRemoval(new Map(), row('Mount Rainier'), [p])
    expect(removed.get(pinKey(46.85, -121.76))?.place).toBe(p)
  })

  it('matches the place by coordinate key, not by name', () => {
    const elsewhere = place({ label: 'Mount Rainier', lat: 40, lon: -100 })
    const removed = recordRemoval(new Map(), row('Mount Rainier'), [elsewhere])
    expect(removed.get(pinKey(46.85, -121.76))?.place).toBeNull()
  })

  it('leaves place null for discovered rows and keeps earlier entries', () => {
    const first = recordRemoval(new Map(), row('A', { latitude: 47 }), [])
    const both = recordRemoval(first, row('B', { latitude: 48 }), [])
    expect(both.size).toBe(2)
    expect([...both.values()].map((e) => e.row.name)).toEqual(['A', 'B'])
    expect(both.get(pinKey(47, -121.76))?.place).toBeNull()
    // The input map is not mutated — App state depends on it.
    expect(first.size).toBe(1)
  })
})

describe('restorePlace', () => {
  const key = pinKey(46.85, -121.76)

  it('re-registers the original place for a searched removal, even when the row is still held', () => {
    const p = place()
    const entry: RemovedEntry = { row: row('Mount Rainier'), place: p }
    expect(restorePlace(entry, new Set([key]), NONE)).toBe(p)
  })

  it('needs no re-registration when the held field still carries the row', () => {
    const entry: RemovedEntry = { row: row('Mount Rainier'), place: null }
    expect(restorePlace(entry, new Set([key]), NONE)).toBeNull()
  })

  it('needs no re-registration when the CSV textarea still names the row', () => {
    const entry: RemovedEntry = { row: row('Mount Rainier', { type: 'custom' }), place: null }
    expect(restorePlace(entry, NONE, new Set([key]))).toBeNull()
  })

  it('rebuilds a place for a row nothing held can re-present', () => {
    const entry: RemovedEntry = {
      row: row('Mount Rainier', { elevation_ft: 14411, osm_id: 'node/123' }),
      place: null,
    }
    expect(restorePlace(entry, NONE, NONE)).toEqual({
      label: 'Mount Rainier',
      description: '',
      kind: 'peak',
      lat: 46.85,
      lon: -121.76,
      elevationFt: 14411,
      osmId: 'node/123',
    })
  })

  it('omits unknown elevation and OSM id, and maps type custom to an unknown kind', () => {
    const entry: RemovedEntry = { row: row('Somewhere', { type: 'custom' }), place: null }
    const rebuilt = restorePlace(entry, NONE, NONE)
    expect(rebuilt).toEqual({
      label: 'Somewhere',
      description: '',
      kind: '',
      lat: 46.85,
      lon: -121.76,
    })
    expect(rebuilt && 'elevationFt' in rebuilt).toBe(false)
    expect(rebuilt && 'osmId' in rebuilt).toBe(false)
  })
})
