import { describe, it, expect } from 'vitest'
import { canAnalyze, AnalyzeGate } from './analyzeGate'

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
