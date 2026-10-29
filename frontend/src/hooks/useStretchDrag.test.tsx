import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REDRAW_MS, STAGE_ATTR, useStretchDrag } from './useStretchDrag'

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
  let now = 0
  afterEach(() => vi.restoreAllMocks())

  function frames() {
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(now)
      return 0
    })
  }

  it('freezes the drawing, stretches it each frame, and redraws at most every REDRAW_MS', () => {
    frames()
    const { ref, stage, size } = area()
    const { result } = renderHook(() => useStretchDrag(ref))
    const write = vi.fn()
    now = 1000
    result.current.begin()
    expect(stage.style.width).toBe('400px')
    expect(stage.style.height).toBe('200px')

    size.w = 200
    now += 16
    result.current.frame(write)
    expect(write).toHaveBeenCalledTimes(1)
    // Still drawn at 400 wide, shown at half that.
    expect(stage.style.width).toBe('400px')
    expect(stage.style.transform).toBe('scale(0.5, 1)')

    size.h = 100
    now += REDRAW_MS
    result.current.frame(write)
    // The stage takes the box's size, so the chart redraws there.
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
    expect(stage.style.width).toBe('')
    expect(stage.style.height).toBe('')
    expect(stage.style.transform).toBe('')
  })
})
