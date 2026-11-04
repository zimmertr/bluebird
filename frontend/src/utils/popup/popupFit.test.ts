import { describe, expect, it } from 'vitest'
import {
  BODY_CEILING_SHARE,
  BODY_FLOOR_SHARE,
  FIT_MARGIN_PX,
  bodyBounds,
  capHeight,
  dragBodyRange,
  figureOf,
  fitPan,
  fitsWhole,
  grownBodyCap,
  openingBodyCap,
  placePopup,
  standingRoom,
  visibleArea,
  type Rect,
} from './popupFit'

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

  // A table row's card on a 1080x833 desk map, measured in a browser on
  // 2026-11-04: whole above its point with no move, or whole below it 42px up,
  // clear of the forecast player. The point MapLibre projected once the flight
  // landed carried noise in its last digits, and an exact comparison of the
  // two areas let the noise pick the longer move: the card turned under its
  // point and the map panned after the flight had landed.
  it('breaks a tie on the shorter move whatever noise the point carries', () => {
    const desk: Rect = { left: 0, top: 0, right: 1080, bottom: 833 }
    const player: Rect = { left: 356, top: 738.5, right: 724, bottom: 789 }
    const card = { width: 198, height: 346 }
    const still = { anchor: 'bottom', dx: 0, dy: 0 }
    expect(placePopup({ x: 540, y: 416.5 }, card, desk, [player])).toEqual(still)
    expect(placePopup({ x: 540.0000000000239, y: 416.5000000000477 }, card, desk, [player])).toEqual(still)
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
  // The least card a cap may leave, here the 200px floor the fit kept until
  // the floor became a share of the map (TJ, 2026-11-03).
  const MIN = 200
  const REGION: Rect = { left: 0, top: 0, right: 360, bottom: 636 }
  const COLUMN: Rect = { left: 12, top: 12, right: 196, bottom: 128 }
  const KEEP_OUT: Rect = { left: 16, right: 344, top: 556, bottom: 724 }
  const MARKER = { x: 180, y: 318 }
  const TALL = { width: 280, height: 451 }

  it('caps nothing that already stands whole', () => {
    expect(capHeight(MARKER, { width: 280, height: 401 }, REGION, [COLUMN, KEEP_OUT], MIN)).toBeNull()
    expect(capHeight({ x: 300, y: 200 }, CARD, SHORT_DESKTOP, [DESKTOP_COLUMN], MIN)).toBeNull()
  })

  it('finds the tallest card that stands whole between the column and the keep-out', () => {
    const obstacles = [COLUMN, KEEP_OUT]
    expect(fitsWhole(MARKER, TALL, REGION, obstacles)).toBe(false)
    const cap = capHeight(MARKER, TALL, REGION, obstacles, MIN)!
    expect(cap).toBeLessThan(TALL.height)
    expect(fitsWhole(MARKER, { width: 280, height: cap }, REGION, obstacles)).toBe(true)
    expect(fitsWhole(MARKER, { width: 280, height: cap + 1 }, REGION, obstacles)).toBe(false)
    // The band between the column's foot and the keep-out, less the margin the
    // fit keeps under the column, the tip, and the marker's square the figure
    // carries.
    expect(cap).toBe(556 - 128 - 8 - 10 - 8)
  })

  it('caps nothing when the room left would be a keyhole', () => {
    const short: Rect = { left: 0, top: 0, right: 360, bottom: 128 + MIN }
    expect(capHeight(MARKER, TALL, short, [COLUMN], MIN)).toBeNull()
  })
})

// A card's body stands between a floor and a ceiling of the visible map's
// height (TJ, 2026-11-03): never more than three quarters of it, even where
// the map has room, and never capped under a quarter.
describe('bodyBounds', () => {
  it('is a quarter and three quarters of the visible map, in whole pixels', () => {
    expect([BODY_FLOOR_SHARE, BODY_CEILING_SHARE]).toEqual([0.25, 0.75])
    expect(bodyBounds({ left: 0, top: 0, right: 1280, bottom: 1000 })).toEqual({ floor: 250, ceiling: 750 })
    expect(bodyBounds({ left: 0, top: 0, right: 1280, bottom: 600 })).toEqual({ floor: 150, ceiling: 450 })
    // The tutorial's phone, above its collapsed sheet.
    expect(bodyBounds({ left: 0, top: 0, right: 360, bottom: 636 })).toEqual({ floor: 159, ceiling: 477 })
    expect(bodyBounds({ left: 0, top: 0, right: 360, bottom: 0 })).toEqual({ floor: 0, ceiling: 0 })
  })

})

// A reader's drag runs from the floor the app caps a body by, a quarter of
// the visible map, to the free map's height: the region less the fit's 8px
// at each edge, the marker's 8 and the tip's 10, less the header (TJ,
// 2026-11-04). A body that holds less than the floor stops at its own height.
describe('dragBodyRange', () => {
  it('runs from the floor to the free map, past the ceiling', () => {
    // 1000 - 34 - 60: well past the 750 ceiling, and down to the 250 floor.
    expect(dragBodyRange({ left: 0, top: 0, right: 1280, bottom: 1000 }, 60, 700)).toEqual({ min: 250, max: 906 })
    // A desk's 600px map: 150 to 600 - 34 - 60.
    expect(dragBodyRange({ left: 0, top: 0, right: 1280, bottom: 600 }, 60, 700)).toEqual({ min: 150, max: 506 })
    // The tutorial's phone above its collapsed sheet: 159 to 636 - 34 - 80.
    expect(dragBodyRange({ left: 0, top: 0, right: 360, bottom: 636 }, 80, 400)).toEqual({ min: 159, max: 522 })
  })

  it('stops a body that holds less than the floor at its own height', () => {
    expect(dragBodyRange({ left: 0, top: 0, right: 1280, bottom: 1000 }, 60, 120)).toEqual({ min: 120, max: 906 })
    // Exactly the floor is the floor.
    expect(dragBodyRange({ left: 0, top: 0, right: 1280, bottom: 1000 }, 60, 250)).toEqual({ min: 250, max: 906 })
  })

  it('never runs its most under its least', () => {
    // A header taller than the free map leaves the floor alone: 30 of a 120px map.
    expect(dragBodyRange({ left: 0, top: 0, right: 360, bottom: 120 }, 200, 400)).toEqual({ min: 30, max: 30 })
    // A map with no visible height stands the body at its content.
    expect(dragBodyRange({ left: 0, top: 0, right: 360, bottom: 0 }, 60, 400)).toEqual({ min: 400, max: 400 })
  })

  // The room where the card stands bounds the most (TJ, 2026-11-04): a card
  // with 500px on its side of its point takes 500 less its 60 of header, and
  // one with less room than the floor stays at the floor.
  it('stops at the room the card has where it stands', () => {
    const region = { left: 0, top: 0, right: 1280, bottom: 1000 }
    expect(dragBodyRange(region, 60, 700, 500)).toEqual({ min: 250, max: 440 })
    expect(dragBodyRange(region, 60, 700, 2000)).toEqual({ min: 250, max: 906 })
    expect(dragBodyRange(region, 60, 700, 100)).toEqual({ min: 250, max: 250 })
  })
})

// A card stands centred on its point and hangs on one side of it, so the
// room it has is twice the distance to its nearer side less 8px of breath at
// each edge, and the distance to the edge on its side less the tip's 10 and
// the breath (TJ, 2026-11-04).
describe('standingRoom', () => {
  const region: Rect = { left: 0, top: 0, right: 1280, bottom: 1000 }

  it('gives a card in the middle of the map the map less its breath', () => {
    expect(standingRoom({ x: 640, y: 500 }, 'top', region)).toEqual({ width: 1264, height: 482 })
    expect(standingRoom({ x: 640, y: 500 }, 'bottom', region)).toEqual({ width: 1264, height: 482 })
  })

  it('gives a card near an edge only the room to that edge', () => {
    // 100 to the left edge: 200 less 16.
    expect(standingRoom({ x: 100, y: 900 }, 'bottom', region)).toEqual({ width: 184, height: 882 })
    // Hanging below a point 900 down: 1000 - 8 - 910.
    expect(standingRoom({ x: 100, y: 900 }, 'top', region).height).toBe(82)
  })

  it('never answers less than nothing', () => {
    expect(standingRoom({ x: -50, y: 995 }, 'top', region)).toEqual({ width: 0, height: 0 })
  })
})

describe('openingBodyCap', () => {
  const DESK: Rect = { left: 0, top: 0, right: 1280, bottom: 1000 }

  // An 800px card whose 760px body stands whole high on a 1000px map is
  // still cut to three quarters of the map.
  it('caps a body at the ceiling even where the map has room for all of it', () => {
    const marker = { x: 640, y: 50 }
    const size = { width: 280, height: 800 }
    expect(fitsWhole(marker, size, DESK)).toBe(true)
    expect(openingBodyCap(marker, size, 760, DESK)).toBe(750)
  })

  it('caps nothing that stands whole under the ceiling', () => {
    expect(openingBodyCap({ x: 640, y: 50 }, { width: 280, height: 300 }, 260, DESK)).toBeNull()
  })

  // The tutorial's phone (above): the fit's cap of the whole card is 402px,
  // whose 51px of header and foot leave the body 351, between the floor of
  // 159 and the ceiling of 477.
  it("takes the fit's cap where it lies between the bounds", () => {
    const region: Rect = { left: 0, top: 0, right: 360, bottom: 636 }
    const obstacles: Rect[] = [
      { left: 12, top: 12, right: 196, bottom: 128 },
      { left: 16, right: 344, top: 556, bottom: 724 },
    ]
    expect(openingBodyCap({ x: 180, y: 318 }, { width: 280, height: 451 }, 400, region, obstacles)).toBe(402 - 51)
  })

  // A 300px map has room for no card whose body keeps its 75px floor under
  // 200px of header and foot: the body keeps the floor and the fit pans the
  // card title first, rather than cutting it to a keyhole.
  it('keeps the floor where the fit cannot give it, and the fit then pans the card title first', () => {
    const short: Rect = { left: 0, top: 0, right: 1000, bottom: 300 }
    const marker = { x: 500, y: 150 }
    expect(openingBodyCap(marker, { width: 280, height: 600 }, 400, short)).toBe(75)
    const capped = { width: 280, height: 200 + 75 }
    const placed = placePopup(marker, capped, short)
    expect(placed.dy).toBeLessThan(0)
    expect(figureOf({ x: marker.x, y: marker.y + placed.dy }, capped, placed.anchor).top).toBe(FIT_MARGIN_PX)
  })

  it('caps nothing on a map with no visible height', () => {
    expect(openingBodyCap({ x: 0, y: 0 }, { width: 280, height: 300 }, 260, { left: 0, top: 0, right: 360, bottom: 0 })).toBeNull()
    expect(grownBodyCap(260, 300, { left: 0, top: 0, right: 360, bottom: 0 })).toEqual({ cap: null, pan: 0 })
  })

  it('never caps a body shorter than the floor', () => {
    const short: Rect = { left: 0, top: 0, right: 1000, bottom: 300 }
    expect(openingBodyCap({ x: 500, y: 150 }, { width: 280, height: 300 }, 60, short)).toBeNull()
  })
})

// A body that grew after its card opened, measured where the card stands on
// a 600px map: a floor of 150 and a ceiling of 450.
describe('grownBodyCap', () => {
  const MAP: Rect = { left: 0, top: 0, right: 1280, bottom: 600 }

  it('caps nothing that still stands whole under the ceiling', () => {
    expect(grownBodyCap(180, -20, MAP)).toEqual({ cap: null, pan: 0 })
  })

  it('takes off the body what runs past the edge', () => {
    expect(grownBodyCap(300, 138, MAP)).toEqual({ cap: 162, pan: 0 })
  })

  it('caps a body at the ceiling where it stands whole', () => {
    expect(grownBodyCap(500, -10, MAP)).toEqual({ cap: 450, pan: 0 })
  })

  // 62px would fit; the body keeps its 150 and the map brings in the 88
  // that runs past.
  it('keeps the floor and pans in what runs past', () => {
    expect(grownBodyCap(180, 118, MAP)).toEqual({ cap: 150, pan: 88 })
    // A body under the floor keeps all of itself.
    expect(grownBodyCap(100, 50, MAP)).toEqual({ cap: null, pan: 50 })
  })
})
