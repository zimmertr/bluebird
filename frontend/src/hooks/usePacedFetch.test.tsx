import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePacedFetch } from './usePacedFetch'

// The countdown's wording and arithmetic are `utils/pacing.ts`'s; this holds
// the tick that keeps the number moving and stops once the wait is over.
describe('usePacedFetch', () => {
  afterEach(() => vi.useRealTimers())

  it('counts a pacer wait down a second at a time and stops when cleared', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePacedFetch())
    expect(result.current.paceRemainingS).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    act(() => result.current.onPace(5))
    expect(result.current.paceRemainingS).toBe(5)
    // No prop changes and nothing else renders it: the tick alone moves it.
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.paceRemainingS).toBe(3)

    act(() => result.current.clear())
    expect(result.current.paceRemainingS).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
