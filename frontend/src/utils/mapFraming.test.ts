import { describe, expect, it } from 'vitest'
import { framePadding, pointsWithinView } from './mapFraming'

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
})
