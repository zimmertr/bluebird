import { describe, expect, it } from 'vitest'
import { drawControls } from './drawControls'

describe('drawControls', () => {
  it('offers only the way in when there is no ring', () => {
    expect(drawControls(false, 0)).toEqual({
      mode: 'draw',
      modeEnabled: true,
      cancelEnabled: false,
      clearEnabled: false,
    })
  })

  it('offers Edit polygon and Clear over a ring', () => {
    expect(drawControls(false, 3)).toEqual({
      mode: 'edit',
      modeEnabled: true,
      cancelEnabled: false,
      clearEnabled: true,
    })
  })

  // A phone has no Escape key, so Cancel is its only exit before a point
  // lands, and it can act at once.
  it('lets only Cancel act before the first point', () => {
    expect(drawControls(true, 0)).toEqual({
      mode: 'done',
      modeEnabled: false,
      cancelEnabled: true,
      clearEnabled: false,
    })
  })

  it('holds Done until the ring is a polygon', () => {
    expect(drawControls(true, 2)).toMatchObject({ mode: 'done', modeEnabled: false, cancelEnabled: true, clearEnabled: true })
    expect(drawControls(true, 3)).toMatchObject({ mode: 'done', modeEnabled: true, cancelEnabled: true, clearEnabled: true })
  })

  // An incomplete ring can outlive the mode, since Analyze also leaves it.
  it('offers Clear over an incomplete ring outside the mode', () => {
    expect(drawControls(false, 2)).toMatchObject({ mode: 'edit', cancelEnabled: false, clearEnabled: true })
  })
})
