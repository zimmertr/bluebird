import { describe, it, expect } from 'vitest'
import { buildCustomList, pendingDestinations, pinKey } from './customList'
import { CustomDestination, DestinationResult } from '../types'
import { Place } from './geocode'
import { NO_CONSTRAINTS } from './clientAnalyze'
import { presentResults } from './present'

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

// The analysis snapshot's covered set: what `useAnalyze` records off the
// request's custom_destinations.
function covered(...points: { latitude: number; longitude: number }[]): ReadonlySet<string> {
  return new Set(points.map((p) => pinKey(p.latitude, p.longitude)))
}

describe('pendingDestinations', () => {
  const none = new Set<string>()

  it('makes every CSV row pending before any analysis, tagged as CSV', () => {
    const out = pendingDestinations(csv, [], none, none)
    expect(out.map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams'])
    expect(out.every((d) => d.source === 'csv')).toBe(true)
  })

  it('shows a coordinate matched by both inputs once, as the searched place', () => {
    const searched = place('Rainier (searched)', 46.8529, -121.7604, 14411, { osmId: 'node/1' })
    const out = pendingDestinations(csv, [searched], none, none)
    expect(out.map((d) => d.name)).toEqual(['Mount Adams', 'Rainier (searched)'])
    expect(out[1]).toMatchObject({
      source: 'search',
      kind: 'peak',
      osmId: 'node/1',
      elevation_ft: 14411,
    })
  })

  it('leaves the searched-only fields undefined on a CSV row', () => {
    const [row] = pendingDestinations([csv[0]], [], none, none)
    expect(row.kind).toBeUndefined()
    expect(row.osmId).toBeUndefined()
  })

  it('drops a destination the last analysis covered', () => {
    const out = pendingDestinations(csv, [], covered(csv[0]), none)
    expect(out.map((d) => d.name)).toEqual(['Mount Adams'])
  })

  // The #205 regression, at the seam where it lived. An analysis covers the
  // whole custom list; `limit` shows fewer rows than that. Pending is measured
  // against the analysis, so the rows the cut drops stay dropped instead of
  // coming back as un-forecasted claims that nothing was ever fetched.
  it('leaves an analyzed destination alone when the limit cut drops it', () => {
    const searched = place('Glacier Peak', 48.1122, -121.1139)
    const analyzed = covered(csv[0], csv[1], { latitude: 48.1122, longitude: -121.1139 })
    expect(pendingDestinations(csv, [searched], analyzed, none)).toEqual([])
  })

  // Same reasoning one knob over: the band is a filter on a field that was
  // fetched, not a reason to re-offer the row as unanalyzed.
  it('leaves an analyzed destination alone when the elevation band excludes it', () => {
    const analyzed = covered(csv[0], csv[1])
    expect(pendingDestinations(csv, [], analyzed, none)).toEqual([])
  })

  it('makes a destination named after the last analysis pending again', () => {
    const added = place('Glacier Peak', 48.1122, -121.1139)
    const out = pendingDestinations(csv, [added], covered(csv[0], csv[1]), none)
    expect(out.map((d) => d.name)).toEqual(['Glacier Peak'])
  })

  // The regression this guards: × on a searched place also deregisters it, so
  // it can't come back. A CSV row has no such deregistration — its text stays
  // in the textarea — so without the removed set it would reappear as a pending
  // dot the instant it left the report.
  it('keeps an ×-removed CSV row gone even though its line is still pasted', () => {
    const removed = new Set([pinKey(46.8529, -121.7604)])
    const out = pendingDestinations(csv, [], none, removed)
    expect(out.map((d) => d.name)).toEqual(['Mount Adams'])
  })

  it('matches the covered set and removals at pinKey precision, not exact equality', () => {
    const nudged = covered({ latitude: 46.852903, longitude: -121.760397 })
    expect(pendingDestinations(csv, [], nudged, none).map((d) => d.name)).toEqual(['Mount Adams'])
  })

  it('is empty with no inputs', () => {
    expect(pendingDestinations([], [], none, none)).toEqual([])
  })
})

// TJ's repro, composed from the two functions that disagreed (#205): a pasted
// list plus a polygon analyzed together, displayed under a smaller `limit`.
// Every row on screen carries a forecast, and nothing that was analyzed comes
// back as pending — the table shows `limit` rows, not `limit` plus the
// overflow drawn blank.
describe('a field larger than the limit', () => {
  const CSV_ROWS = 100
  const list: CustomDestination[] = Array.from({ length: CSV_ROWS }, (_, i) => ({
    name: `Peak ${i + 1}`,
    latitude: 46 + i / 1000,
    longitude: -121 - i / 1000,
  }))
  const searched = place('Searched Peak', 47.5, -120.5)
  // Ranked by precipitation ascending: the discovered destinations are drier
  // than the whole pasted list, so the custom rows are exactly what the cut
  // drops.
  const discovered = Array.from({ length: 30 }, (_, i) =>
    result({
      name: `Discovered ${i + 1}`,
      type: 'peak',
      latitude: 45 + i / 1000,
      longitude: -122 - i / 1000,
      precip_total_in: 0.01 * i,
    }),
  )
  const universe = [
    ...discovered,
    ...list.map((d, i) =>
      result({ name: d.name, latitude: d.latitude, longitude: d.longitude, precip_total_in: 1 + i }),
    ),
    result({ name: searched.label, latitude: searched.lat, longitude: searched.lon, precip_total_in: 999 }),
  ]
  const analyzed = covered(...list, { latitude: searched.lat, longitude: searched.lon })
  const knobs = {
    sortBy: 'precip_total_in' as const,
    sortDesc: false,
    limit: 100,
    band: { min: null, max: null },
    constraints: NO_CONSTRAINTS,
  }

  it('shows exactly the limit, all of them forecasted', () => {
    const { rows, eligible } = presentResults(universe, knobs, new Set())
    expect(rows).toHaveLength(knobs.limit)
    expect(rows.every((r) => r.precip_total_in !== null)).toBe(true)
    expect(eligible).toBe(universe.length)
  })

  it('reports nothing pending, so no un-forecasted row joins them', () => {
    expect(pendingDestinations(list, [searched], analyzed, new Set())).toEqual([])
  })

  it('raising the limit reveals the overflow with its forecast attached', () => {
    const { rows } = presentResults(universe, { ...knobs, limit: 200 }, new Set())
    expect(rows).toHaveLength(universe.length)
    expect(rows[rows.length - 1].name).toBe(searched.label)
    expect(rows[rows.length - 1].precip_total_in).toBe(999)
  })
})
