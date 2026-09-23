import { describe, expect, it } from 'vitest'
import { drawControls } from './drawControls'

describe('drawControls', () => {
  it('offers only the way in when there is no ring', () => {
    expect(drawControls(false, 0)).toEqual(['start'])
  })

  it('offers the way in and Clear over a ring', () => {
    expect(drawControls(false, 3)).toEqual(['start', 'clear'])
  })

  // A phone has no Escape key, so Cancel is its only exit before a point
  // lands. Clear is there too, disabled by the panel, so the row does not
  // change shape on the first point.
  it('reads Done, Cancel, Clear before the first point', () => {
    expect(drawControls(true, 0)).toEqual(['done', 'cancel', 'clear'])
  })

  it('reads Done, Cancel, Clear once a point is placed', () => {
    expect(drawControls(true, 1)).toEqual(['done', 'cancel', 'clear'])
    expect(drawControls(true, 5)).toEqual(['done', 'cancel', 'clear'])
  })

  // An incomplete ring can outlive the mode, since Analyze also leaves it.
  it('offers Clear over an incomplete ring outside the mode', () => {
    expect(drawControls(false, 2)).toEqual(['start', 'clear'])
  })
})
