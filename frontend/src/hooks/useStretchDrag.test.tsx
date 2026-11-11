import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOX_ATTR, HANDLE_ATTR, PAUSE_MS, STAGE_ATTR, useStretchDrag } from './useStretchDrag'

// Two stacked boxes, each a 20px heading over a plot holding its stage, and
// a grip between them. jsdom lays nothing out, so the sizes are set by hand.
function area() {
  const root = document.createElement('div')
  const sizes = new Map<Element, { w: number; h: number }>()
  const box = (h: number) => {
    const el = document.createElement('div')
    el.setAttribute(BOX_ATTR, '')
    const plot = document.createElement('div')
    const stage = document.createElement('div')
    stage.setAttribute(STAGE_ATTR, '')
    plot.appendChild(stage)
    el.appendChild(plot)
    sizes.set(plot, { w: 400, h: h - 20 })
    return { el, plot, stage }
  }
  const top = box(100)
  const grip = document.createElement('div')
  grip.setAttribute(HANDLE_ATTR, '')
  const bottom = box(100)
  root.append(top.el, grip, bottom.el)
  const reads = { n: 0 }
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    reads.n++
    return sizes.get(this)?.w ?? 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    reads.n++
    return sizes.get(this)?.h ?? 0
  })
  const rects = new Map<Element, [number, number, number, number]>([
    [root, [0, 0, 400, 208]],
    [top.el, [0, 0, 400, 100]],
    [bottom.el, [0, 108, 400, 100]],
  ])
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    reads.n++
    const [x, y, w, h] = rects.get(this) ?? [0, 0, 0, 0]
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect
  })
  return { ref: { current: root }, top, bottom, grip, reads }
}

// The top box grown by 20px: the bottom one moves down and shrinks by it.
const LAYOUT = () => ({
  boxes: [
    { x: 0, y: 0, w: 400, h: 120 },
    { x: 0, y: 128, w: 400, h: 80 },
  ],
  handles: [{ dx: 0, dy: 20 }],
})

describe('useStretchDrag', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function frames() {
    vi.useFakeTimers()
    // Every frame at once; 0 so the next one queues its own.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
  }

  it('moves the boxes and the grip by transform alone, and stretches each drawing', () => {
    frames()
    const { ref, top, bottom, grip, reads } = area()
    const { result } = renderHook(() => useStretchDrag(ref, () => {}))
    result.current.begin()
    expect(top.stage.style.width).toBe('400px')
    expect(top.stage.style.height).toBe('80px')
    expect([top.el, top.stage, grip].map((e) => e.style.willChange)).toEqual(['transform', 'transform', 'transform'])

    // Every read happens at begin: a frame reads no size.
    reads.n = 0
    result.current.frame(LAYOUT)
    expect(reads.n).toBe(0)
    expect(top.stage.style.transform).toBe('scale(1, 1.25)')
    expect(bottom.el.style.transform).toBe('translate(0px, 20px)')
    expect(bottom.stage.style.transform).toBe('scale(1, 0.75)')
    expect(grip.style.transform).toBe('translate(0px, 20px)')
  })

  it('commits when the pointer rests, and not while it moves', () => {
    frames()
    const { ref } = area()
    const onRest = vi.fn()
    const { result } = renderHook(() => useStretchDrag(ref, onRest))
    result.current.begin()
    result.current.frame(LAYOUT)
    vi.advanceTimersByTime(PAUSE_MS - 1)
    result.current.frame(LAYOUT)
    vi.advanceTimersByTime(PAUSE_MS - 1)
    expect(onRest).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onRest).toHaveBeenCalledTimes(1)
  })

  it('hands the panels back one a frame on release, and clears every layer', () => {
    vi.useFakeTimers()
    const queued: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queued.push(cb)
      return queued.length
    })
    const { ref, top, bottom, grip } = area()
    const { result } = renderHook(() => useStretchDrag(ref, () => {}))
    result.current.begin()
    result.current.end()
    result.current.settle()
    expect([top.el.style.transform, grip.style.transform, grip.style.willChange]).toEqual(['', '', ''])
    // The first stage is back at once, the second a frame later.
    expect(top.stage.style.width).toBe('')
    expect(bottom.stage.style.width).toBe('400px')
    queued.shift()!(0)
    expect(bottom.stage.style.width).toBe('')
    expect(bottom.stage.style.willChange).toBe('')
  })

  // The release's hand-back once left its last frame id where a drag looks
  // for its own queued frame, so a second drag painted nothing until it
  // rested. The frame ids here are real, as a browser's are.
  it('moves on every frame of a second drag, after a release has handed back', () => {
    vi.useFakeTimers()
    const queued: FrameRequestCallback[] = []
    let id = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queued.push(cb)
      return ++id
    })
    const run = () => {
      while (queued.length) queued.shift()!(0)
    }
    const { ref, bottom } = area()
    const { result } = renderHook(() => useStretchDrag(ref, () => {}))
    result.current.begin()
    result.current.frame(LAYOUT)
    run()
    result.current.end()
    result.current.settle()
    run()

    result.current.begin()
    expect(bottom.el.style.transform).toBe('')
    result.current.frame(LAYOUT)
    run()
    expect(bottom.el.style.transform).toBe('translate(0px, 20px)')
  })

  it('finishes a hand-back still running when the next drag begins', () => {
    vi.useFakeTimers()
    const queued: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queued.push(cb)
      return queued.length
    })
    const { ref, bottom } = area()
    const { result } = renderHook(() => useStretchDrag(ref, () => {}))
    result.current.begin()
    result.current.end()
    result.current.settle()
    // The second stage is still waiting for its frame when a drag begins.
    expect(bottom.stage.style.transform).not.toBe('')
    result.current.begin()
    expect(bottom.stage.style.transform).toBe('')
    expect(bottom.stage.style.width).toBe('400px')
  })
})

