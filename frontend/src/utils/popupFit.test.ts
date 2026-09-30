import { describe, expect, it } from 'vitest'
import { figureOf, fitPan, placePopup, visibleArea, type Rect } from './popupFit'

// A phone's map above a collapsed sheet, with the button column at its top
// left; and a short desktop map, where a card can step sideways instead.
const PHONE: Rect = { left: 0, top: 0, right: 412, bottom: 640 }
const PHONE_COLUMN: Rect = { left: 0, top: 0, right: 196, bottom: 140 }
const SHORT_DESKTOP: Rect = { left: 0, top: 0, right: 1000, bottom: 400 }
const DESKTOP_COLUMN: Rect = { left: 0, top: 0, right: 196, bottom: 120 }
const CARD = { width: 280, height: 360 }
const SMALL_CARD = { width: 280, height: 200 }

describe('figureOf', () => {
  it('is the card, its tip and a square around the marker, on the side the anchor names', () => {
    expect(figureOf({ x: 200, y: 300 }, SMALL_CARD, 'top')).toEqual({ left: 60, right: 340, top: 292, bottom: 510 })
    expect(figureOf({ x: 200, y: 300 }, SMALL_CARD, 'bottom')).toEqual({ left: 60, right: 340, top: 90, bottom: 308 })
  })
})

describe('visibleArea', () => {
  it('counts what lies in the region and takes off what an obstacle covers there', () => {
    const rect: Rect = { left: 100, top: 100, right: 300, bottom: 200 }
    expect(visibleArea(rect, PHONE, [])).toBe(200 * 100)
    expect(visibleArea(rect, PHONE, [PHONE_COLUMN])).toBe(200 * 100 - 96 * 40)
    expect(visibleArea({ left: -50, top: -50, right: 50, bottom: 50 }, PHONE, [])).toBe(50 * 50)
  })
})

describe('fitPan', () => {
  it('moves nothing already in view', () => {
    expect(fitPan({ left: 100, top: 100, right: 300, bottom: 300 }, PHONE, [])).toEqual({ x: 0, y: 0 })
  })

  it('keeps the top and left edges when the figure cannot fit whole', () => {
    expect(fitPan({ left: 50, top: 50, right: 350, bottom: 900 }, PHONE, [])).toEqual({ x: 0, y: -42 })
  })

  it('steps sideways past the column where the map is wide enough', () => {
    const figure = figureOf({ x: 300, y: 200 }, CARD, 'top')
    expect(fitPan(figure, SHORT_DESKTOP, [DESKTOP_COLUMN])).toEqual({ x: 44, y: -178 })
  })
})

describe('placePopup', () => {
  it('hangs the card below a marker in the middle of a tall map and moves nothing', () => {
    const tall: Rect = { left: 0, top: 0, right: 400, bottom: 600 }
    expect(placePopup({ x: 200, y: 300 }, SMALL_CARD, tall)).toEqual({ anchor: 'top', dx: 0, dy: 0 })
  })

  it('stands the card above a marker near the bottom rather than moving the map', () => {
    const tall: Rect = { left: 0, top: 0, right: 400, bottom: 600 }
    expect(placePopup({ x: 200, y: 580 }, SMALL_CARD, tall)).toEqual({ anchor: 'bottom', dx: 0, dy: 0 })
  })

  it('puts the title first when the card is taller than the map', () => {
    const short: Rect = { left: 0, top: 0, right: 400, bottom: 300 }
    const placed = placePopup({ x: 200, y: 150 }, CARD, short)
    expect(placed).toEqual({ anchor: 'top', dx: 0, dy: -134 })
    // The marker lands at the margin's edge and the card runs on under the sheet.
    expect(figureOf({ x: 200, y: 150 + placed.dy }, CARD, placed.anchor).top).toBe(8)
  })

  it('drops the card under the column on a phone, where it cannot step past it', () => {
    expect(placePopup({ x: 206, y: 100 }, CARD, PHONE, [PHONE_COLUMN])).toEqual({ anchor: 'top', dx: 0, dy: 56 })
    expect(placePopup({ x: 206, y: 320 }, CARD, PHONE, [PHONE_COLUMN])).toEqual({ anchor: 'top', dx: 0, dy: -58 })
  })

  it('steps the card sideways past the column on a desktop', () => {
    expect(placePopup({ x: 300, y: 200 }, CARD, SHORT_DESKTOP, [DESKTOP_COLUMN])).toEqual({
      anchor: 'top',
      dx: 44,
      dy: -178,
    })
  })
})
