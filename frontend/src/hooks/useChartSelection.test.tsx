import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChartSelection } from './useChartSelection'
import { CHART_CHROME } from '../utils/chartColors'
import { resultRow } from '../testSupport/fixtures'
import type { DestinationResult } from '../types'

// `.tsx` for the DOM project: renderHook needs a document to mount into.
// Each row stands at its own coordinate, because the selection is keyed by it.

const RAINIER = resultRow({ name: 'Mount Rainier', latitude: 46.85, longitude: -121.76 })
const ADAMS = resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.49 })
const HOOD = resultRow({ name: 'Mount Hood', latitude: 45.37, longitude: -121.7 })

function setup(results: DestinationResult[]) {
  return renderHook((rows: DestinationResult[]) => useChartSelection(rows, 'aqi_max', 'dark'), {
    initialProps: results,
  })
}

const names = (rows: DestinationResult[]) => rows.map((r) => r.name)

describe('useChartSelection', () => {
  it('keeps a box unchecked when the next report brings the row back', () => {
    const { result, rerender } = setup([RAINIER, ADAMS])
    expect(names(result.current.selectedRows)).toEqual(['Mount Rainier', 'Mount Adams'])
    const rainierColor = result.current.colorFor(RAINIER)

    act(() => result.current.toggle(RAINIER))
    expect(result.current.isSelected(RAINIER)).toBe(false)
    expect(result.current.colorFor(RAINIER)).toBe(rainierColor)

    // A new array with the same two rows and one the chart has never seen: only
    // the newcomer debuts.
    rerender([{ ...RAINIER }, { ...ADAMS }, HOOD])
    expect(result.current.isSelected(RAINIER)).toBe(false)
    expect(names(result.current.selectedRows)).toEqual(['Mount Adams', 'Mount Hood'])

    act(() => result.current.toggle(RAINIER))
    expect(result.current.isSelected(RAINIER)).toBe(true)
    expect(result.current.colorFor(RAINIER)).toBe(rainierColor)
  })

  it('unchecks a shift-clicked run in one move', () => {
    const { result } = setup([RAINIER, ADAMS, HOOD])
    act(() => result.current.setRange([RAINIER, ADAMS], false))
    expect(names(result.current.selectedRows)).toEqual(['Mount Hood'])
  })

  it('draws a row the chart never charted in the unassigned colour', () => {
    const { result } = setup([RAINIER])
    expect(result.current.colorFor(HOOD)).toBe(CHART_CHROME.dark.unassigned)
  })
})
