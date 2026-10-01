import { describe, expect, it } from 'vitest'
import { place } from '../testSupport/fixtures'
import { anyPointInView, framePadding, pointsWithinView, restoredFramePoints } from './mapFraming'

const W = 800
const H = 600
const INSET = 60

// A committed report moves the map only when the view shows none of its rows
// (#579): one row on screen, even on the edge, keeps the reader's camera.
describe('anyPointInView', () => {
  it('answers yes when one row is on the canvas and the rest are off it', () => {
    expect(anyPointInView([{ x: -50, y: 100 }, { x: 400, y: 300 }, { x: 900, y: 700 }], W, H)).toBe(true)
  })

  it('counts a row on the very edge as in view', () => {
    expect(anyPointInView([{ x: 0, y: H }], W, H)).toBe(true)
    expect(anyPointInView([{ x: W, y: 0 }], W, H)).toBe(true)
  })

  it('answers no when every row is off the canvas, on any side', () => {
    expect(anyPointInView([{ x: -1, y: 300 }, { x: W + 1, y: 300 }, { x: 400, y: -1 }, { x: 400, y: H + 1 }], W, H)).toBe(false)
  })

  it('answers no for no rows; the map handle guards on having any', () => {
    expect(anyPointInView([], W, H)).toBe(false)
  })
})

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
