import type { ComponentProps, ReactNode } from 'react'
import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TimeSeriesChart from './TimeSeriesChart'
import { extremePoint } from '../utils/chartData'
import { CHART_EXTREME_COLOR } from '../utils/chartColors'
import { placeAt, render } from '../testSupport/render'
import { resultRow, series } from '../testSupport/fixtures'

// jsdom lays nothing out, so Recharts' ResponsiveContainer measures zero and
// draws no chart to click. What is under test is the chart's own click
// handler, so the LineChart is replaced by a stand-in that keeps the handler it
// was given, and the test calls it the way Recharts does: with the click state
// first and the React click event second.
//
// The extreme-hour ring stands in as an element carrying the props the chart
// gave it, so a test can read where each ring is and how it is drawn.
type Handler = (state: unknown, event?: unknown) => void
const chart = vi.hoisted(() => ({
  onClick: undefined as undefined | Handler,
  onMouseMove: undefined as undefined | Handler,
}))
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  const Nothing = () => null
  return {
    ResponsiveContainer: Pass,
    LineChart: (props: { onClick?: Handler; onMouseMove?: Handler; children?: ReactNode }) => {
      chart.onClick = props.onClick
      chart.onMouseMove = props.onMouseMove
      return <>{props.children}</>
    },
    CartesianGrid: Nothing,
    Line: Nothing,
    ReferenceDot: (p: { x: number; y: number; r: number; fill: string; stroke: string; label?: unknown }) => (
      <i
        data-testid="extreme-ring"
        data-x={p.x}
        data-y={p.y}
        data-fill={p.fill}
        data-stroke={p.stroke}
        data-label={p.label === undefined ? 'none' : 'some'}
      />
    ),
    ReferenceLine: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  }
})

// The real walk, counted, so a test can say how often the chart ran it and
// make it answer nothing once.
vi.mock('../utils/chartData', async (importOriginal) => {
  const real = await importOriginal<typeof import('../utils/chartData')>()
  return { ...real, extremePoint: vi.fn(real.extremePoint) }
})

type Props = ComponentProps<typeof TimeSeriesChart>

const HOUR = 3_600_000
const T0 = Date.UTC(2026, 8, 25, 7)
// Forty-eight hours, the grid the tap was measured on in the browser.
const TIMES = Array.from({ length: 48 }, (_, i) => T0 + i * HOUR)
const ROWS = [resultRow({ name: 'Mount Alpha', series: series({ aqi: TIMES.map(() => 30) }) })]
const colorFor = () => '#000000'
const noop = () => {}

function props(over: Partial<Props> = {}): Props {
  return {
    times: TIMES,
    rows: ROWS,
    metric: 'aqi',
    onMetricChange: noop,
    sortBy: 'aqi_avg',
    sortDesc: true,
    colorFor,
    ...over,
  }
}

// The plot div is the one the chart measures a tap against: the parent of the
// chart area, and the only child of the component's root after its toolbar.
function placePlot(container: HTMLElement, width: number) {
  const plot = container.firstElementChild!.lastElementChild!
  placeAt(plot, { left: 0, top: 460, width, height: 209 })
}

describe('TimeSeriesChart click', () => {
  beforeEach(() => {
    chart.onClick = undefined
  })

  it('lands a hover, then a click, on the hour Recharts named', () => {
    const onPlayheadChange = vi.fn()
    const { container } = render(<TimeSeriesChart {...props({ onPlayheadChange })} />)
    placePlot(container, 360)
    // The state and pixel a hover-then-click brought in the browser.
    chart.onClick!({ activeLabel: TIMES[15], activeTooltipIndex: '15' }, { clientX: 144 })
    expect(onPlayheadChange).toHaveBeenCalledWith(TIMES[15])
  })

  it('reads a second tap from its own pixel, not the label the first one left', () => {
    const onPlayheadChange = vi.fn()
    const { container } = render(<TimeSeriesChart {...props({ onPlayheadChange })} />)
    placePlot(container, 360)
    chart.onClick!({ activeLabel: TIMES[32], activeTooltipIndex: '32' }, { clientX: 144 })
    expect(onPlayheadChange).toHaveBeenCalledWith(TIMES[15])
  })

  it('falls back to the label for a click with no position', () => {
    const onPlayheadChange = vi.fn()
    render(<TimeSeriesChart {...props({ onPlayheadChange })} />)
    chart.onClick!({ activeLabel: TIMES[15] }, undefined)
    expect(onPlayheadChange).toHaveBeenCalledWith(TIMES[15])
  })

  it('seeks a tap with no hover to the hour under the tap', () => {
    const onPlayheadChange = vi.fn()
    const { container } = render(<TimeSeriesChart {...props({ onPlayheadChange })} />)
    placePlot(container, 360)
    // The state a tap brought in the browser: no label and no index.
    chart.onClick!({ activeTooltipIndex: null, isTooltipActive: false }, { clientX: 252 })
    // The band runs from 52 to 344 px, so 252 px is 200 / 292 of 47 hours,
    // 32.2, which snaps to hour 32.
    expect(onPlayheadChange).toHaveBeenCalledWith(TIMES[32])
  })

  it('does nothing when the click carries no position and no label', () => {
    const onPlayheadChange = vi.fn()
    const { container } = render(<TimeSeriesChart {...props({ onPlayheadChange })} />)
    placePlot(container, 360)
    chart.onClick!({}, undefined)
    expect(onPlayheadChange).not.toHaveBeenCalled()
  })

  it('takes no click at all with no playhead to move', () => {
    render(<TimeSeriesChart {...props()} />)
    expect(chart.onClick).toBeUndefined()
  })
})

describe('TimeSeriesChart extreme-hour ring', () => {
  // Two destinations' winds over the 48-hour grid: Alpha peaks at 75.4 mph in
  // hour 6, Beta bottoms out at 1 mph in hour 40.
  const alpha = resultRow({
    name: 'Mount Alpha',
    latitude: 46,
    series: series({ wind_mph: TIMES.map((_, i) => (i === 6 ? 75.4 : 20)), temp_f: TIMES.map(() => 30) }),
  })
  const beta = resultRow({
    name: 'Mount Beta',
    latitude: 47,
    series: series({ wind_mph: TIMES.map((_, i) => (i === 40 ? 1 : 30)), temp_f: TIMES.map((_, i) => (i === 3 ? 44 : 30)) }),
  })
  const WIND: Partial<Props> = { rows: [alpha, beta], metric: 'wind', sortBy: 'wind_avg_mph', sortDesc: true }

  function rings() {
    return screen.queryAllByTestId('extreme-ring').map((el) => ({
      x: Number(el.dataset.x),
      y: Number(el.dataset.y),
    }))
  }

  beforeEach(() => {
    vi.mocked(extremePoint).mockClear()
  })

  // The hover test gives the plot a height, which jsdom never does.
  let plotHeight: { mockRestore: () => void } | undefined
  afterEach(() => {
    plotHeight?.mockRestore()
    plotHeight = undefined
  })

  it('rings the one most extreme hour, hollow and unlabelled', () => {
    render(<TimeSeriesChart {...props(WIND)} />)
    expect(rings()).toEqual([{ x: TIMES[6], y: 75.4 }])
    const ring = screen.getByTestId('extreme-ring')
    expect(ring.dataset.fill).toBe('none')
    expect(ring.dataset.stroke).toBe(CHART_EXTREME_COLOR)
    expect(ring.dataset.label).toBe('none')
  })

  it('follows the ranking to the lowest hour, live', () => {
    const { rerender } = render(<TimeSeriesChart {...props(WIND)} />)
    rerender(<TimeSeriesChart {...props({ ...WIND, sortDesc: false })} />)
    expect(rings()).toEqual([{ x: TIMES[40], y: 1 }])
  })

  // Off the ranked family no direction was chosen, so the ring marks the
  // largest value even under a lowest-first ranking.
  it('rings the largest hour of a family the field is not ranked on', () => {
    render(<TimeSeriesChart {...props({ ...WIND, metric: 'temp', sortDesc: false })} />)
    expect(rings()).toEqual([{ x: TIMES[3], y: 44 }])
  })

  it('rings every point of a tie', () => {
    const twin = resultRow({ name: 'Mount Gamma', latitude: 48, series: alpha.series })
    render(<TimeSeriesChart {...props({ ...WIND, rows: [alpha, beta, twin] })} />)
    expect(rings()).toEqual([
      { x: TIMES[6], y: 75.4 },
      { x: TIMES[6], y: 75.4 },
    ])
  })

  it('draws no ring when extremePoint answers nothing', () => {
    vi.mocked(extremePoint).mockReturnValueOnce([])
    render(<TimeSeriesChart {...props(WIND)} />)
    expect(rings()).toEqual([])
  })

  // A hover changes the focused line and nothing the ring reads, so the walk
  // must not run again for it (#337's memo rule, held for the ring).
  it('does not walk the lines again on a hover', () => {
    plotHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(209)
    render(<TimeSeriesChart {...props(WIND)} />)
    expect(extremePoint).toHaveBeenCalledTimes(1)
    act(() => chart.onMouseMove!({ activeTooltipIndex: 6, chartY: 20 }))
    act(() => chart.onMouseMove!({ activeTooltipIndex: 40, chartY: 180 }))
    expect(extremePoint).toHaveBeenCalledTimes(1)
    expect(rings()).toEqual([{ x: TIMES[6], y: 75.4 }])
  })
})
