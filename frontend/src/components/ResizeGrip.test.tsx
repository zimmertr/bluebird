import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import ResizeGrip from './ResizeGrip'
import { DOUBLE_PRESS_MS } from '../hooks/useGripDrag'
import { render } from '../testSupport/render'

// The bar between the results panels (#382). The gesture reads each event's
// timeStamp, so the clock is the test's: a double press is one the test times.
describe('ResizeGrip', () => {
  afterEach(() => vi.useRealTimers())

  it('reports a drag upward as positive, and a double press as a reset', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] })
    const handlers = { onReset: vi.fn(), onDragStart: vi.fn(), onDrag: vi.fn(), onDragEnd: vi.fn() }
    const { container } = render(<ResizeGrip {...handlers} />)
    const grip = container.firstElementChild as HTMLElement

    fireEvent.pointerDown(grip, { clientY: 500, pointerId: 1 })
    vi.advanceTimersByTime(100)
    fireEvent.pointerMove(document, { clientY: 470, pointerId: 1 })
    vi.advanceTimersByTime(100)
    fireEvent.pointerUp(document, { clientY: 470, pointerId: 1 })
    expect(handlers.onDragStart).toHaveBeenCalledTimes(1)
    expect(handlers.onDrag).toHaveBeenCalledWith(30, expect.any(Number))
    expect(handlers.onDragEnd).toHaveBeenCalledTimes(1)
    expect(handlers.onReset).not.toHaveBeenCalled()

    // The second press lands inside the window the first one opened.
    vi.advanceTimersByTime(DOUBLE_PRESS_MS - 250)
    fireEvent.pointerDown(grip, { clientY: 500, pointerId: 1 })
    expect(handlers.onReset).toHaveBeenCalledTimes(1)
    expect(handlers.onDragStart).toHaveBeenCalledTimes(1)
  })

  // A window can advertise pointerrawupdate and never send it, so a drag reads
  // pointermove until the first raw update, and the raw updates alone after.
  it('reads pointermove until a raw update arrives, then the raw updates alone', () => {
    const handlers = { onReset: vi.fn(), onDragStart: vi.fn(), onDrag: vi.fn(), onDragEnd: vi.fn() }
    const { container } = render(<ResizeGrip {...handlers} />)
    const grip = container.firstElementChild as HTMLElement
    const raw = (clientY: number) => {
      const ev = new MouseEvent('pointerrawupdate', { clientY, bubbles: true })
      document.dispatchEvent(ev)
    }

    fireEvent.pointerDown(grip, { clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(document, { clientY: 490, pointerId: 1 })
    expect(handlers.onDrag).toHaveBeenLastCalledWith(10, expect.any(Number))
    raw(480)
    expect(handlers.onDrag).toHaveBeenLastCalledWith(20, expect.any(Number))
    fireEvent.pointerMove(document, { clientY: 400, pointerId: 1 })
    expect(handlers.onDrag).toHaveBeenCalledTimes(2)
    fireEvent.pointerUp(document, { clientY: 480, pointerId: 1 })
  })
})
