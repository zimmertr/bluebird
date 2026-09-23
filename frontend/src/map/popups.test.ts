import { describe, expect, it, vi } from 'vitest'
import { createPopupBoard, isPinning, popupOptions, type BoardPopup } from './popups'
import { popupWidth } from '../utils/popupChrome'
import { stubMap } from '../testSupport/stubMap'

// A popup that says whether it is open and fires `close` when taken down, the
// way MapLibre's does for its own button, for closeOnClick and for `remove`.
function fakePopup() {
  const closers: (() => void)[] = []
  const popup = {
    open: true,
    remove: vi.fn(() => {
      popup.open = false
      for (const fn of closers) fn()
    }),
    on: (_type: string, fn: () => void) => closers.push(fn),
  }
  return popup as typeof popup & BoardPopup
}

describe('isPinning', () => {
  it('pins on shift and on nothing else', () => {
    expect(isPinning({ originalEvent: { shiftKey: true } })).toBe(true)
    expect(isPinning({ originalEvent: { shiftKey: false } })).toBe(false)
    expect(isPinning({})).toBe(false)
  })
})

describe('popupOptions', () => {
  it('sizes a popup from the canvas it opens on', () => {
    for (const width of [320, 1280]) {
      const { map } = stubMap({ canvasWidth: width })
      expect(popupOptions(map)).toEqual({ maxWidth: popupWidth(width) })
    }
  })
})

describe('createPopupBoard', () => {
  it('closes every popup on the board, pinned or not', () => {
    const board = createPopupBoard()
    const [a, b] = [fakePopup(), fakePopup()]
    board.track(a)
    board.track(b)
    board.closeAll()
    expect([a.open, b.open]).toEqual([false, false])
  })

  it('forgets a popup its own close button took down', () => {
    const board = createPopupBoard()
    const [a, b] = [fakePopup(), fakePopup()]
    board.track(a)
    board.track(b)
    a.remove()
    board.closeAll()
    expect(a.remove).toHaveBeenCalledTimes(1)
    expect(b.remove).toHaveBeenCalledTimes(1)
  })

  it('starts empty after a close, so a second close touches nothing', () => {
    const board = createPopupBoard()
    const a = fakePopup()
    board.track(a)
    board.closeAll()
    board.closeAll()
    expect(a.remove).toHaveBeenCalledTimes(1)
  })
})
