import { describe, expect, it } from 'vitest'
import {
  CARD_GAP,
  cardMode,
  placeCard,
  sameBox,
  SHEET_MAX_W,
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
    expect(placeCard(light, card, viewport)).toEqual({
      top: 140 + CARD_GAP,
      left: viewport.width - card.width - VIEWPORT_MARGIN,
    })
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
