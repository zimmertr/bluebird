import { describe, expect, it } from 'vitest'
import { DestinationResult } from '../types'
import { geoKey } from './points'
import { Constraints, NO_CONSTRAINTS } from './clientAnalyze'
import {
  AnalyzedSnapshot,
  CommitChanges,
  PresentationKnobs,
  cloudNeeded,
  commitNeeded,
  discoveryChanges,
  discoveryKeys,
  fieldHasValue,
  presentResults,
} from './present'
import { resultRow } from '../testSupport/fixtures'

// Rows differing only in the fields under test, so an assertion on names reads
// as an assertion on ordering and membership.
function row(
  name: string,
  over: Partial<DestinationResult> = {},
): DestinationResult {
  return resultRow({ name, latitude: 0, longitude: 0, series: null, ...over })
}

// Distinct coordinates, since removals are keyed by coordinate.
function at(name: string, lat: number, over: Partial<DestinationResult> = {}): DestinationResult {
  return row(name, { latitude: lat, longitude: -121.9, ...over })
}

const KNOBS: PresentationKnobs = {
  sortBy: 'precip_total_in',
  sortDesc: false,
  limit: 10,
  constraints: NO_CONSTRAINTS,
}

// What an analysis records about itself: the knobs it ran under, nothing more.
const ANALYZED: AnalyzedSnapshot = { ...KNOBS }

// The change flags, defaulting to "nothing moved" so a test names only the
// flag it is about.
const changed = (over: Partial<CommitChanges> = {}): CommitChanges => ({
  window: false,
  model: false,
  polygon: false,
  types: false,
  destinationAdded: false,
  cloud: false,
  ...over,
})

const NONE = new Set<string>()

// ── commitNeeded ───────────────────────────────────────────────────────────

describe('commitNeeded', () => {
  it('is silent before the first analysis', () => {
    expect(commitNeeded(null, changed())).toEqual([])
  })

  // A model change is a commit for a stronger reason than a window change: the
  // held field is not missing rows, every number in it came from a model the
  // panel no longer names.
  it('asks for an Analyze when the model changes', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ model: true }))).toEqual(['model-changed'])
  })

  // A user who changed both is owed both sentences (TJ, 2026-08-22), model
  // first: a model change can clamp the window as a side effect, and leading
  // with the model keeps the clamp attributed to its cause.
  it('reports the model and the window together, model first', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ window: true, model: true }))).toEqual([
      'model-changed',
      'window-changed',
    ])
  })

  it('still names the window when only the window moved', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ window: true }))).toEqual(['window-changed'])
  })

  it('is silent for sort, direction and limit changes over a held field', () => {
    const analyzed = { ...ANALYZED }
    expect(commitNeeded(analyzed, changed())).toEqual([])
    expect(commitNeeded(analyzed, changed())).toEqual([])
    expect(commitNeeded(analyzed, changed())).toEqual([])
  })

  it('is silent for a forecast bound over a held field', () => {
    // A bound can only re-read rows the browser already has, so loosening one
    // is as live as tightening it and neither is ever a reason to commit.
    expect(commitNeeded({ ...ANALYZED }, changed())).toEqual([])
  })

  it('is silent for an AQI ranking, which the eager AQI fetch already covers', () => {
    expect(commitNeeded({ ...ANALYZED }, changed())).toEqual([])
  })

  // The forecast window is a data knob, so this one is not a comparison of held
  // knobs at all: the caller decides, and the answer is always "commit". Worth a
  // cue since the calendar made changing days a click rather than two typed
  // datetimes (#166).
  it('asks for an Analyze when the forecast window is not the one behind the rows', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ window: true }))).toEqual(['window-changed'])
  })

  it('reports both when both went stale, model first', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ window: true, model: true }))).toEqual([
      'model-changed',
      'window-changed',
    ])
  })

  it('says nothing about a window before the first analysis', () => {
    expect(commitNeeded(null, changed({ window: true }))).toEqual([])
  })

  // The caller's predicate is `pendingDestinations` — the set behind the
  // map's pending dots — so the cue and the dots cannot disagree.
  it('asks for an Analyze when a destination was added since the analysis', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ destinationAdded: true }))).toEqual([
      'destination-added',
    ])
  })

  it('reports an added destination after the stale-report reasons', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ window: true, model: true, destinationAdded: true }))).toEqual([
      'model-changed',
      'window-changed',
      'destination-added',
    ])
  })

  it('says nothing about an added destination before the first analysis', () => {
    // Everything is pending before the first run; the map's neutral dots and
    // the un-forecasted rows already say so, and there is no report to be
    // out of date with.
    expect(commitNeeded(null, changed({ destinationAdded: true }))).toEqual([])
  })

  it('asks for an Analyze when the search area or the types changed', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ polygon: true }))).toEqual([
      'polygon-changed',
    ])
    expect(commitNeeded({ ...ANALYZED }, changed({ types: true }))).toEqual([
      'types-changed',
    ])
  })

  it('reports every reason at once, in the fixed order', () => {
    const analyzed = { ...ANALYZED }
    expect(
      commitNeeded(
        analyzed,
        changed({
          window: true,
          model: true,
          polygon: true,
          types: true,
          destinationAdded: true,
          cloud: true,
        }),
      ),
    ).toEqual([
      'model-changed',
      'window-changed',
      'polygon-changed',
      'types-changed',
      'destination-added',
      'cloud-needed',
    ])
  })

  // #117: the one reason a presentation knob raises.
  it('asks for an analysis when a cloud metric is named over a report without it', () => {
    expect(commitNeeded({ ...ANALYZED }, changed({ cloud: true }))).toEqual(['cloud-needed'])
  })
})

describe('cloudNeeded', () => {
  it('is raised by a cloud metric over a report analyzed without the column', () => {
    expect(cloudNeeded({ cloudFetched: false }, true)).toBe(true)
  })

  it('is quiet once the report carries the column, whatever its rows hold', () => {
    // An archive report fetched the column and holds a null base at every
    // hour; asking again would buy the same nulls.
    expect(cloudNeeded({ cloudFetched: true }, true)).toBe(false)
  })

  it('is quiet when no cloud metric is named, and before any report exists', () => {
    expect(cloudNeeded({ cloudFetched: false }, false)).toBe(false)
    expect(cloudNeeded(null, true)).toBe(false)
  })
})

// ── discoveryKeys ──────────────────────────────────────────────────────────

describe('discoveryKeys', () => {
  const ring = { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }

  it('is order-independent over the type set, like the cache key upstream', () => {
    expect(discoveryKeys(ring, ['peak', 'lake'], false).typesKey).toBe(
      discoveryKeys(ring, ['lake', 'peak'], false).typesKey,
    )
  })

  it('treats the unnamed-peaks toggle as a type change', () => {
    // The toggle widens what discovery finds the same way checking another
    // type does, so it must move the same key.
    expect(discoveryKeys(ring, ['peak'], true).typesKey).not.toBe(
      discoveryKeys(ring, ['peak'], false).typesKey,
    )
  })

  it('tells two rings apart, and a ring from none', () => {
    const other = { coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] }
    expect(discoveryKeys(ring, [], false).polygonKey).not.toBe(
      discoveryKeys(other, [], false).polygonKey,
    )
    expect(discoveryKeys(ring, [], false).polygonKey).not.toBe(
      discoveryKeys(null, [], false).polygonKey,
    )
  })

  it('spells the no-discovery case identically for both sides', () => {
    // The custom-only request omits polygon and types; the panel derives from
    // null and an unchecked set. The two must land on one spelling or every
    // custom-only report would cue.
    expect(discoveryKeys(undefined, undefined, undefined)).toEqual(
      discoveryKeys(null, [], false),
    )
  })
})

// ── discoveryChanges ───────────────────────────────────────────────────────

describe('discoveryChanges', () => {
  const ANALYZED_KEYS = discoveryKeys(
    { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    ['lake'],
    false,
  )
  const REDRAWN = { coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] }

  it('reports both when the ring and the types both moved', () => {
    // The bug this function exists to pin: suppressing the types cue under a
    // changed ring silently dropped the knob the user had just clicked.
    expect(
      discoveryChanges(ANALYZED_KEYS, discoveryKeys(REDRAWN, ['lake', 'peak'], false), true),
    ).toEqual({ polygon: true, types: true })
  })

  it('reports each alone when only one moved', () => {
    const ring = { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    expect(discoveryChanges(ANALYZED_KEYS, discoveryKeys(REDRAWN, ['lake'], false), true)).toEqual({
      polygon: true,
      types: false,
    })
    expect(
      discoveryChanges(ANALYZED_KEYS, discoveryKeys(ring, ['lake', 'peak'], false), true),
    ).toEqual({ polygon: false, types: true })
  })

  it('stays silent when neither moved', () => {
    const same = { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    expect(discoveryChanges(ANALYZED_KEYS, discoveryKeys(same, ['lake'], false), true)).toEqual({
      polygon: false,
      types: false,
    })
  })

  it('stays silent without a complete ring, whatever the keys say', () => {
    // Mid-draw the polygon blocker is already speaking; a cleared ring leaves
    // nothing to re-search; types with no ring discover nothing.
    expect(
      discoveryChanges(ANALYZED_KEYS, discoveryKeys(REDRAWN, ['peak'], true), false),
    ).toEqual({ polygon: false, types: false })
  })

  it('stays silent before the first analysis', () => {
    expect(discoveryChanges(null, discoveryKeys(REDRAWN, ['peak'], false), true)).toEqual({
      polygon: false,
      types: false,
    })
  })
})

// ── presentResults ─────────────────────────────────────────────────────────

describe('presentResults', () => {
  const universe = [
    at('Wet', 1, { precip_total_in: 0.9, elevation_ft: 9000 }),
    at('Dry', 2, { precip_total_in: 0.1, elevation_ft: 7000 }),
    at('Mid', 3, { precip_total_in: 0.5, elevation_ft: 11000 }),
    at('Untagged', 4, { precip_total_in: 0.3, elevation_ft: null }),
  ]

  it('ranks the whole field, not the rows a previous cut left', () => {
    const { rows } = presentResults(universe, KNOBS, NONE)
    expect(rows.map((r) => r.name)).toEqual(['Dry', 'Untagged', 'Mid', 'Wet'])
  })

  it('re-ranks by a different metric without refetching anything', () => {
    const { rows } = presentResults(universe, { ...KNOBS, sortBy: 'temp_avg_f' }, NONE)
    // All temps are equal here, so this asserts the comparator was applied at
    // all (stable order) rather than the precip ranking leaking through.
    expect(rows.map((r) => r.name)).toEqual(['Wet', 'Dry', 'Mid', 'Untagged'])
  })

  it('honors sortDesc', () => {
    const { rows } = presentResults(universe, { ...KNOBS, sortDesc: true }, NONE)
    expect(rows.map((r) => r.name)).toEqual(['Wet', 'Mid', 'Untagged', 'Dry'])
  })

  it('cuts to limit after ranking, so the cut is of the whole field', () => {
    const { rows } = presentResults(universe, { ...KNOBS, limit: 2 }, NONE)
    expect(rows.map((r) => r.name)).toEqual(['Dry', 'Untagged'])
  })

  // The one derivation every surface reads, so a snapshot metric ranks and
  // bounds through it like any other rather than needing a path of its own
  // (#449). The bounds and the comparator already carry it; this is what
  // proves the derivation does not have to learn anything.
  it('ranks and bounds a snapshot metric with no new logic', () => {
    const field = [
      at('Bare', 5, { snow_depth_in: 0 }),
      at('Deep', 6, { snow_depth_in: 60 }),
      at('Outside', 7, { snow_depth_in: null }),
      at('Ankle', 8, { snow_depth_in: 3 }),
    ]
    const knobs: PresentationKnobs = { ...KNOBS, sortBy: 'snow_depth_in', sortDesc: true }
    // Nulls rank last in either direction, as they do on every nullable key.
    expect(presentResults(field, knobs, NONE).rows.map((r) => r.name)).toEqual([
      'Deep',
      'Ankle',
      'Bare',
      'Outside',
    ])
    const bounded: Constraints = { ...NO_CONSTRAINTS, minSnowDepthIn: 12 }
    const out = presentResults(field, { ...knobs, constraints: bounded }, NONE)
    // The row with no depth passes the bound, so it survives the cut and is
    // ranked last rather than dropped.
    expect(out.rows.map((r) => r.name)).toEqual(['Deep', 'Outside'])
    expect(out.eligible).toBe(2)
  })

  it('drops removed destinations and promotes the next row into the cut', () => {
    const removed = new Set([geoKey(2, -121.9)])
    const { rows } = presentResults(universe, { ...KNOBS, limit: 2 }, removed)
    // 'Dry' removed, so the cut is the next two rather than one row and a gap.
    expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Mid'])
  })

  it('never resurrects a removed destination when limit rises', () => {
    const removed = new Set([geoKey(2, -121.9)])
    const { rows } = presentResults(universe, { ...KNOBS, limit: 100 }, removed)
    expect(rows.map((r) => r.name)).not.toContain('Dry')
  })

  it('counts eligible before the cut and before removals', () => {
    const removed = new Set([geoKey(2, -121.9)])
    const cut = { ...KNOBS, limit: 1, constraints: { ...NO_CONSTRAINTS, maxPrecipTotalIn: 0.5 } }
    expect(presentResults(universe, cut, removed).eligible).toBe(3)
  })


  describe('forecast bounds', () => {
    const bounded = (over: Partial<Constraints>) => ({
      ...KNOBS,
      constraints: { ...NO_CONSTRAINTS, ...over },
    })

    it('narrows the field live, with no second Analyze', () => {
      const { rows } = presentResults(universe, bounded({ maxPrecipTotalIn: 0.4 }), NONE)
      expect(rows.map((r) => r.name)).toEqual(['Dry', 'Untagged'])
    })

    it('runs before the limit cut, so the cut is of the matching field', () => {
      // Filtering after the cut would answer with one row: the two driest are
      // 'Dry' (0.1) and 'Untagged' (0.3), and the bound then rejects 'Dry'.
      // "The two driest with at least 0.3 in" has to answer with two.
      const knobs = { ...bounded({ minPrecipTotalIn: 0.3 }), limit: 2 }
      const { rows } = presentResults(universe, knobs, NONE)
      expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Mid'])
    })

    it('reports the kept and the rejected counts separately', () => {
      // The field holds four; the bound rejects Wet and Mid, and `excluded`
      // says so rather than folding them into `eligible`.
      const { rows, eligible, excluded } = presentResults(
        universe,
        bounded({ maxPrecipTotalIn: 0.4 }),
        NONE,
      )
      expect(rows.map((r) => r.name)).toEqual(['Dry', 'Untagged'])
      expect(eligible).toBe(2)
      expect(excluded).toBe(2)
    })

    it('counts nothing excluded when nothing is bounded', () => {
      const { eligible, excluded } = presentResults(universe, KNOBS, NONE)
      expect(eligible).toBe(4)
      expect(excluded).toBe(0)
    })

    it('can empty the table while the field behind it is untouched', () => {
      // The state the empty-state copy exists for: destinations were analyzed,
      // and the bounds admitted none of them.
      const { rows, eligible, excluded } = presentResults(universe, bounded({ maxPrecipTotalIn: 0 }),
        NONE,
      )
      expect(rows).toEqual([])
      expect(eligible).toBe(0)
      expect(excluded).toBe(4)
    })

    it('excludes before removals, so the two counts stay independent', () => {
      const removed = new Set([geoKey(2, -121.9)]) // 'Dry'
      const { rows, eligible, excluded } = presentResults(universe, bounded({ maxPrecipTotalIn: 0.4 }),
        removed,
      )
      expect(rows.map((r) => r.name)).toEqual(['Untagged'])
      // Still 2 of 4: a row the user struck out was still one the bounds
      // admitted, exactly as `eligible` has always ignored removals.
      expect(eligible).toBe(2)
      expect(excluded).toBe(2)
    })
  })

  it('is empty before the first analysis', () => {
    // A null universe now means only "nothing committed yet": #240 removed
    // the server SSE fallback, the one path that displayed rows it did not
    // hold.
    expect(presentResults(null, KNOBS, NONE)).toEqual({
      rows: [],
      eligible: 0,
      excluded: 0,
    })
  })

  it('does not mutate the held field', () => {
    const before = universe.map((r) => r.name)
    presentResults(universe, { ...KNOBS, sortDesc: true }, NONE)
    expect(universe.map((r) => r.name)).toEqual(before)
  })
})

describe('fieldHasValue', () => {
  // The case it exists for: five of the eight models publish no freezing
  // level, so a report can rank by it with every row empty. The map's colour
  // key is then bands over a field with no colours in it.
  it('is false when every displayed row is empty for the ranked key', () => {
    const rows = [row('A'), row('B')]
    expect(fieldHasValue(rows, 'freeze_min_ft')).toBe(false)
  })

  it('is true as soon as one row carries a number', () => {
    const rows = [row('A'), row('B', { freeze_min_ft: 9000 })]
    expect(fieldHasValue(rows, 'freeze_min_ft')).toBe(true)
  })

  // Nothing metric-specific about it: a report emptied by a live bound has no
  // colours either, whatever it ranks on.
  it('is false for an empty table on any metric', () => {
    expect(fieldHasValue([], 'precip_total_in')).toBe(false)
    expect(fieldHasValue([row('A')], 'precip_total_in')).toBe(true)
  })

  // A zero is a number. Read as falsy it would hide the key on exactly the
  // report the app is built to find: a dry window.
  it('counts a zero as a value', () => {
    expect(fieldHasValue([row('A', { precip_total_in: 0 })], 'precip_total_in')).toBe(true)
  })
})
