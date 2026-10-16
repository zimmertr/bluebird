import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type TimelineInputs, useTimeline } from './useTimeline'
import { FRAME_MS } from '../utils/timeline'

const HOUR = 3_600_000
// Hoisted: the hook keys its memo on the array's identity, the way App hands
// it `response.times`.
const TIMES = [0, HOUR, 2 * HOUR, 3 * HOUR]
const REPORT: TimelineInputs = { times: TIMES, analysisSeq: 1, playerShown: true, showRadar: false }
const EMPTY: TimelineInputs = { times: undefined, analysisSeq: 0, playerShown: true, showRadar: false }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function render(initial: TimelineInputs) {
  return renderHook((inputs: TimelineInputs) => useTimeline(inputs), { initialProps: initial })
}

describe('useTimeline', () => {
  it('offers no axis before a report or with the player off', () => {
    expect(render(EMPTY).result.current.timelineAxis).toBeNull()
    expect(render({ ...REPORT, playerShown: false }).result.current.timelineAxis).toBeNull()
    expect(render(REPORT).result.current.timelineAxis).toBe('forecast')
  })

  it('advances while playing, and stops when the bar goes away', () => {
    const { result, rerender } = render(REPORT)
    act(() => result.current.setPlaying(true))
    act(() => void vi.advanceTimersByTime(FRAME_MS))
    expect(result.current.frameIndex).toBe(1)
    expect(result.current.playbackIndex).toBe(1)
    rerender({ ...REPORT, playerShown: false })
    expect(result.current.playing).toBe(false)
    expect(result.current.playbackIndex).toBeNull()
  })

  // A live knob hands a new times array for the same report; only a new
  // report moves the playhead back to its start.
  it('resets the playhead on a new report, not on a new times array', () => {
    const { result, rerender } = render(REPORT)
    act(() => result.current.setFrameIndex(2))
    rerender({ ...REPORT, times: [...TIMES] })
    expect(result.current.frameIndex).toBe(2)
    rerender({ ...REPORT, times: [...TIMES], analysisSeq: 2 })
    expect(result.current.frameIndex).toBe(0)
  })

  it('seeks to the nearest hour, and takes the bar off radar to do it', () => {
    const { result } = render({ ...REPORT, showRadar: true })
    act(() => result.current.setChosenAxis('radar'))
    expect(result.current.timelineAxis).toBe('radar')
    act(() => result.current.movePlayheadTo(2 * HOUR + 1_000))
    expect(result.current.timelineAxis).toBe('forecast')
    expect(result.current.frameIndex).toBe(2)
  })

  // The grid and the seek reach the memoized map and chart, so a render that
  // changes neither must hand them the same references.
  it('keeps the grid and the seek stable across a render that changes nothing', () => {
    for (const inputs of [EMPTY, REPORT]) {
      const { result, rerender } = render(inputs)
      const before = result.current
      rerender({ ...inputs })
      expect(result.current.forecastTimes).toBe(before.forecastTimes)
      expect(result.current.movePlayheadTo).toBe(before.movePlayheadTo)
    }
  })

  describe('the Space key', () => {
    afterEach(() => document.body.replaceChildren())

    // Dispatched from the element that would have focus, so it bubbles to the
    // window the way a real keystroke does.
    function press(target: Element = document.body, init: KeyboardEventInit = {}) {
      const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, ...init })
      act(() => void target.dispatchEvent(e))
      return e
    }

    function place(html: string): Element {
      document.body.innerHTML = html
      return document.body.querySelector('[data-at]') ?? document.body.firstElementChild!
    }

    it('plays and pauses while the bar is on the map, and keeps the page from scrolling', () => {
      const { result } = render(REPORT)
      expect(press().defaultPrevented).toBe(true)
      expect(result.current.playing).toBe(true)
      press()
      expect(result.current.playing).toBe(false)
    })

    it('does nothing with no bar on the map', () => {
      for (const inputs of [EMPTY, { ...REPORT, playerShown: false }]) {
        const { result, unmount } = render(inputs)
        expect(press().defaultPrevented).toBe(false)
        expect(result.current.playing).toBe(false)
        unmount()
      }
    })

    it('works from the scrubber, which Space does nothing to', () => {
      const { result } = render(REPORT)
      press(place('<input type="range">'))
      expect(result.current.playing).toBe(true)
    })

    // The play button's own press would toggle a second time, a field would
    // lose its space, and a modal owns the keyboard while it is open.
    it.each([
      ['a button', '<button>Play</button>'],
      ['a text field', '<input type="text">'],
      ['a checkbox', '<input type="checkbox">'],
      ['a select', '<select></select>'],
      ['a textarea', '<textarea></textarea>'],
      ['an editable region', '<div contenteditable="true"></div>'],
      ['a widget with a role', '<div role="switch" tabindex="0"></div>'],
      ['the inside of a modal', '<div aria-modal="true"><p data-at>Prose</p></div>'],
    ])('leaves Space to %s', (_, html) => {
      const { result } = render(REPORT)
      expect(press(place(html)).defaultPrevented).toBe(false)
      expect(result.current.playing).toBe(false)
    })

    it('ignores a held key, a chord, and a key another handler took', () => {
      const { result } = render(REPORT)
      press(document.body, { repeat: true })
      press(document.body, { shiftKey: true })
      press(document.body, { metaKey: true })
      const take = (e: Event) => e.preventDefault()
      document.addEventListener('keydown', take)
      press()
      document.removeEventListener('keydown', take)
      expect(result.current.playing).toBe(false)
    })
  })
})
