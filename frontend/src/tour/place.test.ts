import { describe, expect, it } from 'vitest'
import { TRANSPORT_BAND_PX } from '../utils/resultsSheet'
import { RESULTS_BAR_PX, dockedMapFloorPx } from '../utils/resultsSheet'
import { CARD_W, WHOLE_TABLE_PX, cameraInsets, cardPlace, clip, dockedMapHeightPx, freeMap, overlaps } from './place'

// The docked panel is 360px, so the map starts there on every desktop.
const desktopMap = (w: number, h: number) => ({ left: 360, top: 0, right: w, bottom: h })

describe('dockedMapHeightPx', () => {
  it('is the map above the whole table and its bar', () => {
    expect(dockedMapHeightPx(800)).toBe(800 - WHOLE_TABLE_PX - 44)
    expect(dockedMapHeightPx(1440)).toBe(1440 - WHOLE_TABLE_PX - 44)
  })

  it('is never under the legend stack and the player on a short screen', () => {
    // The floor counts the results' bar, which is not map.
    for (const h of [600, 700, 768]) {
      expect(dockedMapHeightPx(h)).toBeGreaterThanOrEqual(dockedMapFloorPx(0) - RESULTS_BAR_PX)
    }
  })
})

describe('cardPlace', () => {
  it('centres the card on the map, just above the player while the whole table is open', () => {
    const place = cardPlace({ viewportW: 1280, viewportH: 800, isDesktop: true, map: desktopMap(1280, 800), edge: 'bottom' })
    expect(place.width).toBe(CARD_W)
    expect(place.left).toBe(360 + (920 - CARD_W) / 2)
    expect(800 - (place.bottom ?? 0)).toBe(dockedMapHeightPx(800) - TRANSPORT_BAND_PX - 16)
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

describe('freeMap', () => {
  const held = { top: 0, left: 212, right: 58 }

  it('is the map below a desktop card, less the chrome down each side', () => {
    const card = { left: 640, top: 171, right: 1000, bottom: 311 }
    const free = freeMap(card, desktopMap(1280, 765), 'map', 672, held)
    expect(free).toEqual({ left: 572, top: 327, right: 1222, bottom: 672 })
    expect(overlaps(free, card)).toBe(false)
  })

  it('is the map above a desktop card that stands low on a tall map', () => {
    const card = { left: 1100, top: 811, right: 1460, bottom: 951 }
    expect(freeMap(card, desktopMap(2560, 1405), 'map', 1312, held)).toEqual({
      left: 572, top: 0, right: 2502, bottom: 795,
    })
  })

  it('stops at the results on a phone, at the card, and under the button column', () => {
    const map = { left: 0, top: 150, right: 360, bottom: 640 }
    const column = { top: 150, left: 0, right: 0 }
    expect(freeMap({ left: 0, top: 0, right: 360, bottom: 150 }, map, 'top', 536, column)).toEqual({
      left: 0, top: 300, right: 360, bottom: 536,
    })
    expect(freeMap({ left: 0, top: 490, right: 360, bottom: 640 }, { ...map, top: 0 }, 'bottom').bottom).toBe(474)
  })
})

describe('cameraInsets', () => {
  it('keeps the camera to the free map', () => {
    const map = desktopMap(1280, 765)
    expect(cameraInsets({ left: 572, top: 327, right: 1222, bottom: 672 }, map)).toEqual({
      top: 327, right: 58, bottom: 93, left: 212,
    })
  })

  it('leaves a third of the map at least', () => {
    const got = cameraInsets({ left: 360, top: 350, right: 1280, bottom: 390 }, desktopMap(1280, 400))
    expect(400 - got.top - got.bottom).toBeGreaterThanOrEqual(133)
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
