import { describe, it, expect } from 'vitest'
import { buildCustomList, customListSize, distinctRows, foundAsPending, pendingAsResult, pendingDestinations } from './customList'
import { destinationUrl } from './destinationUrl'
import { pendingLinkRow } from './resultsCells'
import { geoKey } from './points'
import { CustomDestination, DestinationResult } from '../types'
import { NO_CONSTRAINTS } from './clientAnalyze'
import { presentResults } from './present'
import { discovered, place, resultRow } from '../testSupport/fixtures'

const csv: CustomDestination[] = [
  { name: 'Mount Rainier', latitude: 46.8529, longitude: -121.7604 },
  { name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, elevation_ft: 12281 },
]

// The coordinates match the CSV above, because a pin is keyed by coordinate.
function result(overrides: Partial<DestinationResult> = {}): DestinationResult {
  return resultRow({
    type: 'custom',
    latitude: 46.8529,
    longitude: -121.7604,
    temp_min_f: 44.2,
    temp_max_f: 74.9,
    temp_avg_f: 62.1,
    wind_min_mph: 1,
    wind_max_mph: 10,
    wind_avg_mph: 6.4,
    ...overrides,
  })
}

describe('buildCustomList', () => {
  it('unions CSV rows with searched places, CSV first', () => {
    const out = buildCustomList(csv, [place({ label: 'Glacier Peak', lat: 48.1122, lon: -121.1139 })])
    expect(out.map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams', 'Glacier Peak'])
  })

  it('a searched place wins a coordinate collision with a CSV row', () => {
    const out = buildCustomList(csv, [place({ label: 'Rainier (searched)', lat: 46.8529, lon: -121.7604, elevationFt: 14411 })])
    expect(out.map((d) => d.name)).toEqual(['Mount Adams', 'Rainier (searched)'])
    expect(out[1].elevation_ft).toBe(14411)
  })

  // A line pasted twice is one destination, kept under its first name, so
  // its forecast is bought once and it does not rank against itself.
  it('keeps a CSV line repeated at one coordinate once, as first written', () => {
    const again = { name: 'Rainier again', latitude: 46.852901, longitude: -121.760401 }
    const out = buildCustomList([...csv, again], [])
    expect(out.map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams'])
  })

  it('counts a repeated line once, which is the number under the box', () => {
    const again = { name: 'Rainier again', latitude: 46.852901, longitude: -121.760401 }
    expect(distinctRows([...csv, again]).map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams'])
  })

  it('carries a searched place elevation and leaves it absent when unknown', () => {
    const out = buildCustomList([], [place({ label: 'A', lat: 1, lon: 2, elevationFt: 5000 }), place({ label: 'B', lat: 3, lon: 4 })])
    expect(out[0].elevation_ft).toBe(5000)
    expect(out[1].elevation_ft).toBeUndefined()
  })

  it('handles either side empty', () => {
    expect(buildCustomList([], [])).toEqual([])
    expect(buildCustomList(csv, []).map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams'])
    expect(buildCustomList([], [place({ label: 'X', lat: 1, lon: 2 })]).map((d) => d.name)).toEqual(['X'])
  })

  // This list is the `custom_destinations` request body. The UI-only fields the
  // pending list needs must not ride along into a CI-gated API contract.
  it('emits only wire fields, never the UI-only ones', () => {
    const out = buildCustomList(csv, [place({ label: 'X', lat: 1, lon: 2, elevationFt: 100, osmId: 'node/1' })])
    for (const d of out) {
      expect(Object.keys(d).sort()).toEqual(['elevation_ft', 'latitude', 'longitude', 'name'])
    }
  })
})

// The analysis snapshot's covered set: what `useAnalyze` records off the
// request's custom_destinations.
function covered(...points: { latitude: number; longitude: number }[]): ReadonlySet<string> {
  return new Set(points.map((p) => geoKey(p.latitude, p.longitude)))
}

// #673: what the paste-time lookup learned rides on the pending rows and the
// request list, so a row shows its elevation before any analysis and the pod
// skips the map server for it.
// The size the Analyze gate holds a list over the cap by (#803): the rows a
// run would send, not the lines pasted.
describe('customListSize', () => {
  it('counts what a run sends: a coordinate once, a pin over a pasted row at its point', () => {
    const again = { name: 'Rainier again', latitude: 46.852901, longitude: -121.760401 }
    const pin = place({ label: 'Rainier (searched)', lat: 46.8529, lon: -121.7604 })
    expect(customListSize([], [])).toBe(0)
    expect(customListSize([...csv, again], [])).toBe(2)
    expect(customListSize(csv, [pin])).toBe(2)
    expect(customListSize(csv, [place({ label: 'Glacier Peak', lat: 48.1122, lon: -121.1139 })])).toBe(3)
    expect(customListSize(csv, [pin])).toBe(buildCustomList(csv, [pin]).length)
  })
})

describe('the learned identities', () => {
  const key = geoKey(csv[0].latitude, csv[0].longitude)
  const identity = new Map([[key, { elevation_ft: 5000, osm_id: 'node/9' }]])

  it('fill a pending CSV row and the request row at that coordinate', () => {
    const [pending] = pendingDestinations([csv[0]], [], new Set(), new Set(), identity)
    expect([pending.elevation_ft, pending.osmId]).toEqual([5000, 'node/9'])
    expect(buildCustomList([csv[0]], [], identity)[0]).toEqual({ ...csv[0], elevation_ft: 5000 })
  })

  it('never override what a row already carries', () => {
    const [pending] = pendingDestinations([{ ...csv[0], elevation_ft: 1 }], [], new Set(), new Set(), identity)
    expect(pending.elevation_ft).toBe(1)
  })
})

describe('pendingDestinations', () => {
  const none = new Set<string>()

  it('makes every CSV row pending before any analysis, tagged as CSV', () => {
    const out = pendingDestinations(csv, [], none, none)
    expect(out.map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams'])
    expect(out.every((d) => d.source === 'csv')).toBe(true)
  })

  it('shows a coordinate matched by both inputs once, as the searched place', () => {
    const searched = place({ label: 'Rainier (searched)', lat: 46.8529, lon: -121.7604, elevationFt: 14411, osmId: 'node/1' })
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
    const searched = place({ label: 'Glacier Peak', lat: 48.1122, lon: -121.1139 })
    const analyzed = covered(csv[0], csv[1], { latitude: 48.1122, longitude: -121.1139 })
    expect(pendingDestinations(csv, [searched], analyzed, none)).toEqual([])
  })

  it('makes a destination named after the last analysis pending again', () => {
    const added = place({ label: 'Glacier Peak', lat: 48.1122, lon: -121.1139 })
    const out = pendingDestinations(csv, [added], covered(csv[0], csv[1]), none)
    expect(out.map((d) => d.name)).toEqual(['Glacier Peak'])
  })

  // The regression this guards: × on a searched place also deregisters it, so
  // it can't come back. A CSV row has no such deregistration — its text stays
  // in the textarea — so without the removed set it would reappear as a pending
  // dot the instant it left the report.
  it('keeps an ×-removed CSV row gone even though its line is still pasted', () => {
    const removed = new Set([geoKey(46.8529, -121.7604)])
    const out = pendingDestinations(csv, [], none, removed)
    expect(out.map((d) => d.name)).toEqual(['Mount Adams'])
  })

  it('matches the covered set and removals at geoKey precision, not exact equality', () => {
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
  const searched = place({ label: 'Searched Peak', lat: 47.5, lon: -120.5 })
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
    constraints: NO_CONSTRAINTS,
  }

  it('shows exactly the limit', () => {
    const { rows, eligible } = presentResults(universe, knobs, new Set())
    expect(rows).toHaveLength(knobs.limit)
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

// The row shape a pending destination takes on the table and the chart, spelled
// once so the two surfaces cannot draw the same dot differently.
describe('pendingAsResult', () => {
  it('keeps the identity a searched place carries', () => {
    const searched = place({ label: 'Mount Rainier', lat: 46.8529, lon: -121.7604, elevationFt: 14411 })
    const [row] = pendingDestinations([], [searched], new Set(), new Set()).map(pendingAsResult)
    expect(row.name).toBe('Mount Rainier')
    expect(row.type).toBe('peak')
    expect(row.elevation_ft).toBe(14411)
    expect(row.latitude).toBe(46.8529)
    expect(row.longitude).toBe(-121.7604)
  })

  // A pasted coordinate has no kind and often no elevation. Both read as
  // absent rather than as a number nothing measured.
  it('falls back to the custom kind and a null elevation', () => {
    const [row] = pendingDestinations([csv[0]], [], new Set(), new Set()).map(pendingAsResult)
    expect(row.type).toBe('custom')
    expect(row.elevation_ft).toBeNull()
  })

  // Every metric stays absent: no analysis has covered this destination, and a
  // zero here would rank and colour as a real reading.
  it('carries no metric at all', () => {
    const [row] = pendingDestinations([csv[0]], [], new Set(), new Set()).map(pendingAsResult)
    for (const key of ['precip_total_in', 'temp_avg_f', 'wind_avg_mph', 'aqi_avg'] as const) {
      expect(row[key]).toBeUndefined()
    }
  })
})

// #782: a ring's found destination shows as a pending row until its forecast
// lands, and links where its ranked row will.
describe('foundAsPending', () => {
  it('carries the type discovery gave as its kind, and its OSM id and elevation', () => {
    const row = foundAsPending(discovered({ name: 'Snow Lake', type: 'lake', elevation_ft: 4016, osm_id: 'way/12' }))
    expect(row).toEqual({
      name: 'Snow Lake',
      latitude: 47.45,
      longitude: -121.8,
      elevation_ft: 4016,
      kind: 'lake',
      osmId: 'way/12',
      source: 'polygon',
    })
  })

  it('leaves an unknown elevation and a missing id absent', () => {
    const row = foundAsPending(discovered({ elevation_ft: null, osm_id: null }))
    expect(row.elevation_ft).toBeUndefined()
    expect(row.osmId).toBeUndefined()
  })

  it('links every kind where its ranked row links', () => {
    for (const type of ['peak', 'crag', 'lake', 'trailhead', 'custom']) {
      const found = discovered({ name: 'Probe', type, osm_id: 'node/5' })
      const ranked = resultRow({ name: 'Probe', type, latitude: found.latitude, longitude: found.longitude, osm_id: 'node/5' })
      expect(destinationUrl(pendingLinkRow(foundAsPending(found)))).toBe(destinationUrl(ranked))
    }
  })
})
