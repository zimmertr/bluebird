import { describe, expect, it } from 'vitest'
import { TRANSPORT_BAND_PX } from '../utils/resultsSheet'
import { CARD_W, cameraInsets, cardPlace, clip, dockedMapHeightPx, freeMap, overlaps } from './place'

// The docked panel is 360px, so the map starts there on every desktop.
const desktopMap = (w: number, h: number) => ({ left: 360, top: 0, right: w, bottom: h })

describe('dockedMapHeightPx', () => {
  // Measured 2026-09-29 at 1280x800 in Chromium: with the results open in
  // Both mode the map runs from 0 to 398.
  it('is the map\'s height with the results open in Both mode', () => {
    expect(dockedMapHeightPx(800)).toBe(398)
    expect(dockedMapHeightPx(1440)).toBe(948)
  })

  it('is never under the legend stack and the player on a short screen', () => {
    expect(dockedMapHeightPx(768)).toBeGreaterThanOrEqual(398)
  })
})

describe('cardPlace', () => {
  it('centres the card on the map, just above the player once the results are open', () => {
    const place = cardPlace({ viewportW: 1280, viewportH: 800, isDesktop: true, map: desktopMap(1280, 800), edge: 'bottom' })
    expect(place.width).toBe(CARD_W)
    expect(place.left).toBe(360 + (920 - CARD_W) / 2)
    expect(800 - (place.bottom ?? 0)).toBe(398 - TRANSPORT_BAND_PX - 16)
  })

  it('stands in the same place whatever the map\'s own height is', () => {
    const tall = cardPlace({ viewportW: 1280, viewportH: 800, isDesktop: true, map: desktopMap(1280, 764), edge: 'bottom' })
    const short = cardPlace({ viewportW: 1280, viewportH: 800, isDesktop: true, map: desktopMap(1280, 398), edge: 'top' })
    expect(tall).toEqual(short)
  })

  it('keeps clear of the map\'s left column and right buttons on a narrow desktop', () => {
    const place = cardPlace({ viewportW: 1024, viewportH: 768, isDesktop: true, map: desktopMap(1024, 768), edge: 'bottom' })
    expect(place.left).toBeGreaterThanOrEqual(360 + 245 + 16)
    expect(place.left + place.width).toBeLessThanOrEqual(1024 - 42 - 16)
  })

  it('spans a phone at the edge it is given', () => {
    const map = { left: 0, top: 0, right: 360, bottom: 640 }
    expect(cardPlace({ viewportW: 360, viewportH: 640, isDesktop: false, map, edge: 'bottom' })).toEqual({
      left: 0, width: 360, bottom: 0, edge: 'bottom',
    })
    expect(cardPlace({ viewportW: 360, viewportH: 640, isDesktop: false, map, edge: 'top' })).toEqual({
      left: 0, width: 360, top: 0, edge: 'top',
    })
  })
})

describe('cameraInsets', () => {
  it('frames below a desktop card', () => {
    const card = { left: 640, top: 100, right: 1000, bottom: 258 }
    expect(cameraInsets(card, desktopMap(1280, 764))).toEqual({ top: 255, right: 0, bottom: 0, left: 0 })
  })

  it('leaves a third of the map at least', () => {
    const card = { left: 640, top: 100, right: 1000, bottom: 300 }
    expect(cameraInsets(card, desktopMap(1280, 400)).top).toBe(133)
  })
})

describe('freeMap', () => {
  it('is the map below a desktop card', () => {
    const card = { left: 640, top: 100, right: 1000, bottom: 258 }
    const free = freeMap(card, desktopMap(1280, 764), 'map')
    expect(free).toEqual({ left: 360, top: 274, right: 1280, bottom: 764 })
    expect(overlaps(free, card)).toBe(false)
  })

  it('stops at the results on a phone, and at the card', () => {
    const map = { left: 0, top: 0, right: 360, bottom: 640 }
    expect(freeMap({ left: 0, top: 0, right: 360, bottom: 150 }, map, 'top', 536)).toEqual({
      left: 0, top: 166, right: 360, bottom: 536,
    })
    expect(freeMap({ left: 0, top: 490, right: 360, bottom: 640 }, map, 'bottom').bottom).toBe(474)
  })
})

describe('overlaps', () => {
  it('counts a shared edge as clear', () => {
    expect(overlaps({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false)
    expect(overlaps({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 9, top: 9, right: 20, bottom: 20 })).toBe(true)
  })
})

describe('clip', () => {
  it('keeps the part inside, and nothing where the two do not meet', () => {
    expect(clip({ left: 0, top: 50, right: 300, bottom: 700 }, { left: 0, top: 80, right: 360, bottom: 400 })).toEqual({
      left: 0, top: 80, right: 300, bottom: 400,
    })
    expect(clip({ left: -300, top: 0, right: -10, bottom: 10 }, { left: 0, top: 0, right: 360, bottom: 640 })).toBeNull()
  })
})
