import { describe, expect, it } from 'vitest'
import { MIN_CAPPED_PX, capHeight, figureOf, fitPan, fitsWhole, placePopup, visibleArea, type Rect } from './popupFit'

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

// The tutorial's marker step on a 360x740 phone, as measured in a browser on
// 2026-10-08 (#678): the map above the collapsed sheet, the button column, the
// demonstration's popup element (its height holds the 10px tip, which the
// figure adds again, so the figure runs 10px past the element), and the marker
// where the step's camera put it. The fit itself was right: handed the tour
// card's own box (16..344 x 578..724) it placed the popup clear of it, at
// 159..559.5. The card then left: `sheetEdge` sends it to the top once the
// popup's light (the element grown by the 6px spotlight pad, so 565.5) passes
// its band at 740 - 146 - 32 = 562, and at the top (16..162) it stood on the
// popup's title. The tour now hands the fit the room the card needs to keep
// its edge (`sheetKeepOut` in tour/place.ts: 562 less the pad, 556).
describe('the tutorial popup on a phone', () => {
  const REGION: Rect = { left: 0, top: 0, right: 360, bottom: 636 }
  const COLUMN: Rect = { left: 12, top: 12, right: 196, bottom: 128 }
  const CARD_BOX: Rect = { left: 16, right: 344, top: 578, bottom: 724 }
  const KEEP_OUT: Rect = { left: 16, right: 344, top: 556, bottom: 724 }
  const POPUP = { width: 280, height: 401 }
  const MARKER = { x: 180, y: 318 }
  const area = (r: Rect) => (r.right - r.left) * (r.bottom - r.top)
  // The element's bottom, which the light grows by the pad, is the figure's
  // bottom less the tip the figure counts again.
  const lightBottom = (placed: { anchor: 'top' | 'bottom'; dy: number }) =>
    figureOf({ x: MARKER.x, y: MARKER.y + placed.dy }, POPUP, placed.anchor).bottom - 10 + 6

  it('left the light inside the card\'s band when it was handed the card alone', () => {
    const placed = placePopup(MARKER, POPUP, REGION, [COLUMN, CARD_BOX])
    expect(placed).toEqual({ anchor: 'top', dx: 0, dy: -159 })
    // 566 on the measured 401px; the browser drew the element 400.5px tall.
    expect(lightBottom(placed)).toBe(566)
    expect(lightBottom(placed)).toBeGreaterThan(562)
  })

  it('stands between the column and the card\'s keep-out, with its light above the band', () => {
    const placed = placePopup(MARKER, POPUP, REGION, [COLUMN, KEEP_OUT])
    const figure = figureOf({ x: MARKER.x, y: MARKER.y + placed.dy }, POPUP, placed.anchor)
    expect(visibleArea(figure, REGION, [COLUMN, KEEP_OUT])).toBe(area(figure))
    expect(figure.top).toBeGreaterThanOrEqual(COLUMN.bottom)
    expect(lightBottom(placed)).toBeLessThanOrEqual(562)
  })
})

// A card too tall for the free map area caps its body and scrolls (TJ,
// 2026-10-08). The tutorial's phone is the case that needed it: with the cloud
// deck on every report the card measured 451px, 50 more than the 401 the
// layout above was measured with, and no placement kept it clear of both the
// column and the tour card's keep-out.
describe('capHeight', () => {
  const REGION: Rect = { left: 0, top: 0, right: 360, bottom: 636 }
  const COLUMN: Rect = { left: 12, top: 12, right: 196, bottom: 128 }
  const KEEP_OUT: Rect = { left: 16, right: 344, top: 556, bottom: 724 }
  const MARKER = { x: 180, y: 318 }
  const TALL = { width: 280, height: 451 }

  it('caps nothing that already stands whole', () => {
    expect(capHeight(MARKER, { width: 280, height: 401 }, REGION, [COLUMN, KEEP_OUT])).toBeNull()
    expect(capHeight({ x: 300, y: 200 }, CARD, SHORT_DESKTOP, [DESKTOP_COLUMN])).toBeNull()
  })

  it('finds the tallest card that stands whole between the column and the keep-out', () => {
    const obstacles = [COLUMN, KEEP_OUT]
    expect(fitsWhole(MARKER, TALL, REGION, obstacles)).toBe(false)
    const cap = capHeight(MARKER, TALL, REGION, obstacles)!
    expect(cap).toBeLessThan(TALL.height)
    expect(fitsWhole(MARKER, { width: 280, height: cap }, REGION, obstacles)).toBe(true)
    expect(fitsWhole(MARKER, { width: 280, height: cap + 1 }, REGION, obstacles)).toBe(false)
    // The band between the column's foot and the keep-out, less the margin the
    // fit keeps under the column, the tip, and the marker's square the figure
    // carries.
    expect(cap).toBe(556 - 128 - 8 - 10 - 8)
  })

  it('caps nothing when the room left would be a keyhole', () => {
    const short: Rect = { left: 0, top: 0, right: 360, bottom: 128 + MIN_CAPPED_PX }
    expect(capHeight(MARKER, TALL, short, [COLUMN])).toBeNull()
  })
})
