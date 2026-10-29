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
})
