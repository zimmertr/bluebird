import { afterEach, describe, expect, it } from 'vitest'
import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { useChartMetrics } from './useChartMetrics'
import type { ChartMetrics } from '../utils/chart/chartData'
import type { SortBy } from '../types'
import type { ChartLayout } from '../utils/chart/chartLayout'
import { readViewPrefs } from '../utils/viewPrefs'

// `.tsx` for the DOM project: renderHook needs a document to mount into.
function setup(restored: ChartMetrics | undefined, sortBy: SortBy, storedLayout: ChartLayout | null = null) {
  return renderHook(({ sort }: { sort: SortBy }) => useChartMetrics(restored, sort, storedLayout), {
    initialProps: { sort: sortBy },
    wrapper: StrictMode,
  })
}

afterEach(() => {
  localStorage.clear()
})

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
    const { pick, add, remove, move } = result.current
    act(() => result.current.add())
    expect(result.current.metrics).toHaveLength(2)
    act(() => result.current.pick(1, 'temp'))
    expect(result.current.metrics).toEqual(['precip', 'temp'])
    act(() => result.current.pick(0, 'temp'))
    expect(result.current.metrics).toEqual(['temp', 'precip'])
    act(() => result.current.add())
    act(() => result.current.move(2, 1))
    expect(result.current.metrics).toEqual(['temp', result.current.metrics[1], 'precip'])
    act(() => result.current.remove(2))
    act(() => result.current.remove(1))
    expect(result.current.metrics).toEqual(['temp'])
    expect(result.current.pick).toBe(pick)
    expect(result.current.add).toBe(add)
    expect(result.current.remove).toBe(remove)
    expect(result.current.move).toBe(move)
  })

  // The Metrics table's chart toggles (record 0290) move the same list the
  // chart's pickers do, and the press keeps its identity for the panel.
  it("draws and takes away the Metrics table's chart toggles", () => {
    const { result } = setup(undefined, 'precip_total_in')
    const { chart } = result.current
    act(() => result.current.chart(['temp', 'wind'], true))
    expect(result.current.metrics).toEqual(['precip', 'temp', 'wind'])
    act(() => result.current.chart(['precip', 'temp'], false))
    expect(result.current.metrics).toEqual(['precip', 'wind'])
    expect(result.current.chart).toBe(chart)
  })

  // The arrangement is this browser's habit (#864): it opens on what the
  // browser kept, never on a link, and a pick is kept for the next visit.
  it('opens on the layout this browser kept, and keeps a new pick', () => {
    const { result } = setup(undefined, 'precip_total_in', '2x2')
    expect(result.current.layout).toBe('2x2')
    act(() => result.current.setLayout('row'))
    expect(result.current.layout).toBe('row')
    expect(readViewPrefs().chartLayout).toBe('row')
  })

  it('keeps nothing while nobody has picked a layout', () => {
    const { result } = setup(undefined, 'precip_total_in')
    expect(result.current.layout).toBeNull()
    expect(readViewPrefs().chartLayout).toBeNull()
  })
})
