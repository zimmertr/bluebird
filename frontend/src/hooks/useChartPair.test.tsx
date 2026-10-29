import { describe, expect, it } from 'vitest'
import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { useChartPair } from './useChartPair'
import type { ChartMetricPair } from '../utils/chart/chartData'
import type { SortBy } from '../types'

// `.tsx` for the DOM project: renderHook needs a document to mount into.
function setup(restored: ChartMetricPair | undefined, sortBy: SortBy) {
  return renderHook(({ sort }: { sort: SortBy }) => useChartPair(restored, sort), {
    initialProps: { sort: sortBy },
    wrapper: StrictMode,
  })
}

describe('useChartPair', () => {
  it('opens on the ranking with one panel', () => {
    const { result } = setup(undefined, 'wind_max_mph')
    expect(result.current.pair).toEqual({ primary: 'wind', second: null })
  })

  // A link's chart is the sender's: the ranking the session opens on is not a
  // new one, so the mount must not put the primary back on it.
  it("keeps a link's pair through the mount", () => {
    const { result } = setup({ primary: 'temp', second: 'aqi' }, 'precip_total_in')
    expect(result.current.pair).toEqual({ primary: 'temp', second: 'aqi' })
  })

  it('follows a new ranking, swapping with the second slot', () => {
    const { result, rerender } = setup({ primary: 'precip', second: 'temp' }, 'precip_total_in')
    rerender({ sort: 'temp_max_f' })
    expect(result.current.pair).toEqual({ primary: 'temp', second: 'precip' })
    rerender({ sort: 'wind_max_mph' })
    expect(result.current.pair).toEqual({ primary: 'wind', second: 'precip' })
  })

  it('takes picks in either slot and keeps its setters', () => {
    const { result } = setup(undefined, 'precip_total_in')
    const { setPrimary, setSecond } = result.current
    act(() => result.current.setSecond('temp'))
    expect(result.current.pair).toEqual({ primary: 'precip', second: 'temp' })
    act(() => result.current.setPrimary('temp'))
    expect(result.current.pair).toEqual({ primary: 'temp', second: 'precip' })
    act(() => result.current.setSecond(null))
    expect(result.current.pair).toEqual({ primary: 'temp', second: null })
    expect(result.current.setPrimary).toBe(setPrimary)
    expect(result.current.setSecond).toBe(setSecond)
  })
})
