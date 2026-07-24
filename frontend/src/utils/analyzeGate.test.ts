import { describe, it, expect } from 'vitest'
import { canAnalyze, AnalyzeGate } from './analyzeGate'

// A fully-ready polygon analysis: dates set, three points drawn, no vetoes.
const READY_POLYGON: AnalyzeGate = {
  hasDates: true,
  hasWindowWarning: false,
  loading: false,
  areaTooLarge: false,
  needsPolygon: true,
  polygonReady: true,
  hasCustom: false,
  hasPins: false,
}

describe('canAnalyze — ranked inputs', () => {
  it('enables when a complete polygon is drawn', () => {
    expect(canAnalyze(READY_POLYGON)).toBe(true)
  })

  it('blocks an incomplete polygon with no pins', () => {
    expect(canAnalyze({ ...READY_POLYGON, polygonReady: false })).toBe(false)
  })

  it('enables the custom-CSV path (no polygon needed)', () => {
    expect(
      canAnalyze({
        ...READY_POLYGON,
        needsPolygon: false,
        polygonReady: false,
        hasCustom: true,
      }),
    ).toBe(true)
  })

  it('blocks custom mode with an empty/invalid CSV and no pins', () => {
    expect(
      canAnalyze({
        ...READY_POLYGON,
        needsPolygon: false,
        polygonReady: false,
        hasCustom: false,
      }),
    ).toBe(false)
  })
})

describe('canAnalyze — pins-only path', () => {
  // No polygon, no CSV — just a searched pin in the table. Analyze becomes
  // "refetch the pinned forecasts for the current window".
  const PINS_ONLY: AnalyzeGate = {
    ...READY_POLYGON,
    polygonReady: false,
    hasPins: true,
  }

  it('enables Analyze with pins alone once dates are set', () => {
    expect(canAnalyze(PINS_ONLY)).toBe(true)
  })

  it('still requires a forecast window', () => {
    expect(canAnalyze({ ...PINS_ONLY, hasDates: false })).toBe(false)
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
    // needsPolygon + polygonReady:false would block on its own; the pin lifts it.
    expect(canAnalyze({ ...PINS_ONLY, needsPolygon: true, polygonReady: false })).toBe(true)
  })
})
