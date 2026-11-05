import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DOUBLE_PRESS_MS } from '../utils/doublePress'
import { useGripDrag } from './useGripDrag'

// A press on a grip, as the handler sees it: a touch or a mouse, at a time.
function press(at: number, pointerType = 'touch') {
  return {
    timeStamp: at,
    pointerType,
    clientX: 100,
    clientY: 400,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent
}
const touchEnd = () => {
  const ev = new Event('touchend', { cancelable: true })
  document.dispatchEvent(ev)
  return ev.defaultPrevented
}
function handlers() {
  return { onReset: vi.fn(), onDragStart: vi.fn(), onDrag: vi.fn(), onDragEnd: vi.fn() }
}

// A touch's end is cancelled on every press (#837; record 0259): Firefox for
// Android synthesizes a tap's click on whatever stands under the finger when
// it lifts, and a double press that put the sheet back left the map there.
describe('useGripDrag and the touch that ends a press', () => {
  it("cancels a touch's end once, and only a touch's", () => {
    const h = handlers()
    const { result } = renderHook(() => useGripDrag(h))
    result.current(press(1000))
    expect(touchEnd()).toBe(true)
    // Once: the next touch anywhere is its own.
    expect(touchEnd()).toBe(false)
    document.dispatchEvent(new Event('pointerup'))
    result.current(press(5000, 'mouse'))
    expect(touchEnd()).toBe(false)
    document.dispatchEvent(new Event('pointerup'))
  })

  it('stands down when the touch is cancelled instead', () => {
    const { result } = renderHook(() => useGripDrag(handlers()))
    result.current(press(1000))
    document.dispatchEvent(new Event('touchcancel'))
    expect(touchEnd()).toBe(false)
    document.dispatchEvent(new Event('pointercancel'))
  })

  it('cancels the second tap of a double press too, and both presses', () => {
    const h = handlers()
    const { result } = renderHook(() => useGripDrag(h))
    const first = press(1000)
    result.current(first)
    expect(touchEnd()).toBe(true)
    document.dispatchEvent(new Event('pointerup'))
    const second = press(1000 + DOUBLE_PRESS_MS - 1)
    result.current(second)
    expect(h.onReset).toHaveBeenCalledOnce()
    expect(h.onDragStart).toHaveBeenCalledOnce()
    expect(first.preventDefault).toHaveBeenCalled()
    expect(second.preventDefault).toHaveBeenCalled()
    expect(touchEnd()).toBe(true)
  })
})
