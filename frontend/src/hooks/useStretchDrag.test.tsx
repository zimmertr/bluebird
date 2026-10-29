import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PAUSE_MS, STAGE_ATTR, useStretchDrag } from './useStretchDrag'

// One panel: a box whose size the test sets, holding the stage.
function area() {
  const root = document.createElement('div')
  const box = document.createElement('div')
  const stage = document.createElement('div')
  stage.setAttribute(STAGE_ATTR, '')
  box.appendChild(stage)
  root.appendChild(box)
  const size = { w: 400, h: 200 }
  Object.defineProperty(box, 'clientWidth', { get: () => size.w })
  Object.defineProperty(box, 'clientHeight', { get: () => size.h })
  return { ref: { current: root }, stage, size }
}

describe('useStretchDrag', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function frames() {
    vi.useFakeTimers()
    // Every frame at once; 0 so the next move queues its own.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
  }

  it('stretches the drawing while the pointer moves and redraws only when it rests', () => {
    frames()
    const { ref, stage, size } = area()
    const { result } = renderHook(() => useStretchDrag(ref))
    const write = vi.fn()
    result.current.begin()
    expect(stage.style.width).toBe('400px')
    expect(stage.style.willChange).toBe('transform')

    size.w = 200
    result.current.frame(write)
    vi.advanceTimersByTime(PAUSE_MS - 1)
    size.h = 100
    result.current.frame(write)
    vi.advanceTimersByTime(PAUSE_MS - 1)
    // Still drawn at 400 by 200, shown at half of each.
    expect(write).toHaveBeenCalledTimes(2)
    expect(stage.style.width).toBe('400px')
    expect(stage.style.transform).toBe('scale(0.5, 0.5)')

    vi.advanceTimersByTime(1)
    // At rest the stage takes the box's size, so the chart redraws there.
    expect(stage.style.width).toBe('200px')
    expect(stage.style.height).toBe('100px')
    expect(stage.style.transform).toBe('')
  })

  it('hands the stage back to the layout on release', () => {
    frames()
    const { ref, stage } = area()
    const { result } = renderHook(() => useStretchDrag(ref))
    const write = vi.fn()
    result.current.begin()
    result.current.frame(write)
    result.current.end()
    expect(write).toHaveBeenCalledTimes(2)
    expect([stage.style.width, stage.style.height, stage.style.transform, stage.style.willChange]).toEqual(['', '', '', ''])
  })
})
