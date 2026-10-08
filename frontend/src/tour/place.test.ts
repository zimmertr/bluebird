import { describe, expect, it } from 'vitest'
import {
  CARD_GAP,
  cardMode,
  clipAbove,
  placeCard,
  sameBox,
  scrollBlock,
  scrollTopFor,
  sectionBox,
  SHEET_MAX_W,
  sheetEdge,
  sheetKeepOut,
  SPOTLIGHT_PAD,
  spotlight,
  unionBox,
  VIEWPORT_MARGIN,
} from './place'

const card = { width: 320, height: 160 }
const viewport = { width: 1280, height: 800 }

describe('the spotlight', () => {
  it('grows the target by the pad on every side', () => {
    expect(spotlight({ top: 100, left: 200, width: 50, height: 20 })).toEqual({
      top: 100 - SPOTLIGHT_PAD,
      left: 200 - SPOTLIGHT_PAD,
      width: 50 + 2 * SPOTLIGHT_PAD,
      height: 20 + 2 * SPOTLIGHT_PAD,
    })
  })

  it('compares boxes by value, and null only to null', () => {
    const a = { top: 1, left: 2, width: 3, height: 4 }
    expect(sameBox(a, { ...a })).toBe(true)
    expect(sameBox(a, { ...a, top: 0 })).toBe(false)
    expect(sameBox(null, null)).toBe(true)
    expect(sameBox(a, null)).toBe(false)
  })
})

describe('the sheet', () => {
  it('is for phone widths alone, not for every window under the desktop breakpoint', () => {
    expect(cardMode(SHEET_MAX_W - 1)).toBe('sheet')
    expect(cardMode(SHEET_MAX_W)).toBe('card')
    expect(cardMode(1000)).toBe('card')
  })

  it('is exactly where a box stops fitting beside the docked panel', () => {
    expect(SHEET_MAX_W).toBeGreaterThanOrEqual(360 + CARD_GAP + card.width + VIEWPORT_MARGIN)
  })

  it('takes the bottom edge unless the target stands there', () => {
    expect(sheetEdge({ top: 100, left: 0, width: 300, height: 40 }, 160, 800)).toBe('bottom')
    expect(sheetEdge({ top: 700, left: 0, width: 300, height: 40 }, 160, 800)).toBe('top')
    expect(sheetEdge(null, 160, 800)).toBe('bottom')
  })

  // The room a popup must leave the card (#678): a target ending at the
  // keep-out's top lights up to the band and the card stays at the bottom;
  // one pixel lower and it would move to the top, onto the target. The
  // numbers are the 360x740 phone the tutorial was measured on.
  it('keeps the card at the bottom for a target that stops at its keep-out', () => {
    const keepOut = sheetKeepOut({ left: 16, right: 344 }, 146, 740, SPOTLIGHT_PAD)
    expect(keepOut).toEqual({ left: 16, right: 344, top: 556, bottom: 724 })
    const reaching = (bottom: number) => spotlight({ top: 160, left: 40, width: 280, height: bottom - 160 })
    expect(sheetEdge(reaching(keepOut.top), 146, 740)).toBe('bottom')
    expect(sheetEdge(reaching(keepOut.top + 1), 146, 740)).toBe('top')
  })
})

describe('a section between the rules', () => {
  const column = { top: 100, left: 0, width: 360, height: 600 }
  const own = { top: 116, left: 16, width: 328, height: 200 }
  it('spans the column, from its own top when a rule stands there, or the column top for the first', () => {
    expect(sectionBox(own, null, { top: 332, left: 16, width: 328, height: 50 }, column)).toEqual({ top: 100, left: 0, width: 360, height: 232 })
    expect(sectionBox(own, { top: 0, left: 16, width: 328, height: 100 }, { top: 332, left: 16, width: 328, height: 50 }, column)).toEqual({ top: 116, left: 0, width: 360, height: 216 })
  })
  it('runs to the column bottom for the last', () => {
    expect(sectionBox(own, { top: 0, left: 16, width: 328, height: 100 }, null, column)).toEqual({ top: 116, left: 0, width: 360, height: 584 })
  })
})

describe('the union', () => {
  it('holds every box, and skips the ones that are not there', () => {
    expect(unionBox([{ top: 10, left: 10, width: 20, height: 20 }, null, { top: 40, left: 5, width: 10, height: 100 }])).toEqual({
      top: 10,
      left: 5,
      width: 25,
      height: 130,
    })
    expect(unionBox([null, null])).toBeNull()
  })
})

describe('the card', () => {
  it('stands to the right of a panel section, level with its middle', () => {
    const light = { top: 100, left: 0, width: 360, height: 300 }
    expect(placeCard(light, card, viewport)).toEqual({ top: 250 - 80, left: 360 + CARD_GAP })
  })

  it('hangs below a control near the top right edge, centred on it', () => {
    const light = { top: 100, left: 1000, width: 100, height: 40 }
    expect(placeCard(light, card, viewport)).toEqual({ top: 140 + CARD_GAP, left: 1050 - 160 })
  })

  it('rises above a control at the bottom right', () => {
    const light = { top: 700, left: 1100, width: 100, height: 60 }
    expect(placeCard(light, card, viewport)).toEqual({
      top: 700 - CARD_GAP - card.height,
      left: viewport.width - card.width - VIEWPORT_MARGIN,
    })
  })

  it('stands inside the bottom edge of a target that fills the screen', () => {
    const light = { top: 0, left: 0, width: 1280, height: 800 }
    expect(placeCard(light, card, viewport)).toEqual({
      // The viewport margin binds before the gap does.
      top: viewport.height - card.height - VIEWPORT_MARGIN,
      left: 640 - 160,
    })
  })

  it('never leaves the viewport margin', () => {
    const light = { top: 10, left: 5, width: 20, height: 20 }
    const at = placeCard(light, card, viewport)
    expect(at.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
    expect(at.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
  })
})

describe('clipAbove', () => {
  const box = { top: 100, left: 10, width: 50, height: 200 }

  it('cuts a box at the line and leaves one above it alone', () => {
    expect(clipAbove(box, 250)).toEqual({ ...box, height: 150 })
    expect(clipAbove(box, 400)).toEqual(box)
  })

  it('keeps a box wholly under the line as no height at the line', () => {
    expect(clipAbove(box, 50)).toEqual({ ...box, top: 50, height: 0 })
  })
})

// A section taller than the panel stayed where it stood under `nearest` once
// its top was in view, so the Metrics step lit only its top two rows.
describe('the scroll to a step', () => {
  it('brings a section to the top of the panel', () => {
    expect(scrollBlock('section')).toBe('start')
  })

  it('moves a control or a surface only as far as it must', () => {
    expect(scrollBlock('control')).toBe('nearest')
    expect(scrollBlock('box')).toBe('nearest')
    expect(scrollBlock(undefined)).toBe('nearest')
  })

  // One box, the panel's own; the position it should take, never a call that
  // scrolls every ancestor.
  describe('scrollTopFor', () => {
    const view = { top: 100, left: 0, width: 360, height: 500 }

    it('puts a section at the top of the box', () => {
      expect(scrollTopFor('start', { top: 400, left: 0, width: 360, height: 200 }, view, 50)).toBe(350)
      expect(scrollTopFor('start', { top: 20, left: 0, width: 360, height: 200 }, view, 300)).toBe(220)
    })

    it('leaves a target already in view where it is', () => {
      expect(scrollTopFor('nearest', { top: 150, left: 0, width: 360, height: 200 }, view, 50)).toBe(50)
    })

    it('moves the shorter way to a target outside the box', () => {
      expect(scrollTopFor('nearest', { top: 20, left: 0, width: 360, height: 60 }, view, 300)).toBe(220)
      expect(scrollTopFor('nearest', { top: 550, left: 0, width: 360, height: 100 }, view, 50)).toBe(100)
    })

    it('shows the top of a target taller than the box', () => {
      expect(scrollTopFor('nearest', { top: 400, left: 0, width: 360, height: 900 }, view, 50)).toBe(350)
    })

    it('never asks for a negative position', () => {
      expect(scrollTopFor('start', { top: 20, left: 0, width: 360, height: 60 }, view, 0)).toBe(0)
    })
  })
})
