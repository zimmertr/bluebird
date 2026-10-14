import { describe, expect, it } from 'vitest'
import {
  FLICK_WINDOW_MS,
  SHEET_FLICK_PX_PER_MS,
  SHEET_SNAP_PX,
  releaseVelocity,
  sheetDragPx,
  sheetRelease,
} from './sheetDrag'

// A phone sheet under a finger (#696; record 0146): a menu of rows 300px tall
// on a screen whose sheets rise to 740.
const STOPS = { restPx: 300, fullPx: 740 }

describe('sheetDragPx', () => {
  it('follows the finger between closed and full', () => {
    expect(sheetDragPx(300, 120, 740)).toBe(420)
    expect(sheetDragPx(300, -120, 740)).toBe(180)
  })

  it('stops under the chip row and at the screen\'s foot', () => {
    expect(sheetDragPx(300, 900, 740)).toBe(740)
    expect(sheetDragPx(300, -900, 740)).toBe(0)
  })
})

describe('sheetRelease', () => {
  it('holds a sheet let go between the stops where it was let go', () => {
    expect(sheetRelease(500, 0, STOPS)).toEqual({ kind: 'hold', px: 500 })
    expect(sheetRelease(150, 0, STOPS)).toEqual({ kind: 'hold', px: 150 })
  })

  it('takes a release near a stop to that stop', () => {
    expect(sheetRelease(300 + SHEET_SNAP_PX, 0, STOPS)).toEqual({ kind: 'rest' })
    expect(sheetRelease(300 - 20, 0, STOPS)).toEqual({ kind: 'rest' })
    expect(sheetRelease(740 - 30, 0, STOPS)).toEqual({ kind: 'hold', px: 740 })
    expect(sheetRelease(SHEET_SNAP_PX, 0, STOPS)).toEqual({ kind: 'close' })
    expect(sheetRelease(SHEET_SNAP_PX + 1, 0, STOPS)).toEqual({ kind: 'hold', px: SHEET_SNAP_PX + 1 })
  })

  it('closes on a flick down and raises the sheet whole on a flick up, wherever it was let go', () => {
    expect(sheetRelease(700, -SHEET_FLICK_PX_PER_MS, STOPS)).toEqual({ kind: 'close' })
    expect(sheetRelease(60, SHEET_FLICK_PX_PER_MS, STOPS)).toEqual({ kind: 'hold', px: 740 })
    expect(sheetRelease(500, SHEET_FLICK_PX_PER_MS / 2, STOPS)).toEqual({ kind: 'hold', px: 500 })
  })

  // A long list is already as tall as a sheet may be: its own height and full
  // are one stop, and a release there leaves it to its own height.
  it('treats full as the sheet\'s own height when its rows fill it', () => {
    expect(sheetRelease(730, 0, { restPx: 900, fullPx: 740 })).toEqual({ kind: 'rest' })
  })
})

describe('releaseVelocity', () => {
  it('reads the speed over the last tenth of a second', () => {
    const samples = [
      { at: 0, upPx: 0 },
      { at: 900, upPx: -10 },
      { at: 950, upPx: -40 },
    ]
    expect(releaseVelocity(samples, { at: 1000, upPx: -70 })).toBeCloseTo(-60 / 100)
  })

  it('reads a finger that stopped before letting go as still', () => {
    expect(releaseVelocity([{ at: 0, upPx: -200 }], { at: FLICK_WINDOW_MS + 50, upPx: -200 })).toBe(0)
  })
})
