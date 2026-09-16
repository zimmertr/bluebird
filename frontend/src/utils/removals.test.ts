import { describe, expect, it } from 'vitest'
import { CustomDestination, DestinationResult } from '../types'
import { Place } from './geocode'
import { pendingDestinations } from './customList'
import { geoKey } from './points'
import {
  RemovedEntry,
  activeRemovals,
  authoredScope,
  recordRemoval,
  restorePlace,
} from './removals'

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
    freeze_min_ft: null,
    freeze_max_ft: null,
    freeze_avg_ft: null,
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

const SCOPE = authoredScope(['peak'], 'Mount Rainier, 46.85, -121.76')

describe('recordRemoval', () => {
  it('captures the backing place when the removed row was searched', () => {
    const p = place()
    const removed = recordRemoval(new Map(), row('Mount Rainier'), [p], SCOPE)
    expect(removed.get(geoKey(46.85, -121.76))?.place).toBe(p)
  })

  it('matches the place by coordinate key, not by name', () => {
    const elsewhere = place({ label: 'Mount Rainier', lat: 40, lon: -100 })
    const removed = recordRemoval(new Map(), row('Mount Rainier'), [elsewhere], SCOPE)
    expect(removed.get(geoKey(46.85, -121.76))?.place).toBeNull()
  })

  it('leaves place null for discovered rows and keeps earlier entries', () => {
    const first = recordRemoval(new Map(), row('A', { latitude: 47 }), [], SCOPE)
    const both = recordRemoval(first, row('B', { latitude: 48 }), [], SCOPE)
    expect(both.size).toBe(2)
    expect([...both.values()].map((e) => e.row.name)).toEqual(['A', 'B'])
    expect(both.get(geoKey(47, -121.76))?.place).toBeNull()
    // The input map is not mutated — App state depends on it.
    expect(first.size).toBe(1)
  })

  it('records the scope in force at removal time', () => {
    const removed = recordRemoval(new Map(), row('Mount Rainier'), [], SCOPE)
    expect(removed.get(geoKey(46.85, -121.76))?.scope).toBe(SCOPE)
  })
})

describe('restorePlace', () => {
  const key = geoKey(46.85, -121.76)

  it('re-registers the original place for a searched removal, even when the row is still held', () => {
    const p = place()
    const entry: RemovedEntry = { row: row('Mount Rainier'), place: p, scope: SCOPE }
    expect(restorePlace(entry, new Set([key]), NONE)).toBe(p)
  })

  it('needs no re-registration when the held field still carries the row', () => {
    const entry: RemovedEntry = { row: row('Mount Rainier'), place: null, scope: SCOPE }
    expect(restorePlace(entry, new Set([key]), NONE)).toBeNull()
  })

  it('needs no re-registration when the CSV textarea still names the row', () => {
    const entry: RemovedEntry = {
      row: row('Mount Rainier', { type: 'custom' }),
      place: null,
      scope: SCOPE,
    }
    expect(restorePlace(entry, NONE, new Set([key]))).toBeNull()
  })

  it('rebuilds a place for a row nothing held can re-present', () => {
    const entry: RemovedEntry = {
      row: row('Mount Rainier', { elevation_ft: 14411, osm_id: 'node/123' }),
      place: null,
      scope: SCOPE,
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
    const entry: RemovedEntry = {
      row: row('Somewhere', { type: 'custom' }),
      place: null,
      scope: SCOPE,
    }
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


describe('authoredScope', () => {
  it('reads the same for either order of the same types and either padding of the same CSV', () => {
    expect(authoredScope(['lake', 'peak'], ' A, 1, 2\n')).toBe(
      authoredScope(['peak', 'lake'], 'A, 1, 2'),
    )
  })

  it('changes when the CSV gains a line', () => {
    expect(authoredScope(['peak'], 'A, 1, 2')).not.toBe(
      authoredScope(['peak'], 'A, 1, 2\nD, 3, 4'),
    )
  })

  it('changes when a destination type is checked', () => {
    expect(authoredScope(['peak'], '')).not.toBe(authoredScope(['peak', 'lake'], ''))
  })
})

describe('activeRemovals', () => {
  const key = geoKey(46.85, -121.76)
  const other = authoredScope(
    ['peak'],
    'Mount Rainier, 46.85, -121.76\nGlacier Peak, 48.11, -121.11',
  )

  it('keeps a removal made under the live scope in force', () => {
    const removed = recordRemoval(new Map(), row('Mount Rainier'), [], SCOPE)
    expect(activeRemovals(removed, SCOPE)).toEqual(new Set([key]))
  })

  it('re-offers a removal made under a scope the user has since rewritten', () => {
    const removed = recordRemoval(new Map(), row('Mount Rainier'), [], SCOPE)
    expect(activeRemovals(removed, other)).toEqual(new Set())
    // The map itself is untouched: the report still reads every key.
    expect(removed.size).toBe(1)
  })

  it('expires mixed scopes one by one', () => {
    const first = recordRemoval(new Map(), row('A', { latitude: 47 }), [], SCOPE)
    const both = recordRemoval(first, row('B', { latitude: 48 }), [], other)
    expect(activeRemovals(both, other)).toEqual(new Set([geoKey(48, -121.76)]))
    expect(activeRemovals(both, SCOPE)).toEqual(new Set([geoKey(47, -121.76)]))
  })

  it('is empty for an empty removal map', () => {
    expect(activeRemovals(new Map(), SCOPE)).toEqual(new Set())
  })
})

// The #158 repro, at the seam the fix lives on. A pasted list is analyzed, one
// of its rows is ×-removed, and then the textarea gains another line. The
// removed row's line is still pasted and no longer speaks for the list the user
// authored, so the preview offers it again; a row removed under the list as it
// now reads stays gone.
describe('the pending preview across a CSV edit', () => {
  const rowB: CustomDestination = { name: 'B', latitude: 46.85, longitude: -121.76 }
  const rowD: CustomDestination = { name: 'D', latitude: 48.11, longitude: -121.11 }
  const firstList = [rowB]
  const grownList = [rowB, rowD]
  const firstScope = authoredScope([], 'B, 46.85, -121.76')
  const grownScope = authoredScope([], 'B, 46.85, -121.76\nD, 48.11, -121.11')

  it('re-offers the removed row once its list has been rewritten', () => {
    const removed = recordRemoval(new Map(), row('B'), [], firstScope)
    // Nothing covers the rows yet: the analysis these removals came from
    // echoed the removal away, which is when the preview has a say at all.
    const pending = pendingDestinations(
      grownList,
      [],
      NONE,
      activeRemovals(removed, grownScope),
    )
    expect(pending.map((d) => d.name)).toEqual(['B', 'D'])
  })

  it('keeps a row removed under the list as it now reads gone', () => {
    const removed = recordRemoval(new Map(), row('B'), [], grownScope)
    const pending = pendingDestinations(
      grownList,
      [],
      NONE,
      activeRemovals(removed, grownScope),
    )
    expect(pending.map((d) => d.name)).toEqual(['D'])
  })

  it('hides the removed row while the list is unchanged', () => {
    const removed = recordRemoval(new Map(), row('B'), [], firstScope)
    const pending = pendingDestinations(
      firstList,
      [],
      NONE,
      activeRemovals(removed, firstScope),
    )
    expect(pending).toEqual([])
  })
})
