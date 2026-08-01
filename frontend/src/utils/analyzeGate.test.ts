import { describe, it, expect } from 'vitest'
import { analyzeBlockers, canAnalyze, AnalyzeGate } from './analyzeGate'

// A fully-ready polygon analysis: three points drawn, no vetoes. There is no
// "dates set" field to fill in — the calendar always holds a window (#166).
const READY_POLYGON: AnalyzeGate = {
  hasWindowWarning: false,
  loading: false,
  areaTooLarge: false,
  polygonReady: true,
  hasCustom: false,
  hasPins: false,
}

describe('canAnalyze — ranked inputs', () => {
  it('enables when a complete polygon is drawn', () => {
    expect(canAnalyze(READY_POLYGON)).toBe(true)
  })

  it('blocks an incomplete polygon with no CSV and no pins', () => {
    expect(canAnalyze({ ...READY_POLYGON, polygonReady: false })).toBe(false)
  })

  it('enables with a CSV alone — a polygon is not required', () => {
    expect(
      canAnalyze({ ...READY_POLYGON, polygonReady: false, hasCustom: true }),
    ).toBe(true)
  })

  it('enables with a polygon and a CSV together (the union)', () => {
    expect(canAnalyze({ ...READY_POLYGON, hasCustom: true })).toBe(true)
  })

  it('blocks when no polygon, CSV, or pin is provided', () => {
    expect(
      canAnalyze({ ...READY_POLYGON, polygonReady: false, hasCustom: false }),
    ).toBe(false)
  })
})

describe('canAnalyze — pins-only path', () => {
  // No polygon, no CSV — just a searched pin in the table. Analyze becomes
  // "refetch the pinned forecasts for the selected window".
  const PINS_ONLY: AnalyzeGate = {
    ...READY_POLYGON,
    polygonReady: false,
    hasPins: true,
  }

  it('enables Analyze with pins alone', () => {
    expect(canAnalyze(PINS_ONLY)).toBe(true)
  })

  it('pins do not override a window warning', () => {
    expect(canAnalyze({ ...PINS_ONLY, hasWindowWarning: true })).toBe(false)
  })

  it('pins do not override an oversized polygon', () => {
    expect(canAnalyze({ ...PINS_ONLY, areaTooLarge: true })).toBe(false)
  })

  it('stays disabled while a fetch is in flight', () => {
    expect(canAnalyze({ ...PINS_ONLY, loading: true })).toBe(false)
  })

  it('an incomplete polygon alongside a pin is ignored — pin still enables it', () => {
    // polygonReady:false would block on its own; the pin lifts it.
    expect(canAnalyze({ ...PINS_ONLY, polygonReady: false })).toBe(true)
  })
})

describe('analyzeBlockers', () => {
  // Nothing drawn, nothing pasted, nothing pinned: the panel's opening state.
  const EMPTY = { ...READY_POLYGON, polygonReady: false, drawPointCount: 0 }

  it('says nothing when Analyze is ready', () => {
    expect(analyzeBlockers({ ...READY_POLYGON, drawPointCount: 3 })).toEqual([])
  })

  it('names the missing input when there is none of any kind', () => {
    expect(analyzeBlockers(EMPTY)).toEqual(['destinations'])
  })

  // The reason this function replaced a ternary chain. Both were true at once
  // before; the panel showed the first, so fixing it revealed a second problem
  // that had been there the whole time.
  it('stacks an unservable window with a missing input', () => {
    expect(analyzeBlockers({ ...EMPTY, hasWindowWarning: true })).toEqual([
      'window',
      'destinations',
    ])
  })

  it('stacks an oversized polygon with an unservable window', () => {
    expect(
      analyzeBlockers({
        ...EMPTY,
        drawPointCount: 4,
        areaTooLarge: true,
        hasWindowWarning: true,
      }),
    ).toEqual(['area', 'window'])
  })

  // An unfinished polygon is its own instruction ("one more point"), so the
  // general "provide a destination" line would be naming the same gap twice.
  it('asks for the rest of a polygon rather than for a destination', () => {
    expect(analyzeBlockers({ ...EMPTY, drawPointCount: 2 })).toEqual(['polygon'])
  })

  // The bug the two-state split exists to prevent: an oversized polygon has
  // three or more points and is still not ready, which under a plain
  // "!polygonReady" test produced "add 0 more points" beside the real reason.
  it('does not ask for more points on an oversized polygon', () => {
    expect(analyzeBlockers({ ...EMPTY, drawPointCount: 5, areaTooLarge: true })).toEqual([
      'area',
    ])
  })

  it('says nothing about a polygon once a pasted list or a pin stands in for one', () => {
    expect(analyzeBlockers({ ...EMPTY, hasCustom: true })).toEqual([])
    expect(analyzeBlockers({ ...EMPTY, hasPins: true })).toEqual([])
  })

  // Mid-analysis the button reads "Analyzing…", which is the whole
  // explanation; a list of reasons under it would be noise the reader cannot
  // act on.
  it('is silent while a fetch is in flight', () => {
    expect(analyzeBlockers({ ...EMPTY, loading: true, hasWindowWarning: true })).toEqual([])
  })

  // The two must agree, or the panel disables a button and gives no reason —
  // or gives a reason for a button that works. Exhaustive over every
  // combination of the six flags plus a representative point count each.
  it('is non-empty exactly when canAnalyze is false', () => {
    for (let bits = 0; bits < 32; bits++) {
      for (const drawPointCount of [0, 2, 3]) {
        const gate: AnalyzeGate = {
          loading: false,
          hasWindowWarning: (bits & 1) !== 0,
          areaTooLarge: (bits & 2) !== 0,
          polygonReady: (bits & 4) !== 0,
          hasCustom: (bits & 8) !== 0,
          hasPins: (bits & 16) !== 0,
        }
        const label = `${JSON.stringify(gate)} points=${drawPointCount}`

        expect(analyzeBlockers({ ...gate, drawPointCount }).length > 0, label).toBe(
          !canAnalyze(gate),
        )
      }
    }
  })
})

// Checkboxes made "what the polygon looks for" a set that can be empty, so a
// finished polygon is no longer proof of an input (#119 follow-on).
describe('a polygon with nothing checked', () => {
  const drawn = {
    hasWindowWarning: false,
    loading: false,
    areaTooLarge: false,
    polygonReady: false, // three points, but no types checked
    hasCustom: false,
    hasPins: false,
    drawPointCount: 4,
  }

  it('does not enable Analyze on its own', () => {
    expect(canAnalyze(drawn)).toBe(false)
  })

  it('says the polygon has nothing to look for, not that it is unfinished', () => {
    expect(analyzeBlockers(drawn)).toEqual(['types'])
  })

  it('stops being a blocker as soon as another input exists', () => {
    expect(analyzeBlockers({ ...drawn, hasCustom: true })).toEqual([])
    expect(analyzeBlockers({ ...drawn, hasPins: true })).toEqual([])
  })

  it('still reports an unfinished polygon as unfinished', () => {
    expect(analyzeBlockers({ ...drawn, drawPointCount: 2 })).toEqual(['polygon'])
  })
})
