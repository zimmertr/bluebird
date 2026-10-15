import type { ComponentProps, ReactNode } from 'react'
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TimeSeriesChart from './TimeSeriesChart'
import { CHART_METRICS, extremeValue } from '../utils/chartData'
import { CHART_CHROME } from '../utils/chartColors'
import { PLOT_MARGIN, TITLED_PLOT_MARGIN } from '../utils/chartPointer'
import { CHART_TITLE } from '../styles'
import { placeAt, render } from '../testSupport/render'
import { resultRow, series } from '../testSupport/fixtures'

// jsdom lays nothing out, so Recharts' ResponsiveContainer measures zero and
// draws no chart to click. What is under test is the chart's own click
// handler, so the LineChart is replaced by a stand-in that keeps the handler it
// was given, and the test calls it the way Recharts does: with the click state
// first and the React click event second.
//
// Every reference line stands in as an element carrying the props the chart
// gave it, so a test can read where each one is and how it is drawn, and a
// label's own content component is kept so a test can render it.
type Handler = (state: unknown, event?: unknown) => void
interface LineProps {
  x?: number
  y?: number
  stroke?: string
  strokeDasharray?: string
  strokeWidth?: number
  label?: {
    value: string
    position: string
    fill: string
    fontSize: number
    stroke?: string
    strokeWidth?: number
    paintOrder?: string
    content?: unknown
  }
}
const chart = vi.hoisted(() => ({
  onClick: undefined as undefined | Handler,
  onMouseMove: undefined as undefined | Handler,
  lines: [] as unknown[],
  margin: undefined as unknown,
}))
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  const Nothing = () => null
  return {
    ResponsiveContainer: Pass,
    LineChart: (props: { onClick?: Handler; onMouseMove?: Handler; margin?: unknown; children?: ReactNode }) => {
      chart.margin = props.margin
      chart.onClick = props.onClick
      chart.onMouseMove = props.onMouseMove
      return <>{props.children}</>
    },
    CartesianGrid: Nothing,
    Line: Nothing,
    Label: (p: { position: string; value: string; paintOrder?: string; stroke?: string }) => (
      <i data-testid="label" data-position={p.position} data-paint-order={p.paintOrder} data-stroke={p.stroke}>
        {p.value}
      </i>
    ),
    ReferenceLine: (p: LineProps) => {
      chart.lines.push(p)
      return <i data-testid={p.y === undefined ? 'x-line' : 'extreme-line'} data-y={p.y} />
    },
    Tooltip: (p: { defaultIndex?: number; active?: boolean }) => (
      <i data-testid="tooltip" data-index={String(p.defaultIndex)} data-active={String(p.active)} />
    ),
    XAxis: Nothing,
    YAxis: Nothing,
  }
})

// The real walk, counted, so a test can say how often the chart ran it.
vi.mock('../utils/chartData', async (importOriginal) => {
  const real = await importOriginal<typeof import('../utils/chartData')>()
  return { ...real, extremeValue: vi.fn(real.extremeValue) }
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
// chart area, the last child of the box after the toolbar, beside a phone's
// title when there is one.
function plotIn(container: HTMLElement): HTMLElement {
  return container.firstElementChild!.lastElementChild!.lastElementChild as HTMLElement
}
function placePlot(container: HTMLElement, width: number) {
  const plot = plotIn(container)
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

  // Chrome moves a tap's click toward a clickable node near the finger, so the
  // click's own pixel can be an hour off the finger's (#696). The finger's
  // press wins.
  it('names the hour where a tapping finger went down, not where the tap\'s click landed', () => {
    const onPlayheadChange = vi.fn()
    const { container } = render(<TimeSeriesChart {...props({ onPlayheadChange })} />)
    placePlot(container, 360)
    fireEvent.pointerDown(plotIn(container), { pointerType: 'touch', clientX: 252, clientY: 560 })
    chart.onClick!({ activeTooltipIndex: null }, { clientX: 245 })
    expect(onPlayheadChange).toHaveBeenLastCalledWith(TIMES[32])
    // Used once: a later click with no finger reads its own pixel.
    chart.onClick!({}, { clientX: 144 })
    expect(onPlayheadChange).toHaveBeenLastCalledWith(TIMES[15])
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

// A finger reads the hour under it as a resting mouse does (#336; record
// 0144): the tooltip shows that hour, a sideways drag keeps reading, and the
// browser taking the pointer for a vertical scroll drops the reading.
describe('TimeSeriesChart under a finger', () => {
  const plotOf = plotIn
  const tip = () => screen.getByTestId('tooltip').dataset

  it('shows the hour under a touch, follows a drag, and lets go on a cancel', () => {
    const { container } = render(<TimeSeriesChart {...props()} />)
    placePlot(container, 360)
    expect(tip().active).toBe('undefined')
    // 252 px is hour 32, as the click's own test works out.
    fireEvent.pointerDown(plotOf(container), { pointerType: 'touch', clientX: 252, clientY: 560 })
    expect(tip()).toMatchObject({ index: '32', active: 'true' })
    fireEvent.pointerMove(plotOf(container), { pointerType: 'touch', clientX: 52, clientY: 560 })
    expect(tip().index).toBe('0')
    fireEvent.pointerCancel(plotOf(container), { pointerType: 'touch' })
    expect(tip().active).toBe('undefined')
  })

  it('leaves a mouse to Recharts', () => {
    const { container } = render(<TimeSeriesChart {...props()} />)
    placePlot(container, 360)
    fireEvent.pointerMove(plotOf(container), { pointerType: 'mouse', clientX: 252, clientY: 560 })
    expect(tip().active).toBe('undefined')
  })

  it('gives the tutorial\'s hour the floor over a finger\'s', () => {
    const { container } = render(<TimeSeriesChart {...props({ tooltipIndex: 5 })} />)
    placePlot(container, 360)
    fireEvent.pointerDown(plotOf(container), { pointerType: 'touch', clientX: 252, clientY: 560 })
    expect(tip().index).toBe('5')
  })

  it('lets the tutorial\'s hour go when the tour does', () => {
    // A tour ended on the Chart card leaves the reader's chart showing its
    // lines, not a readout the reader never asked for (#696).
    const { rerender } = render(<TimeSeriesChart {...props({ tooltipIndex: 6 })} />)
    expect(tip()).toMatchObject({ index: '6', active: 'true' })
    rerender(<TimeSeriesChart {...props({ tooltipIndex: null })} />)
    expect(tip().active).toBe('undefined')
  })

  it('hands the vertical pan to the browser', () => {
    const { container } = render(<TimeSeriesChart {...props()} />)
    expect(plotOf(container).className).toContain('touch-pan-y')
  })
})

describe('TimeSeriesChart extreme line', () => {
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
    series: series({
      wind_mph: TIMES.map((_, i) => (i === 40 ? 1 : 30)),
      temp_f: TIMES.map((_, i) => (i === 3 ? 44 : 30)),
      precip_in: TIMES.map(() => 0),
    }),
  })
  const WIND: Partial<Props> = { rows: [alpha, beta], metric: 'wind', sortBy: 'wind_avg_mph', sortDesc: true }

  // The extreme line as drawn: its height and its label's text.
  function extremeLines() {
    return (chart.lines as LineProps[])
      .filter((p) => p.y !== undefined)
      .map((p) => ({ y: p.y, label: p.label?.value }))
  }
  // Only the lines from the last render, since every render records again.
  function renderChart(over: Partial<Props>) {
    chart.lines = []
    return render(<TimeSeriesChart {...props(over)} />)
  }

  beforeEach(() => {
    vi.mocked(extremeValue).mockClear()
    chart.lines = []
  })

  // The hover test gives the plot a height, which jsdom never does.
  let plotHeight: { mockRestore: () => void } | undefined
  afterEach(() => {
    plotHeight?.mockRestore()
    plotHeight = undefined
  })

  it('draws one line at the most extreme value, labelled with it', () => {
    renderChart(WIND)
    expect(screen.getAllByTestId('extreme-line')).toHaveLength(1)
    expect(extremeLines()).toEqual([{ y: 75.4, label: '75.4 mph' }])
  })

  // The same stroke, dash and label type as a model's end line, which is
  // drawn exactly as the Now seam is.
  it('wears the Now seam’s style', () => {
    renderChart({ ...WIND, modelEnds: [{ label: 'NOAA HRRR', endMs: TIMES[30] }] })
    const [seam] = (chart.lines as LineProps[]).filter((p) => p.x !== undefined)
    const [extreme] = (chart.lines as LineProps[]).filter((p) => p.y !== undefined)
    expect(extreme.stroke).toBe(seam.stroke)
    expect(extreme.strokeDasharray).toBe(seam.strokeDasharray)
    expect(extreme.strokeWidth).toBe(seam.strokeWidth)
    expect(extreme.label?.fill).toBe(seam.label?.fill)
    expect(extreme.label?.fontSize).toBe(seam.label?.fontSize)
  })

  it('follows the ranking to the lowest value, live', () => {
    const { rerender } = renderChart(WIND)
    chart.lines = []
    rerender(<TimeSeriesChart {...props({ ...WIND, sortDesc: false })} />)
    expect(extremeLines()).toEqual([{ y: 1, label: '1.0 mph' }])
  })

  // Off the ranked family no direction was chosen, so the line marks the
  // largest value even under a lowest-first ranking.
  it('marks the largest value of a family the field is not ranked on', () => {
    renderChart({ ...WIND, metric: 'temp', sortDesc: false })
    expect(extremeLines()).toEqual([{ y: 44, label: '44.0 °F' }])
  })

  it('draws no line when nothing has a value', () => {
    renderChart({ ...WIND, metric: 'freeze' })
    expect(screen.queryByTestId('extreme-line')).toBeNull()
  })

  // A dry window has no wettest hour worth marking.
  it('draws no line at a zero that means none', () => {
    renderChart({ ...WIND, metric: 'precip', sortBy: 'precip_total_in', sortDesc: false })
    expect(screen.queryByTestId('extreme-line')).toBeNull()
  })

  // The label flips from above its line to below it in the top headroom,
  // decided where Recharts knows the line's pixel height.
  it('places its label by the room over the line', () => {
    renderChart(WIND)
    const [extreme] = (chart.lines as LineProps[]).filter((p) => p.y !== undefined)
    const Content = extreme.label!.content as (p: object) => ReactNode
    const at = (y: number) => {
      const { unmount } = render(<>{Content({ ...extreme.label, viewBox: { x: 52, y, width: 292, height: 0 } })}</>)
      const position = screen.getByTestId('label').dataset.position
      unmount()
      return position
    }
    expect(at(120)).toBe('insideBottomRight')
    expect(at(12)).toBe('insideTopRight')
  })

  // Every chrome label reads over a series line crossing it: a halo in the
  // panel's colour, painted under the letters. Now, a model's end and the
  // extreme value share one label, so all three carry it, and the extreme
  // value's keeps it through the flip.
  it('halos every chrome label in the panel colour', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TIMES[20])
    try {
      renderChart({ ...WIND, modelEnds: [{ label: 'NOAA HRRR', endMs: TIMES[30] }] })
    } finally {
      vi.useRealTimers()
    }
    const labels = (chart.lines as LineProps[]).map((p) => p.label)
    expect(labels.map((l) => l?.value)).toEqual(['Now', 'NOAA HRRR', '75.4 mph'])
    for (const label of labels) {
      expect(label?.stroke, label?.value).toBe(CHART_CHROME.dark.surface)
      expect(label?.strokeWidth, label?.value).toBe(3)
      expect(label?.paintOrder, label?.value).toBe('stroke')
    }
    const [extreme] = (chart.lines as LineProps[]).filter((p) => p.y !== undefined)
    const Content = extreme.label!.content as (p: object) => ReactNode
    render(<>{Content({ ...extreme.label, viewBox: { x: 52, y: 120, width: 292, height: 0 } })}</>)
    const drawn = screen.getByTestId('label')
    expect(drawn.dataset.paintOrder).toBe('stroke')
    expect(drawn.dataset.stroke).toBe(CHART_CHROME.dark.surface)
  })

  // A hover changes the focused line and nothing the extreme reads, so the
  // walk must not run again for it (#337's memo rule, held for this line).
  it('does not walk the lines again on a hover', () => {
    plotHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(209)
    renderChart(WIND)
    expect(extremeValue).toHaveBeenCalledTimes(1)
    act(() => chart.onMouseMove!({ activeTooltipIndex: 6, chartY: 20 }))
    act(() => chart.onMouseMove!({ activeTooltipIndex: 40, chartY: 180 }))
    expect(extremeValue).toHaveBeenCalledTimes(1)
    expect(screen.getAllByTestId('extreme-line')).toHaveLength(1)
  })
})

// A phone's picker is the plot's title (#696; record 0149): no row above the
// plot, the native select laid over the metric's name, and the plot's margin
// inset by the title's line, so a finger reads the same band Recharts draws.
describe('TimeSeriesChart on a phone', () => {
  it('stands the select in the title, under its name, with no row above the plot', () => {
    const { container } = render(<TimeSeriesChart {...props({ titled: true, metric: 'temp' })} />)
    const select = screen.getByRole('combobox', { name: 'Chart metric' })
    const title = select.parentElement!
    expect(title.className).toBe(CHART_TITLE.box)
    expect(select.className).toBe(CHART_TITLE.select)
    expect(title.textContent).toContain(CHART_METRICS.find((m) => m.key === 'temp')!.label)
    // The root holds the plot's box alone: the row is gone.
    expect(container.firstElementChild!.children).toHaveLength(1)
    expect(chart.margin).toEqual(TITLED_PLOT_MARGIN)
  })

  it('keeps the row for a comparison note, without the select in it', () => {
    const { container } = render(<TimeSeriesChart {...props({ titled: true, controls: <p>note</p> })} />)
    expect(container.firstElementChild!.children).toHaveLength(2)
    expect(container.firstElementChild!.firstElementChild!.querySelector('select')).toBeNull()
    expect(screen.getAllByRole('combobox', { name: 'Chart metric' })).toHaveLength(1)
  })

  it('stands the select in its row at a desk, the plot at the plain margins', () => {
    const { container } = render(<TimeSeriesChart {...props()} />)
    expect(container.firstElementChild!.children).toHaveLength(2)
    expect(container.querySelector(`.${CSS.escape('has-[select:focus-visible]:outline-2')}`)).toBeNull()
    expect(chart.margin).toEqual(PLOT_MARGIN)
  })

  it('reads a finger against the titled band', () => {
    const { container } = render(<TimeSeriesChart {...props({ titled: true })} />)
    placePlot(container, 360)
    fireEvent.pointerDown(plotIn(container), { pointerType: 'touch', clientX: 252, clientY: 560 })
    expect(screen.getByTestId('tooltip').dataset.index).toBe('32')
  })
})
