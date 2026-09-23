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
})
