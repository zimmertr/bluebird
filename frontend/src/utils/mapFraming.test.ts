import { describe, expect, it } from 'vitest'
import { place } from '../testSupport/fixtures'
import { centerOffset, clampInsets, framePadding, pointsWithinView, restoredFramePoints } from './mapFraming'

const W = 800
const H = 600
const INSET = 60

describe('pointsWithinView', () => {
  it('accepts a shape sitting well inside the canvas', () => {
    expect(pointsWithinView([{ x: 300, y: 250 }, { x: 500, y: 400 }], W, H, INSET)).toBe(true)
  })

  it('rejects a shape entirely off screen', () => {
    expect(pointsWithinView([{ x: -400, y: 250 }, { x: -200, y: 400 }], W, H, INSET)).toBe(false)
  })

  it('rejects a shape only one vertex of which is out of view', () => {
    const ring = [
      { x: 300, y: 250 },
      { x: 500, y: 400 },
      { x: 900, y: 300 },
    ]
    expect(pointsWithinView(ring, W, H, INSET)).toBe(false)
  })

  // The whole reason the check is inset rather than a plain bounds test: a
  // vertex a pixel inside the edge is visible and not usefully so, and it is
  // about to be dragged.
  it('rejects a shape hugging the edge inside the comfort margin', () => {
    expect(pointsWithinView([{ x: 20, y: 300 }], W, H, INSET)).toBe(false)
    expect(pointsWithinView([{ x: 300, y: H - 20 }], W, H, INSET)).toBe(false)
  })

  it('accepts a point exactly on the inset boundary', () => {
    expect(pointsWithinView([{ x: INSET, y: INSET }], W, H, INSET)).toBe(true)
    expect(pointsWithinView([{ x: W - INSET, y: H - INSET }], W, H, INSET)).toBe(true)
  })

  // An uncapped inset on a phone-sized or split-view canvas leaves no interior
  // at all, so every shape reports unframed and every check answers "move the
  // camera", which is the question not being asked.
  it('caps the inset so a small canvas keeps an interior', () => {
    expect(pointsWithinView([{ x: 100, y: 75 }], 200, 150, INSET)).toBe(true)
    expect(pointsWithinView([{ x: 10, y: 75 }], 200, 150, INSET)).toBe(false)
  })

  it('reports nothing to frame as not framed', () => {
    expect(pointsWithinView([], W, H, INSET)).toBe(false)
  })
})

describe('framePadding', () => {
  it('insets all four edges evenly with nothing standing on the map', () => {
    expect(framePadding(INSET, 0)).toEqual({ top: 60, right: 60, bottom: 60, left: 60 })
  })

  // The phone results sheet stands on the container's bottom edge while the
  // camera frames into the whole container, so the lift is added to that one
  // edge. Added to the top as well, it would frame the subject into the upper
  // half of a map that has room for it in the middle.
  it('adds the sheet lift to the bottom edge alone', () => {
    expect(framePadding(INSET, 220)).toEqual({ top: 60, right: 60, bottom: 280, left: 60 })
  })

  // The tutorial's card (#536) stands over the map too. On the bottom edge it
  // covers the same map as the sheet, so the edge clears the taller of the two.
  it('adds what else stands on the map, clearing the taller of two on one edge', () => {
    const card = { top: 280, right: 0, bottom: 150, left: 10 }
    expect(framePadding(INSET, 220, card)).toEqual({ top: 340, right: 60, bottom: 280, left: 70 })
    expect(framePadding(INSET, 100, card).bottom).toBe(210)
  })
})

describe('centerOffset', () => {
  it('is the sheet\'s half-lift upward alone, as focusResult always had it', () => {
    expect(centerOffset(220)).toEqual([0, -110])
  })

  it('centres in the map left clear by a card at the top', () => {
    expect(centerOffset(0, { top: 300, right: 0, bottom: 0, left: 0 })).toEqual([0, 150])
    expect(centerOffset(104, { top: 160, right: 0, bottom: 0, left: 40 })).toEqual([20, 28])
  })
})

describe('clampInsets', () => {
  it('leaves a third of each axis free at least', () => {
    const got = clampInsets({ top: 500, right: 10, bottom: 100, left: 400 }, 360, 640)
    expect(got.top + got.bottom).toBeLessThanOrEqual(Math.ceil((2 * 640) / 3))
    expect(got.left + got.right).toBeLessThanOrEqual(240)
    // In proportion: the larger inset stays the larger.
    expect(got.top / got.bottom).toBeCloseTo(5, 1)
    expect(got.left).toBeGreaterThan(30 * got.right)
  })

  it('lets one inset take up to two thirds alone, and drops a negative one', () => {
    expect(clampInsets({ top: 400, right: 0, bottom: -4, left: 0 }, 900, 765)).toEqual({
      top: 400,
      right: 0,
      bottom: 0,
      left: 0,
    })
  })
})

describe('restoredFramePoints', () => {
  const baker = place()
  const rainier = place({ label: 'Mount Rainier', lat: 46.8523, lon: -121.7603 })

  it('answers nothing for a link with no list and no pins', () => {
    expect(restoredFramePoints('', [])).toEqual([])
  })

  // The case #502 found: a link carrying only searched places opened on the
  // default camera because the frame never saw them.
  it('frames the searched places a link carries alone', () => {
    expect(restoredFramePoints('', [baker, rainier])).toEqual([
      { latitude: 48.7768, longitude: -121.8144 },
      { latitude: 46.8523, longitude: -121.7603 },
    ])
  })

  it('frames a pasted list alone as it did before', () => {
    expect(restoredFramePoints('47.5,-121.2,Mount Si\n48.1,-120.9', [])).toEqual([
      { latitude: 47.5, longitude: -121.2 },
      { latitude: 48.1, longitude: -120.9 },
    ])
  })

  it('unions the list and the pins, list rows first', () => {
    expect(restoredFramePoints('47.5,-121.2,Mount Si', [baker])).toEqual([
      { latitude: 47.5, longitude: -121.2 },
      { latitude: 48.7768, longitude: -121.8144 },
    ])
  })

  it('keeps the pins when the list parses to nothing', () => {
    expect(restoredFramePoints('# a comment\nnot a row\n\n', [baker])).toEqual([
      { latitude: 48.7768, longitude: -121.8144 },
    ])
  })
})
