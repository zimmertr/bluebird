import { describe, expect, it } from 'vitest'
import { AnalyzeResponse, DestinationResult } from '../types'
import { pinKey } from './customList'
import { Constraints, NO_CONSTRAINTS } from './clientAnalyze'
import { PresentationKnobs, bandNarrows, commitNeeded, presentResults } from './present'

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
    precip_max_in_hr: 0,
    temp_min_f: 0,
    temp_max_f: 0,
    temp_avg_f: 0,
    wind_min_mph: 0,
    wind_max_mph: 0,
    wind_avg_mph: 0,
    aqi_avg: null,
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

const NONE = new Set<string>()

function response(
  results: DestinationResult[],
  totalQueried: number,
  totalMatched: number = totalQueried,
): AnalyzeResponse {
  return { results, total_queried: totalQueried, total_matched: totalMatched }
}

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
    expect(commitNeeded(null, KNOBS, true, false, false)).toBeNull()
  })

  // A model change is a commit for a stronger reason than a window change: the
  // held field is not missing rows, every number in it came from a model the
  // panel no longer names.
  it('asks for an Analyze when the model changes', () => {
    expect(commitNeeded({ ...KNOBS }, { ...KNOBS }, true, false, true)).toBe('model-changed')
  })

  // Changing the model can clamp the window as a side effect, so both flags
  // arrive together. Reporting the window would name the consequence and leave
  // the cause unsaid.
  it('names the model rather than the window it clamped', () => {
    expect(commitNeeded({ ...KNOBS }, { ...KNOBS }, true, true, true)).toBe('model-changed')
  })

  it('still names the window when only the window moved', () => {
    expect(commitNeeded({ ...KNOBS }, { ...KNOBS }, true, true, false)).toBe('window-changed')
  })

  it('is silent for sort, direction and limit changes over a held field', () => {
    const analyzed = { ...KNOBS }
    expect(commitNeeded(analyzed, { ...KNOBS, sortBy: 'wind_avg_mph' }, true, false, false)).toBeNull()
    expect(commitNeeded(analyzed, { ...KNOBS, sortDesc: true }, true, false, false)).toBeNull()
    expect(commitNeeded(analyzed, { ...KNOBS, limit: 50 }, true, false, false)).toBeNull()
  })

  it('is silent for a forecast bound over a held field', () => {
    // The asymmetry with the elevation band: a bound can only re-read rows the
    // browser already has, so loosening one is as live as tightening it.
    const analyzed = { ...KNOBS }
    const loosened = { ...KNOBS, constraints: { ...NO_CONSTRAINTS, maxAqi: 200 } }
    expect(commitNeeded(analyzed, loosened, true, false, false)).toBeNull()
  })

  it('commits a forecast bound on the server path, where there is no field', () => {
    const analyzed = { ...KNOBS }
    const bounded = { ...KNOBS, constraints: { ...NO_CONSTRAINTS, maxAqi: 100 } }
    expect(commitNeeded(analyzed, bounded, false, false, false)).toBe('server-path')
    // ...and stays silent when the bounds are the ones behind the rows.
    expect(commitNeeded(analyzed, { ...KNOBS }, false, false, false)).toBeNull()
  })

  it('is silent for an AQI ranking, which the eager AQI fetch already covers', () => {
    expect(commitNeeded({ ...KNOBS }, { ...KNOBS, sortBy: 'aqi_avg' }, true, false, false)).toBeNull()
  })

  it('asks for an Analyze when the elevation band widens', () => {
    const analyzed = { ...KNOBS, band: { min: 8000, max: null } }
    expect(commitNeeded(analyzed, { ...analyzed, band: { min: 6000, max: null } }, true, false, false)).toBe(
      'elevation-widened',
    )
  })

  it('stays silent when the band narrows', () => {
    const analyzed = { ...KNOBS, band: { min: 8000, max: null } }
    expect(commitNeeded(analyzed, { ...analyzed, band: { min: 9000, max: null } }, true, false, false)).toBeNull()
  })

  it('asks for an Analyze on any knob when no field is held', () => {
    const analyzed = { ...KNOBS }
    expect(commitNeeded(analyzed, { ...KNOBS, sortBy: 'wind_avg_mph' }, false, false, false)).toBe('server-path')
    expect(commitNeeded(analyzed, { ...KNOBS, limit: 50 }, false, false, false)).toBe('server-path')
    expect(commitNeeded(analyzed, { ...KNOBS, band: { min: 9000, max: null } }, false, false, false)).toBe(
      'server-path',
    )
  })

  it('stays silent with no field held while the knobs still match the report', () => {
    expect(commitNeeded({ ...KNOBS }, { ...KNOBS }, false, false, false)).toBeNull()
  })

  // The forecast window is a data knob, so this one is not a comparison of held
  // knobs at all: the caller decides, and the answer is always "commit". Worth a
  // cue since the calendar made changing days a click rather than two typed
  // datetimes (#166).
  it('asks for an Analyze when the forecast window is not the one behind the rows', () => {
    expect(commitNeeded({ ...KNOBS }, { ...KNOBS }, true, true, false)).toBe('window-changed')
  })

  // Named ahead of the other two: it is the knob the user just touched, which is
  // the more useful sentence even when something else also went stale.
  it('names the window over a widened band or the server path', () => {
    const analyzed = { ...KNOBS, band: { min: 8000, max: null } }
    expect(
      commitNeeded(analyzed, { ...analyzed, band: { min: 6000, max: null } }, true, true, false),
    ).toBe('window-changed')
    expect(commitNeeded(analyzed, { ...KNOBS, limit: 50 }, false, true, false)).toBe('window-changed')
  })

  it('says nothing about a window before the first analysis', () => {
    expect(commitNeeded(null, KNOBS, true, true, false)).toBeNull()
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
    const { rows } = presentResults(universe, null, KNOBS, NONE)
    expect(rows.map((r) => r.name)).toEqual(['Dry', 'Untagged', 'Mid', 'Wet'])
  })

  it('re-ranks by a different metric without refetching anything', () => {
    const { rows } = presentResults(universe, null, { ...KNOBS, sortBy: 'temp_avg_f' }, NONE)
    // All temps are equal here, so this asserts the comparator was applied at
    // all (stable order) rather than the precip ranking leaking through.
    expect(rows.map((r) => r.name)).toEqual(['Wet', 'Dry', 'Mid', 'Untagged'])
  })

  it('honors sortDesc', () => {
    const { rows } = presentResults(universe, null, { ...KNOBS, sortDesc: true }, NONE)
    expect(rows.map((r) => r.name)).toEqual(['Wet', 'Mid', 'Untagged', 'Dry'])
  })

  it('cuts to limit after ranking, so the cut is of the whole field', () => {
    const { rows } = presentResults(universe, null, { ...KNOBS, limit: 2 }, NONE)
    expect(rows.map((r) => r.name)).toEqual(['Dry', 'Untagged'])
  })

  it('filters a narrowed elevation band and keeps unknown elevations', () => {
    const { rows } = presentResults(
      universe,
      null,
      { ...KNOBS, band: { min: 8000, max: null } },
      NONE,
    )
    // Dry (7000 ft) drops; Untagged has no `ele` tag and must survive, matching
    // _filter_elevation — otherwise narrowing looks like peaks vanishing.
    expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Mid', 'Wet'])
  })

  it('applies both band edges', () => {
    const { rows } = presentResults(
      universe,
      null,
      { ...KNOBS, band: { min: 8000, max: 10000 } },
      NONE,
    )
    expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Wet'])
  })

  it('drops removed destinations and promotes the next row into the cut', () => {
    const removed = new Set([pinKey(2, -121.9)])
    const { rows } = presentResults(universe, null, { ...KNOBS, limit: 2 }, removed)
    // 'Dry' removed, so the cut is the next two rather than one row and a gap.
    expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Mid'])
  })

  it('never resurrects a removed destination when limit rises', () => {
    const removed = new Set([pinKey(2, -121.9)])
    const { rows } = presentResults(universe, null, { ...KNOBS, limit: 100 }, removed)
    expect(rows.map((r) => r.name)).not.toContain('Dry')
  })

  it('counts eligible before the cut and before removals', () => {
    const removed = new Set([pinKey(2, -121.9)])
    const narrowed = { ...KNOBS, limit: 1, band: { min: 8000, max: null } }
    expect(presentResults(universe, null, narrowed, removed).eligible).toBe(3)
  })


  describe('forecast bounds', () => {
    const bounded = (over: Partial<Constraints>) => ({
      ...KNOBS,
      constraints: { ...NO_CONSTRAINTS, ...over },
    })

    it('narrows the field live, with no second Analyze', () => {
      const { rows } = presentResults(universe, null, bounded({ maxPrecipTotalIn: 0.4 }), NONE)
      expect(rows.map((r) => r.name)).toEqual(['Dry', 'Untagged'])
    })

    it('runs before the limit cut, so the cut is of the matching field', () => {
      // Filtering after the cut would answer with one row: the two driest are
      // 'Dry' (0.1) and 'Untagged' (0.3), and the bound then rejects 'Dry'.
      // "The two driest with at least 0.3 in" has to answer with two.
      const knobs = { ...bounded({ minPrecipTotalIn: 0.3 }), limit: 2 }
      const { rows } = presentResults(universe, null, knobs, NONE)
      expect(rows.map((r) => r.name)).toEqual(['Untagged', 'Mid'])
    })

    it('runs after the band, and reports each count separately', () => {
      const knobs = {
        ...bounded({ maxPrecipTotalIn: 0.4 }),
        band: { min: 8000, max: null },
      }
      // The band admits Wet, Mid and Untagged (unknown elevation passes); the
      // bound then rejects Wet and Mid.
      const { rows, eligible, excluded } = presentResults(universe, null, knobs, NONE)
      expect(rows.map((r) => r.name)).toEqual(['Untagged'])
      expect(eligible).toBe(1)
      expect(excluded).toBe(2)
    })

    it('counts nothing excluded when nothing is bounded', () => {
      const { eligible, excluded } = presentResults(universe, null, KNOBS, NONE)
      expect(eligible).toBe(4)
      expect(excluded).toBe(0)
    })

    it('can empty the table while the field behind it is untouched', () => {
      // The state the empty-state copy exists for: destinations were analyzed,
      // and the bounds admitted none of them.
      const { rows, eligible, excluded } = presentResults(
        universe,
        null,
        bounded({ maxPrecipTotalIn: 0 }),
        NONE,
      )
      expect(rows).toEqual([])
      expect(eligible).toBe(0)
      expect(excluded).toBe(4)
    })

    it('excludes before removals, so the two counts stay independent', () => {
      const removed = new Set([pinKey(2, -121.9)]) // 'Dry'
      const { rows, eligible, excluded } = presentResults(
        universe,
        null,
        bounded({ maxPrecipTotalIn: 0.4 }),
        removed,
      )
      expect(rows.map((r) => r.name)).toEqual(['Untagged'])
      // Still 2 of 4: a row the user struck out was still one the bounds
      // admitted, exactly as `eligible` has always ignored removals.
      expect(eligible).toBe(2)
      expect(excluded).toBe(2)
    })
  })

  describe('with no held field (the server SSE path)', () => {
    // Deliberately in an order no ranking would produce, to prove nothing here
    // re-sorts them: the server already ranked and cut, and re-sorting its rows
    // is the approximation #187 removed.
    const trimmed = [at('B', 1, { precip_total_in: 0.9 }), at('A', 2, { precip_total_in: 0.1 })]

    it('passes the server rows through untouched', () => {
      const { rows } = presentResults(null, response(trimmed, 851), KNOBS, NONE)
      expect(rows.map((r) => r.name)).toEqual(['B', 'A'])
    })

    it('ignores sort and limit, which cannot apply without the field', () => {
      const knobs = { ...KNOBS, sortDesc: true, limit: 1, band: { min: 9999, max: null } }
      const { rows } = presentResults(null, response(trimmed, 851), knobs, NONE)
      expect(rows.map((r) => r.name)).toEqual(['B', 'A'])
    })

    it('still applies removals', () => {
      const removed = new Set([pinKey(1, -121.9)])
      const { rows } = presentResults(null, response(trimmed, 851), KNOBS, removed)
      expect(rows.map((r) => r.name)).toEqual(['A'])
    })

    it('takes the eligible count off the wire, not from the two rows it holds', () => {
      expect(presentResults(null, response(trimmed, 851), KNOBS, NONE).eligible).toBe(851)
    })

    it('reads the matched count off the wire, since the field never arrives', () => {
      const { eligible, excluded } = presentResults(null, response(trimmed, 851, 40), KNOBS, NONE)
      expect(eligible).toBe(40)
      expect(excluded).toBe(811)
    })

    it('survives having no response at all', () => {
      expect(presentResults(null, null, KNOBS, NONE)).toEqual({
        rows: [],
        eligible: 0,
        excluded: 0,
      })
    })
  })

  it('does not mutate the held field', () => {
    const before = universe.map((r) => r.name)
    presentResults(universe, null, { ...KNOBS, sortDesc: true }, NONE)
    expect(universe.map((r) => r.name)).toEqual(before)
  })
})
