import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChartBox, type ChartInputs } from './useChartBox'
import { resultRow, series } from '../testSupport/fixtures'

// `.tsx` for the DOM project: renderHook needs a document to mount into.

const RAINIER = resultRow({ name: 'Mount Rainier', latitude: 46.85, longitude: -121.76, series: series() })
const ADAMS = resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.49, series: series() })
const HOOD = resultRow({ name: 'Mount Hood', latitude: 45.37, longitude: -121.7, series: series() })
const ROWS = [RAINIER, ADAMS, HOOD]
const NONE = () => false

function setup(over: Partial<ChartInputs> = {}) {
  const inputs: ChartInputs = {
    results: ROWS,
    isCharted: NONE,
    onChartRange: vi.fn(),
    onToggleChart: vi.fn(),
    ...over,
  }
  const hook = renderHook((props: ChartInputs) => useChartBox(props), { initialProps: inputs })
  // A click, as the row's checkbox reports it: the shift state, then the change.
  const click = (row: typeof RAINIER, shift = false) =>
    act(() => {
      hook.result.current.onShift(shift)
      hook.result.current.onToggle(row)
    })
  return { ...hook, inputs, click }
}

describe('useChartBox', () => {
  it('keeps one identity across renders with new inputs', () => {
    const { result, rerender } = setup()
    const first = result.current
    rerender({ results: [HOOD, ADAMS, RAINIER], isCharted: () => true, onToggleChart: vi.fn() })
    expect(result.current).toBe(first)
  })

  it('toggles the one row a plain click lands on', () => {
    const { inputs, click } = setup()
    click(ADAMS)
    expect(inputs.onToggleChart).toHaveBeenCalledWith(ADAMS)
    expect(inputs.onChartRange).not.toHaveBeenCalled()
  })

  it('selects the run between the anchor and a shift-click', () => {
    const { inputs, click } = setup()
    click(RAINIER)
    click(HOOD, true)
    expect(inputs.onChartRange).toHaveBeenCalledWith(ROWS, true)
  })

  it('clears the run when the shift-clicked row was charted', () => {
    const { inputs, click } = setup({ isCharted: (r) => r === HOOD })
    click(RAINIER)
    click(HOOD, true)
    expect(inputs.onChartRange).toHaveBeenCalledWith(ROWS, false)
  })

  it('forgets the shift once a click has read it', () => {
    const { inputs, click, result } = setup()
    click(RAINIER)
    click(HOOD, true)
    // A change with no click reported before it, so only the reset can clear the shift.
    act(() => result.current.onToggle(ADAMS))
    expect(inputs.onChartRange).toHaveBeenCalledTimes(1)
    expect(inputs.onToggleChart).toHaveBeenLastCalledWith(ADAMS)
  })

  it('toggles the one row when the run holds no row with series', () => {
    const bare = ROWS.map((r) => ({ ...r, series: null }))
    const { inputs, click } = setup({ results: bare })
    click(bare[0])
    click(bare[2], true)
    expect(inputs.onChartRange).not.toHaveBeenCalled()
    expect(inputs.onToggleChart).toHaveBeenLastCalledWith(bare[2])
  })

  it('reads the run in the order of the latest render', () => {
    const { inputs, click, rerender } = setup()
    click(RAINIER)
    rerender({ ...inputs, results: [RAINIER, HOOD, ADAMS] })
    click(HOOD, true)
    expect(inputs.onChartRange).toHaveBeenCalledWith([RAINIER, HOOD], true)
  })
})
