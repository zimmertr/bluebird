import type { ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TimeSeriesChart from './TimeSeriesChart'
import { placeAt, render } from '../testSupport/render'
import { resultRow, series } from '../testSupport/fixtures'
import { CHART_GUST_DASH } from '../utils/chartColors'

// jsdom lays nothing out, so Recharts' ResponsiveContainer measures zero and
// draws no chart to click. What is under test is the chart's own click
// handler, so the LineChart is replaced by a stand-in that keeps the handler it
// was given, and the test calls it the way Recharts does: with the click state
// first and the React click event second.
const chart = vi.hoisted(() => ({
  onClick: undefined as undefined | ((state: unknown, event: unknown) => void),
  lines: [] as { dataKey: string; strokeDasharray?: string }[],
}))
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  const Nothing = () => null
  return {
    ResponsiveContainer: Pass,
    LineChart: (props: { onClick?: (state: unknown, event: unknown) => void; children?: ReactNode }) => {
      chart.onClick = props.onClick
      return <>{props.children}</>
    },
    CartesianGrid: Nothing,
    Line: (props: { dataKey: string; strokeDasharray?: string }) => {
      chart.lines.push({ dataKey: props.dataKey, strokeDasharray: props.strokeDasharray })
      return null
    },
    ReferenceLine: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  }
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
  return { times: TIMES, rows: ROWS, metric: 'aqi', onMetricChange: noop, colorFor, ...over }
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

// The Wind chart's dashed gust lines are drawn only while the report ranks by
// the gust (TJ, 2026-10-09, #584), and never under another chart metric.
describe('TimeSeriesChart gust lines', () => {
  const WIND_ROWS = [
    resultRow({
      name: 'Mount Alpha',
      series: series({ wind_mph: TIMES.map(() => 10), wind_gust_mph: TIMES.map(() => 25) }),
    }),
  ]
  const drawn = () => {
    const out = [...chart.lines]
    chart.lines.length = 0
    return out
  }

  it('draws a dashed gust beside each wind line when asked', () => {
    chart.lines.length = 0
    render(<TimeSeriesChart {...props({ rows: WIND_ROWS, metric: 'wind', showGust: true })} />)
    const lines = drawn()
    expect(lines.map((l) => l.dataKey)).toEqual(expect.arrayContaining([expect.stringMatching(/\|gust$/)]))
    expect(lines.filter((l) => l.strokeDasharray === CHART_GUST_DASH)).toHaveLength(1)
  })

  it('draws the sustained lines alone without a gust ranking, or under another metric', () => {
    chart.lines.length = 0
    render(<TimeSeriesChart {...props({ rows: WIND_ROWS, metric: 'wind', showGust: false })} />)
    expect(drawn().some((l) => l.dataKey.endsWith('|gust'))).toBe(false)
    render(<TimeSeriesChart {...props({ rows: WIND_ROWS, metric: 'temp', showGust: true })} />)
    expect(drawn().some((l) => l.dataKey.endsWith('|gust'))).toBe(false)
  })
})
