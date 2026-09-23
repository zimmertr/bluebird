import { describe, it, expect } from 'vitest'
import { analyzeBlockers, canAnalyze, shouldAutoAnalyze, AnalyzeGate, AutoAnalyzeState } from './analyzeGate'

// A fully-ready polygon analysis: three points drawn, no vetoes.
const READY_POLYGON: AnalyzeGate = {
  hasWindowWarning: false,
  datesPending: false,
  loading: false,
  areaTooLarge: false,
  polygonReady: true,
  hasCustom: false,
  hasPins: false,
  compareAqi: false,
  compareFreeze: false,
  compareSnow: false,
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
  // combination of the nine flags plus a representative point count each.
  it('is non-empty exactly when canAnalyze is false', () => {
    for (let bits = 0; bits < 512; bits++) {
      for (const drawPointCount of [0, 2, 3]) {
        const gate: AnalyzeGate = {
          loading: false,
          hasWindowWarning: (bits & 1) !== 0,
          areaTooLarge: (bits & 2) !== 0,
          polygonReady: (bits & 4) !== 0,
          hasCustom: (bits & 8) !== 0,
          hasPins: (bits & 16) !== 0,
          datesPending: (bits & 32) !== 0,
          compareAqi: (bits & 64) !== 0,
          compareFreeze: (bits & 128) !== 0,
          compareSnow: (bits & 256) !== 0,
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
    datesPending: false,
    compareAqi: false,
    compareFreeze: false,
    compareSnow: false,
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

// Two settings the reader has already made can contradict each other, and the
// report they would buy cannot answer the question the panel is asking. Both
// veto Analyze rather than explaining themselves after the spend (TJ,
// 2026-09-14).
describe('a model selection the ranking cannot use', () => {
  it('blocks a ready analysis ranked on air quality with models compared', () => {
    const gate = { ...READY_POLYGON, compareAqi: true }
    expect(canAnalyze(gate)).toBe(false)
    expect(analyzeBlockers({ ...gate, drawPointCount: 4 })).toEqual(['compare-aqi'])
  })

  it('blocks a ranking on freezing level when a picked model has none', () => {
    const gate = { ...READY_POLYGON, compareFreeze: true }
    expect(canAnalyze(gate)).toBe(false)
    expect(analyzeBlockers({ ...gate, drawPointCount: 4 })).toEqual(['compare-freeze'])
  })

  // Snow depth comes off the pod's own snow analysis rather than any forecast
  // model, so a comparison there is the air-quality case exactly (#449).
  it('blocks a ranking on snow depth with models compared', () => {
    const gate = { ...READY_POLYGON, compareSnow: true }
    expect(canAnalyze(gate)).toBe(false)
    expect(analyzeBlockers({ ...gate, drawPointCount: 4 })).toEqual(['compare-snow'])
  })

  it('lets a snow ranking through with one model selected', () => {
    expect(canAnalyze({ ...READY_POLYGON, compareSnow: false })).toBe(true)
    expect(analyzeBlockers({ ...READY_POLYGON, compareSnow: false, drawPointCount: 4 })).toEqual([])
  })

  // The vetoes are about work already done, so they lead the missing-input
  // lines and follow the window's own problems.
  it('reports every contradiction and keeps them in order', () => {
    expect(
      analyzeBlockers({
        ...READY_POLYGON,
        drawPointCount: 4,
        datesPending: true,
        compareAqi: true,
        compareFreeze: true,
        compareSnow: true,
      }),
    ).toEqual(['dates', 'compare-aqi', 'compare-freeze', 'compare-snow'])
  })

  // An input the reader has yet to give is still worth saying beside them.
  it('says the analysis has no destination as well', () => {
    expect(
      analyzeBlockers({
        ...READY_POLYGON,
        polygonReady: false,
        drawPointCount: 0,
        compareFreeze: true,
      }),
    ).toEqual(['compare-freeze', 'destinations'])
  })
})

// A link's run on open (#511): the same gate a click reads, after the live
// limits, and once.
describe('shouldAutoAnalyze', () => {
  const READY: AutoAnalyzeState = {
    requested: true,
    capabilitiesSettled: true,
    gateOpen: true,
    fired: false,
  }

  it('runs when the link asked, capabilities settled and the gate is open', () => {
    expect(shouldAutoAnalyze(READY)).toBe(true)
  })

  it('does not run before capabilities settle', () => {
    expect(shouldAutoAnalyze({ ...READY, capabilitiesSettled: false })).toBe(false)
  })

  it('does not run while the gate is closed', () => {
    expect(shouldAutoAnalyze({ ...READY, gateOpen: false })).toBe(false)
    // The gate it reads is the button's, so an incomplete input closes it.
    const gateOpen = canAnalyze({ ...READY_POLYGON, polygonReady: false })
    expect(shouldAutoAnalyze({ ...READY, gateOpen })).toBe(false)
  })

  it('does not run for a link that did not ask', () => {
    expect(shouldAutoAnalyze({ ...READY, requested: false })).toBe(false)
  })

  it('does not run a second time', () => {
    expect(shouldAutoAnalyze({ ...READY, fired: true })).toBe(false)
  })

  // The panel's effect, driven through a page load: capabilities land, the gate
  // opens, the run closes it (loading) and the end reopens it. Only the first
  // opening after settling may fire.
  it('fires exactly once across a load', () => {
    const steps: Array<Pick<AutoAnalyzeState, 'capabilitiesSettled' | 'gateOpen'>> = [
      { capabilitiesSettled: false, gateOpen: false },
      { capabilitiesSettled: false, gateOpen: true },
      { capabilitiesSettled: true, gateOpen: true },
      { capabilitiesSettled: true, gateOpen: false },
      { capabilitiesSettled: true, gateOpen: true },
      { capabilitiesSettled: true, gateOpen: true },
    ]
    let fired = false
    const firedAt: number[] = []
    steps.forEach((step, i) => {
      if (shouldAutoAnalyze({ requested: true, fired, ...step })) {
        fired = true
        firedAt.push(i)
      }
    })
    expect(firedAt).toEqual([2])
  })

  it('never fires across a load whose gate stays closed', () => {
    let fired = false
    for (const capabilitiesSettled of [false, true, true]) {
      if (shouldAutoAnalyze({ requested: true, fired, capabilitiesSettled, gateOpen: false })) {
        fired = true
      }
    }
    expect(fired).toBe(false)
  })
})
