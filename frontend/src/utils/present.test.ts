import { describe, expect, it } from 'vitest'
import { DestinationResult } from '../types'
import { pinKey } from './customList'
import { Constraints, NO_CONSTRAINTS } from './clientAnalyze'
import {
  AnalyzedSnapshot,
  PresentationKnobs,
  bandNarrows,
  commitNeeded,
  presentResults,
} from './present'

// Rows differing only in the fields under test, so an assertion on names reads
// as an assertion on ordering and membership.
function row(
  name: string,
  over: Partial<DestinationResult> = {},
): DestinationResult {
  return {
    name,
    type: 'peak',
    latitude: 0,
    longitude: 0,
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

// Distinct coordinates, since removals are keyed by coordinate.
function at(name: string, lat: number, over: Partial<DestinationResult> = {}): DestinationResult {
  return row(name, { latitude: lat, longitude: -121.9, ...over })
}

const KNOBS: PresentationKnobs = {
  sortBy: 'precip_total_in',
  sortDesc: false,
  limit: 10,
  band: { min: null, max: null },
  constraints: NO_CONSTRAINTS,
}

// What an analysis records about itself. Band-gated by default because that is
// the polygon case, where a widen genuinely has rows nobody fetched.
const ANALYZED: AnalyzedSnapshot = { ...KNOBS, bandGated: true }

const NONE = new Set<string>()

// ── bandNarrows ────────────────────────────────────────────────────────────

describe('bandNarrows', () => {
  it('treats an identical band as a narrowing, so re-analysis is not demanded', () => {
    expect(bandNarrows({ min: 8000, max: 12000 }, { min: 8000, max: 12000 })).toBe(true)
  })

  it('accepts a strict subset on either edge', () => {
    expect(bandNarrows({ min: 8000, max: 12000 }, { min: 9000, max: 11000 })).toBe(true)
    expect(bandNarrows({ min: null, max: null }, { min: 9000, max: 11000 })).toBe(true)
  })

  it('rejects a lower floor or a higher ceiling — those rows were never fetched', () => {
    expect(bandNarrows({ min: 8000, max: null }, { min: 6000, max: null })).toBe(false)
    expect(bandNarrows({ min: null, max: 12000 }, { min: null, max: 14000 })).toBe(false)
  })

  it('rejects clearing an edge the analysis had, which is unbounding it', () => {
    expect(bandNarrows({ min: 8000, max: null }, { min: null, max: null })).toBe(false)
    expect(bandNarrows({ min: null, max: 12000 }, { min: null, max: null })).toBe(false)
  })

  it('accepts adding an edge the analysis lacked', () => {
    expect(bandNarrows({ min: null, max: null }, { min: 8000, max: null })).toBe(true)
  })
})

// ── commitNeeded ───────────────────────────────────────────────────────────

describe('commitNeeded', () => {
  it('is silent before the first analysis', () => {
    expect(commitNeeded(null, KNOBS, false, false, false)).toEqual([])
  })

  // A model change is a commit for a stronger reason than a window change: the
  // held field is not missing rows, every number in it came from a model the
  // panel no longer names.
  it('asks for an Analyze when the model changes', () => {
    expect(commitNeeded({ ...ANALYZED }, { ...KNOBS }, false, true, false)).toEqual(['model-changed'])
  })

  // A user who changed both is owed both sentences (TJ, 2026-08-22), model
  // first: a model change can clamp the window as a side effect, and leading
  // with the model keeps the clamp attributed to its cause.
  it('reports the model and the window together, model first', () => {
    expect(commitNeeded({ ...ANALYZED }, { ...KNOBS }, true, true, false)).toEqual([
      'model-changed',
      'window-changed',
    ])
  })

  it('still names the window when only the window moved', () => {
    expect(commitNeeded({ ...ANALYZED }, { ...KNOBS }, true, false, false)).toEqual(['window-changed'])
  })

  it('is silent for sort, direction and limit changes over a held field', () => {
    const analyzed = { ...ANALYZED }
    expect(commitNeeded(analyzed, { ...KNOBS, sortBy: 'wind_avg_mph' }, false, false, false)).toEqual([])
    expect(commitNeeded(analyzed, { ...KNOBS, sortDesc: true }, false, false, false)).toEqual([])
    expect(commitNeeded(analyzed, { ...KNOBS, limit: 50 }, false, false, false)).toEqual([])
  })

  it('is silent for a forecast bound over a held field', () => {
    // The asymmetry with the elevation band: a bound can only re-read rows the
    // browser already has, so loosening one is as live as tightening it.
    const analyzed = { ...ANALYZED }
    const loosened = { ...KNOBS, constraints: { ...NO_CONSTRAINTS, maxAqi: 200 } }
    expect(commitNeeded(analyzed, loosened, false, false, false)).toEqual([])
  })

  it('is silent for an AQI ranking, which the eager AQI fetch already covers', () => {
    expect(commitNeeded({ ...ANALYZED }, { ...KNOBS, sortBy: 'aqi_avg' }, false, false, false)).toEqual([])
  })

  it('asks for an Analyze when the elevation band widens', () => {
    const analyzed = { ...ANALYZED, band: { min: 8000, max: null } }
    expect(
      commitNeeded(analyzed, { ...analyzed, band: { min: 6000, max: null } }, false, false, false),
    ).toEqual(['elevation-widened'])
  })

  it('stays silent on a widened band the report was never gated by', () => {
    // A custom list is resolved coordinate by coordinate; the band never
    // touched it, so every row is still held and a widen is pure
    // re-presentation. Cueing here asked for an Analyze whose answer was
    // already on screen.
    const analyzed = { ...ANALYZED, bandGated: false, band: { min: 8000, max: null } }
    expect(
      commitNeeded(analyzed, { ...analyzed, band: { min: null, max: null } }, false, false, false),
    ).toEqual([])
  })

  it('stays silent when the band narrows', () => {
    const analyzed = { ...ANALYZED, band: { min: 8000, max: null } }
    expect(
      commitNeeded(analyzed, { ...analyzed, band: { min: 9000, max: null } }, false, false, false),
    ).toEqual([])
  })

  // The forecast window is a data knob, so this one is not a comparison of held
  // knobs at all: the caller decides, and the answer is always "commit". Worth a
  // cue since the calendar made changing days a click rather than two typed
  // datetimes (#166).
  it('asks for an Analyze when the forecast window is not the one behind the rows', () => {
    expect(commitNeeded({ ...ANALYZED }, { ...KNOBS }, true, false, false)).toEqual(['window-changed'])
  })

  it('reports the window and a widened band together, window first', () => {
    const analyzed = { ...ANALYZED, band: { min: 8000, max: null } }
    expect(
      commitNeeded(analyzed, { ...analyzed, band: { min: 6000, max: null } }, true, false, false),
    ).toEqual(['window-changed', 'elevation-widened'])
  })

  it('reports all three when all three went stale', () => {
    const analyzed = { ...ANALYZED, band: { min: 8000, max: null } }
    expect(
      commitNeeded(analyzed, { ...analyzed, band: { min: 6000, max: null } }, true, true, false),
    ).toEqual(['model-changed', 'window-changed', 'elevation-widened'])
  })

  it('says nothing about a window before the first analysis', () => {
    expect(commitNeeded(null, KNOBS, true, false, false)).toEqual([])
  })

  // The one info-severity cue: the held rows are still right, the added
  // destination is simply not analyzed yet. The caller's predicate is
  // `pendingDestinations` — the set behind the map's pending dots — so the
  // cue and the dots cannot disagree.
  it('asks for an Analyze when a destination was added since the analysis', () => {
    expect(commitNeeded({ ...ANALYZED }, { ...KNOBS }, false, false, true)).toEqual([
      'destination-added',
    ])
  })

  it('reports an added destination after the stale-report reasons', () => {
    expect(commitNeeded({ ...ANALYZED }, { ...KNOBS }, true, true, true)).toEqual([
      'model-changed',
      'window-changed',
      'destination-added',
    ])
  })

  it('says nothing about an added destination before the first analysis', () => {
    // Everything is pending before the first run; the map's neutral dots and
    // the un-forecasted rows already say so, and there is no report to be
    // out of date with.
    expect(commitNeeded(null, KNOBS, false, false, true)).toEqual([])
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

  it('filters a narrowed elevation band and keeps unknown elevations', () => {
    const { rows } = presentResults(universe, { ...KNOBS, band: { min: 8000, max: null } },
      NONE,
    )
    // Dry (7000 ft) drops; Untagged has no `ele` tag and must survive, matching
    // _filter_elevation — otherwise narrowing looks like peaks vanishing.
    expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Mid', 'Wet'])
  })

  it('applies both band edges', () => {
    const { rows } = presentResults(universe, { ...KNOBS, band: { min: 8000, max: 10000 } },
      NONE,
    )
    expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Wet'])
  })

  it('drops removed destinations and promotes the next row into the cut', () => {
    const removed = new Set([pinKey(2, -121.9)])
    const { rows } = presentResults(universe, { ...KNOBS, limit: 2 }, removed)
    // 'Dry' removed, so the cut is the next two rather than one row and a gap.
    expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Mid'])
  })

  it('never resurrects a removed destination when limit rises', () => {
    const removed = new Set([pinKey(2, -121.9)])
    const { rows } = presentResults(universe, { ...KNOBS, limit: 100 }, removed)
    expect(rows.map((r) => r.name)).not.toContain('Dry')
  })

  it('counts eligible before the cut and before removals', () => {
    const removed = new Set([pinKey(2, -121.9)])
    const narrowed = { ...KNOBS, limit: 1, band: { min: 8000, max: null } }
    expect(presentResults(universe, narrowed, removed).eligible).toBe(3)
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

    it('runs after the band, and reports each count separately', () => {
      const knobs = {
        ...bounded({ maxPrecipTotalIn: 0.4 }),
        band: { min: 8000, max: null },
      }
      // The band admits Wet, Mid and Untagged (unknown elevation passes); the
      // bound then rejects Wet and Mid.
      const { rows, eligible, excluded } = presentResults(universe, knobs, NONE)
      expect(rows.map((r) => r.name)).toEqual(['Untagged'])
      expect(eligible).toBe(1)
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
      const removed = new Set([pinKey(2, -121.9)]) // 'Dry'
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
