import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useHeldYoung } from './useHeldYoung'
import { FORECAST_REUSE_MS } from '../utils/forecastReuse'

afterEach(() => vi.useRealTimers())

describe('useHeldYoung', () => {
  it('holds nothing young with nothing held', () => {
    const { result } = renderHook(() => useHeldYoung(null))
    expect(result.current).toBe(false)
  })

  // The button counts on the held field until it ages out, and turns on its
  // own at that moment rather than at the next render something else causes.
  it('turns old the moment the reuse window closes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const { result } = renderHook(() => useHeldYoung(1_000_000))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(FORECAST_REUSE_MS - 1))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })
})
