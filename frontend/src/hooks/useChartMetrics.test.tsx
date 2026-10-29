import { describe, expect, it } from 'vitest'
import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { useChartMetrics } from './useChartMetrics'
import type { ChartMetrics } from '../utils/chart/chartData'
import type { SortBy } from '../types'

// `.tsx` for the DOM project: renderHook needs a document to mount into.
function setup(restored: ChartMetrics | undefined, sortBy: SortBy) {
  return renderHook(({ sort }: { sort: SortBy }) => useChartMetrics(restored, sort), {
    initialProps: { sort: sortBy },
    wrapper: StrictMode,
  })
}

describe('useChartMetrics', () => {
  it('opens on the ranking with one panel', () => {
    const { result } = setup(undefined, 'wind_max_mph')
    expect(result.current.metrics).toEqual(['wind'])
  })

  // A link's chart is the sender's: the ranking the session opens on is not a
  // new one, so the mount must not put the first slot back on it.
  it("keeps a link's slots through the mount", () => {
    const { result } = setup(['temp', 'aqi', 'wind', 'freeze'], 'precip_total_in')
    expect(result.current.metrics).toEqual(['temp', 'aqi', 'wind', 'freeze'])
  })

  it('follows a new ranking, swapping with the slot that held it', () => {
    const { result, rerender } = setup(['precip', 'temp', 'wind'], 'precip_total_in')
    rerender({ sort: 'wind_max_mph' })
    expect(result.current.metrics).toEqual(['wind', 'temp', 'precip'])
    rerender({ sort: 'aqi_max' })
    expect(result.current.metrics).toEqual(['aqi', 'temp', 'precip'])
  })

  it('picks, adds and removes, and keeps its setters', () => {
    const { result } = setup(undefined, 'precip_total_in')
    const { pick, add, remove } = result.current
    act(() => result.current.add())
    expect(result.current.metrics).toHaveLength(2)
    act(() => result.current.pick(1, 'temp'))
    expect(result.current.metrics).toEqual(['precip', 'temp'])
    act(() => result.current.pick(0, 'temp'))
    expect(result.current.metrics).toEqual(['temp', 'precip'])
    act(() => result.current.remove(1))
    expect(result.current.metrics).toEqual(['temp'])
    expect(result.current.pick).toBe(pick)
    expect(result.current.add).toBe(add)
    expect(result.current.remove).toBe(remove)
  })
})
