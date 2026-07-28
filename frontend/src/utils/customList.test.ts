import { describe, it, expect } from 'vitest'
import { buildCustomList, pendingDestinations, pinKey } from './customList'
import { CustomDestination, DestinationResult } from '../types'
import { Place } from './geocode'

const csv: CustomDestination[] = [
  { name: 'Mount Rainier', latitude: 46.8529, longitude: -121.7604 },
  { name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, elevation_ft: 12281 },
]

function place(
  label: string,
  lat: number,
  lon: number,
  elevationFt?: number,
  extra: Partial<Place> = {},
): Place {
  return {
    label,
    description: '',
    kind: 'peak',
    lat,
    lon,
    ...(elevationFt ? { elevationFt } : {}),
    ...extra,
  }
}

function result(overrides: Partial<DestinationResult> = {}): DestinationResult {
  return {
    name: 'Mount Rainier',
    type: 'custom',
    latitude: 46.8529,
    longitude: -121.7604,
    elevation_ft: null,
    osm_id: null,
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 44.2,
    temp_max_f: 74.9,
    temp_avg_f: 62.1,
    wind_min_mph: 1,
    wind_max_mph: 10,
    wind_avg_mph: 6.4,
    aqi_avg: null,
    aqi_max: null,
    ...overrides,
  }
}

describe('pinKey', () => {
  it('rounds to 5 decimals (~1 m) so near-identical coords collide', () => {
    expect(pinKey(46.852891, -121.760408)).toBe(pinKey(46.85289, -121.76041))
  })
})

describe('buildCustomList', () => {
  it('unions CSV rows with searched places, CSV first', () => {
    const out = buildCustomList(csv, [place('Glacier Peak', 48.1122, -121.1139)])
    expect(out.map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams', 'Glacier Peak'])
  })

  it('a searched place wins a coordinate collision with a CSV row', () => {
    const out = buildCustomList(csv, [place('Rainier (searched)', 46.8529, -121.7604, 14411)])
    expect(out.map((d) => d.name)).toEqual(['Mount Adams', 'Rainier (searched)'])
    expect(out[1].elevation_ft).toBe(14411)
  })

  it('carries a searched place elevation and leaves it absent when unknown', () => {
    const out = buildCustomList([], [place('A', 1, 2, 5000), place('B', 3, 4)])
    expect(out[0].elevation_ft).toBe(5000)
    expect(out[1].elevation_ft).toBeUndefined()
  })

  it('handles either side empty', () => {
    expect(buildCustomList([], [])).toEqual([])
    expect(buildCustomList(csv, []).map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams'])
    expect(buildCustomList([], [place('X', 1, 2)]).map((d) => d.name)).toEqual(['X'])
  })

  // This list is the `custom_destinations` request body. The UI-only fields the
  // pending list needs must not ride along into a CI-gated API contract.
  it('emits only wire fields, never the UI-only ones', () => {
    const out = buildCustomList(csv, [place('X', 1, 2, 100, { osmId: 'node/1' })])
    for (const d of out) {
      expect(Object.keys(d).sort()).toEqual(['elevation_ft', 'latitude', 'longitude', 'name'])
    }
  })
})

describe('pendingDestinations', () => {
  const none = new Set<string>()

  it('makes every CSV row pending before any analysis, tagged as CSV', () => {
    const out = pendingDestinations(csv, [], [], none)
    expect(out.map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams'])
    expect(out.every((d) => d.source === 'csv')).toBe(true)
  })

  it('shows a coordinate matched by both inputs once, as the searched place', () => {
    const searched = place('Rainier (searched)', 46.8529, -121.7604, 14411, { osmId: 'node/1' })
    const out = pendingDestinations(csv, [searched], [], none)
    expect(out.map((d) => d.name)).toEqual(['Mount Adams', 'Rainier (searched)'])
    expect(out[1]).toMatchObject({
      source: 'search',
      kind: 'peak',
      osmId: 'node/1',
      elevation_ft: 14411,
    })
  })

  it('leaves the searched-only fields undefined on a CSV row', () => {
    const [row] = pendingDestinations([csv[0]], [], [], none)
    expect(row.kind).toBeUndefined()
    expect(row.osmId).toBeUndefined()
  })

  it('drops a destination once the report carries its forecast', () => {
    const out = pendingDestinations(csv, [], [result()], none)
    expect(out.map((d) => d.name)).toEqual(['Mount Adams'])
  })

  // The regression this guards: × on a searched place also deregisters it, so
  // it can't come back. A CSV row has no such deregistration — its text stays
  // in the textarea — so without the removed set it would reappear as a pending
  // dot the instant it left the report.
  it('keeps an ×-removed CSV row gone even though its line is still pasted', () => {
    const removed = new Set([pinKey(46.8529, -121.7604)])
    const out = pendingDestinations(csv, [], [], removed)
    expect(out.map((d) => d.name)).toEqual(['Mount Adams'])
  })

  it('matches results and removals at pinKey precision, not exact equality', () => {
    const nudged = [result({ latitude: 46.852903, longitude: -121.760397 })]
    expect(pendingDestinations(csv, [], nudged, none).map((d) => d.name)).toEqual(['Mount Adams'])
  })

  it('is empty with no inputs', () => {
    expect(pendingDestinations([], [], [], none)).toEqual([])
  })
})
