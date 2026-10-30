import type { ComponentProps, ReactNode } from 'react'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TimeSeriesChart from './TimeSeriesChart'
import { CHART_METRICS, extremeValue } from '../utils/chart/chartData'
import { CHROME, CROWDED_PAST, LINE_DRAW } from '../utils/chart/chartColors'
import { PLOT_MARGIN, TITLED_PLOT_MARGIN } from '../utils/chart/chartPointer'
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
  // Every series `Line` the chart drew, in the order it drew them, and the
  // readout's content renderer.
  series: [] as Record<string, unknown>[],
  tooltipContent: undefined as undefined | ((props: unknown) => ReactNode),
  margin: undefined as unknown,
  // Every LineChart, XAxis and Tooltip drawn, in order, so a two-panel test
  // can read each panel's (#499).
  charts: [] as { onClick?: Handler; onMouseMove?: Handler; syncId?: string }[],
  xAxes: [] as { hide?: boolean; height?: number }[],
  tooltips: [] as ((props: unknown) => ReactNode)[],
  tooltipProps: [] as { allowEscapeViewBox?: unknown; wrapperStyle?: unknown }[],
  grip: undefined as undefined | { onReset: () => void; onDragStart: () => void; onDrag: (px: number) => void; onDragEnd: () => void },
}))
// The grip's handlers, kept so a test can drag it without a pointer.
vi.mock('./ResizeGrip', async (importOriginal) => ({
  GridGutter: (await importOriginal<typeof import('./ResizeGrip')>()).GridGutter,
  default: (p: NonNullable<typeof chart.grip>) => {
    chart.grip = p
    return <i data-testid="split-grip" />
  },
}))
// The canvas lines (record 0244): every stroke the panel hands it, kept in the
// order drawn, as the mock above kept every Recharts Line.
vi.mock('./ChartLines', () => ({
  default: (p: { strokes: Record<string, unknown>[] }) => {
    chart.series.push(...p.strokes)
    return null
  },
}))
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  const Nothing = () => null
  return {
    ResponsiveContainer: Pass,
    LineChart: (props: { onClick?: Handler; onMouseMove?: Handler; margin?: unknown; syncId?: string; children?: ReactNode }) => {
      chart.charts.push(props)
      chart.margin = props.margin
      chart.onClick = props.onClick
      chart.onMouseMove = props.onMouseMove
      return <>{props.children}</>
    },
    CartesianGrid: Nothing,
    // The one unpainted anchor line; the series are the canvas's strokes.
    Line: () => null,
    Label: (p: { position: string; value: string; paintOrder?: string; stroke?: string }) => (
      <i data-testid="label" data-position={p.position} data-paint-order={p.paintOrder} data-stroke={p.stroke}>
        {p.value}
      </i>
    ),
    ReferenceLine: (p: LineProps) => {
      chart.lines.push(p)
      return <i data-testid={p.y === undefined ? 'x-line' : 'extreme-line'} data-y={p.y} />
    },
    Tooltip: (p: { defaultIndex?: number; active?: boolean; allowEscapeViewBox?: unknown; wrapperStyle?: unknown; content?: (props: unknown) => ReactNode }) => {
      chart.tooltipProps.push(p)
      chart.tooltipContent = p.content
      if (p.content) chart.tooltips.push(p.content)
      return <i data-testid="tooltip" data-index={String(p.defaultIndex)} data-active={String(p.active)} />
    },
    XAxis: (p: { hide?: boolean; height?: number }) => {
      chart.xAxes.push(p)
      return null
    },
    YAxis: Nothing,
  }
})

// The real walk, counted, so a test can say how often the chart ran it.
vi.mock('../utils/chart/chartData', async (importOriginal) => {
  const real = await importOriginal<typeof import('../utils/chart/chartData')>()
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

// The chart draws a Now seam from the clock. A month after TIMES there is
// none, so a test sees the same lines whatever day it runs; one that wants the
// seam moves the clock into the window itself.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0 + 30 * 24 * HOUR)
})
afterEach(() => {
  vi.useRealTimers()
})

function props(over: Partial<Props> = {}): Props {
  return {
    times: TIMES,
    rows: ROWS,
    metrics: ['aqi'],
    onPick: noop,
    onAdd: noop,
    onRemove: noop,
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

  it('reads a tap from its own pixel over a stale label', () => {
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
  const WIND: Partial<Props> = { rows: [alpha, beta], metrics: ['wind'], sortBy: 'wind_avg_mph', sortDesc: true }

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
    renderChart({ ...WIND, metrics: ['temp'], sortDesc: false })
    expect(extremeLines()).toEqual([{ y: 44, label: '44.0 °F' }])
  })

  it('draws no line when nothing has a value', () => {
    renderChart({ ...WIND, metrics: ['freeze'] })
    expect(screen.queryByTestId('extreme-line')).toBeNull()
  })

  // A dry window has no wettest hour worth marking.
  it('draws no line at a zero that means none', () => {
    renderChart({ ...WIND, metrics: ['precip'], sortBy: 'precip_total_in', sortDesc: false })
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
    vi.setSystemTime(TIMES[20])
    renderChart({ ...WIND, modelEnds: [{ label: 'NOAA HRRR', endMs: TIMES[30] }] })
    const labels = (chart.lines as LineProps[]).map((p) => p.label)
    expect(labels.map((l) => l?.value)).toEqual(['Now', 'NOAA HRRR', '75.4 mph'])
    for (const label of labels) {
      expect(label?.stroke, label?.value).toBe(CHROME.surface)
      expect(label?.strokeWidth, label?.value).toBe(3)
      expect(label?.paintOrder, label?.value).toBe('stroke')
    }
    const [extreme] = (chart.lines as LineProps[]).filter((p) => p.y !== undefined)
    const Content = extreme.label!.content as (p: object) => ReactNode
    render(<>{Content({ ...extreme.label, viewBox: { x: 52, y: 120, width: 292, height: 0 } })}</>)
    const drawn = screen.getByTestId('label')
    expect(drawn.dataset.paintOrder).toBe('stroke')
    expect(drawn.dataset.stroke).toBe(CHROME.surface)
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
    const { container } = render(<TimeSeriesChart {...props({ titled: true, metrics: ['temp'] })} />)
    const select = screen.getByRole('combobox', { name: 'Chart metric' })
    const title = select.parentElement!
    // In the title's line, with the + after it (#499).
    expect(title.className).toBe(CHART_TITLE.box)
    expect(title.parentElement!.className).toBe(CHART_TITLE.bar)
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

// A crag and the peak it is named for are two lines of one name (#715), so
// each line names its type while both are on screen, and a line no other
// place shares a name with reads as it always did.
describe('TimeSeriesChart line names', () => {
  beforeEach(() => {
    chart.series = []
  })

  it('names the type on both lines of a shared name and leaves the rest bare', () => {
    const rows = [
      resultRow({ name: 'The Tooth', type: 'peak', latitude: 47.41, series: series() }),
      resultRow({ name: 'The Tooth', type: 'crag', latitude: 47.4108, series: series() }),
      resultRow({ name: 'Mount Alpha', latitude: 47.5, series: series() }),
    ]
    render(<TimeSeriesChart {...props({ rows, sharedNames: new Set(['The Tooth']) })} />)
    expect(new Set(chart.series.map((p) => p.name))).toEqual(new Set(['The Tooth (Peak)', 'The Tooth (Crag)', 'Mount Alpha']))
  })
})

// Every line colour stands 3:1 off the panel by itself in both themes (#801),
// so nothing the chart draws in a line's colour wears an edge: no filter over
// the lines, no stroke round a dot, no outline round a swatch.
describe('TimeSeriesChart line marks', () => {
  const COLOR = '#d25645'
  const TWO = [
    resultRow({ name: 'Mount Alpha', latitude: 46, longitude: -121, series: series({ aqi: TIMES.map(() => 30) }) }),
    resultRow({ name: 'Mount Beta', latitude: 47, longitude: -121, series: series({ aqi: TIMES.map(() => 40) }) }),
  ]
  beforeEach(() => {
    chart.series = []
    chart.lines = []
    chart.tooltipContent = undefined
  })

  // The lines and the extreme line share Recharts' own line layer, where the
  // extreme line, drawn after the lines, stays whole over them.
  it('draws the lines in Recharts\' own layer, under no filter', () => {
    const { container } = render(<TimeSeriesChart {...props({ rows: TWO, colorFor: () => COLOR })} />)
    expect(chart.series).toHaveLength(2)
    for (const line of chart.series) expect(line.zIndex).toBeUndefined()
    expect(container.querySelector('filter')).toBeNull()
    // The hovered hour's dot is Recharts' own.
    expect(chart.series[0].activeDot).toBeUndefined()
    const extreme = (chart.lines as LineProps[] & { zIndex?: number }[]).find((l) => l.y !== undefined) as { zIndex?: number }
    expect(extreme.zIndex).toBeUndefined()
  })

  // Up to thirty lines every line is 1.5px; past thirty each is 1px, and
  // every one stays at full strength (#801).
  it('thins every line once the chart holds more than thirty', () => {
    render(<TimeSeriesChart {...props({ rows: TWO, colorFor: () => COLOR })} />)
    for (const line of chart.series) expect([line.strokeWidth, line.strokeOpacity]).toEqual([LINE_DRAW.width, 1])
    const crowd = Array.from({ length: CROWDED_PAST + 1 }, (_, i) =>
      resultRow({ name: `Peak ${i}`, latitude: 46 + i / 10, longitude: -121, series: series({ aqi: TIMES.map(() => 30 + i) }) }),
    )
    chart.series = []
    render(<TimeSeriesChart {...props({ rows: crowd, colorFor: () => COLOR })} />)
    expect(chart.series).toHaveLength(CROWDED_PAST + 1)
    for (const line of chart.series) expect([line.strokeWidth, line.strokeOpacity]).toEqual([LINE_DRAW.crowdedWidth, 1])
  })

  // A point sample draws dots and no segment: each is its line's colour, filled.
  it('fills a point sample\'s dots with no stroke', () => {
    const point = [T0]
    const row = resultRow({ name: 'Mount Alpha', series: series({ aqi: [30] }) })
    render(<TimeSeriesChart {...props({ times: point, rows: [row], colorFor: () => COLOR })} />)
    expect(chart.series[0].dot).toMatchObject({ stroke: 'none', fill: COLOR })
  })

  function readout() {
    const { container } = render(<TimeSeriesChart {...props({ rows: TWO, colorFor: () => COLOR })} />)
    // Room for every line, so the card lists them all rather than a count.
    Object.defineProperty(plotIn(container), 'clientHeight', { value: 400 })
    const payload = chart.series.map((p) => ({ dataKey: p.dataKey as string, value: 30 }))
    render(<>{chart.tooltipContent!({ active: true, payload, label: T0 })}</>)
    // The swatch stands just before the name, which truncates in a span of its own (#499).
    return screen.getAllByText(/Mount (Alpha|Beta)/).map((name) => name.previousElementSibling as HTMLElement)
  }

  it('paints a readout swatch in its line colour, with no outline', () => {
    const swatches = readout()
    expect(swatches).toHaveLength(2)
    for (const swatch of swatches) {
      expect(swatch.style.backgroundColor).toBe('rgb(210, 86, 69)')
      expect(swatch.className).not.toMatch(/(^|\s)outline/)
    }
  })
})

// More than one metric (#499): two stack on one time axis, three and four
// stand in a grid, and one card reads them all.
describe('TimeSeriesChart with more than one metric', () => {
  const T = 3
  const alpha = resultRow({
    name: 'Sahale Mountain',
    latitude: 48,
    series: series({
      precip_in: TIMES.map((_, i) => (i === T ? 0.05 : 0)),
      temp_f: TIMES.map((_, i) => (i === T ? 38.9 : 30)),
    }),
  })
  const beta = resultRow({
    name: 'Mount Beta',
    latitude: 47,
    series: series({ precip_in: TIMES.map(() => 0.2), temp_f: TIMES.map(() => null) }),
  })
  const TWO: Partial<Props> = { rows: [alpha, beta], metrics: ['precip', 'temp'], sortBy: 'precip_total_in' }
  const FOUR: Partial<Props> = { ...TWO, metrics: ['precip', 'temp', 'wind', 'aqi'] }
  let height: { mockRestore: () => void } | undefined
  let width: { mockRestore: () => void } | undefined

  beforeEach(() => {
    chart.charts = []
    chart.xAxes = []
    chart.tooltips = []
    chart.tooltipProps = []
    chart.series = []
    chart.grip = undefined
  })
  afterEach(() => {
    height?.mockRestore()
    width?.mockRestore()
    height = undefined
    width = undefined
  })
  // Only the charts and axes of the last render.
  const last = <T,>(list: T[], n: number) => list.slice(-n)

  it('draws one panel for one metric', () => {
    render(<TimeSeriesChart {...props()} />)
    expect(chart.charts).toHaveLength(1)
    expect(chart.charts[0].syncId).toBeUndefined()
    expect(screen.queryByTestId('split-grip')).toBeNull()
    expect(screen.queryByRole('separator', { name: 'Resize the panels' })).toBeNull()
  })

  it('stacks two panels on one synced time axis, which only the bottom one prints', () => {
    render(<TimeSeriesChart {...props(TWO)} />)
    const [top, bottom] = last(chart.charts, 2)
    expect(top.syncId).toBeDefined()
    expect(top.syncId).toBe(bottom.syncId)
    const [topAxis, bottomAxis] = last(chart.xAxes, 2)
    expect(topAxis).toMatchObject({ hide: true, height: 0 })
    expect(bottomAxis).toMatchObject({ hide: false, height: 22 })
    expect(screen.getAllByTestId('split-grip')).toHaveLength(1)
  })

  it('stands three as a row of two over one, each with its own axes', () => {
    const { container } = render(<TimeSeriesChart {...props({ ...FOUR, metrics: ['precip', 'temp', 'wind'] })} />)
    expect(last(chart.charts, 3).every((c) => c.syncId === chart.charts[chart.charts.length - 1].syncId)).toBe(true)
    expect(last(chart.xAxes, 3).every((a) => a.hide === false)).toBe(true)
    const grid = container.firstElementChild!.lastElementChild!
    const [top, bottom] = Array.from(grid.children)
    expect(top.children).toHaveLength(2)
    expect(bottom.children).toHaveLength(1)
    expect(screen.getByRole('separator', { name: 'Resize the panels' })).toBeTruthy()
    expect(screen.queryByTestId('split-grip')).toBeNull()
  })

  it('stands four as two rows of two', () => {
    const { container } = render(<TimeSeriesChart {...props(FOUR)} />)
    expect(last(chart.charts, 4)).toHaveLength(4)
    const grid = container.firstElementChild!.lastElementChild!
    const [top, bottom] = Array.from(grid.children)
    expect(top.children).toHaveLength(2)
    expect(bottom.children).toHaveLength(2)
  })

  it('names the Now seam in the first panel only, and draws its line in every one', () => {
    vi.setSystemTime(TIMES[10])
    chart.lines = []
    render(<TimeSeriesChart {...props(FOUR)} />)
    const seams = (chart.lines as LineProps[]).filter((l) => l.x === TIMES[10]).slice(-4)
    expect(seams.map((l) => l.label?.value)).toEqual(['Now', undefined, undefined, undefined])
  })

  it('heads a card for more than one metric with each column and prints bare cells', () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(209)
    render(<TimeSeriesChart {...props(TWO)} />)
    const [topCard, bottomCard] = last(chart.tooltips, 2)
    const hover = { active: true, payload: [{ dataKey: 'x', value: 1 }], label: TIMES[T] }
    // The other panel's tooltip draws nothing while the first shows the card.
    expect(bottomCard(hover)).toBeNull()
    const card = within(render(<>{topCard(hover)}</>).container)
    expect(card.getByText(CHART_METRICS.find((m) => m.key === 'precip')!.label)).toBeTruthy()
    expect(card.getByText(CHART_METRICS.find((m) => m.key === 'temp')!.label)).toBeTruthy()
    const name = card.getByText('Sahale Mountain')
    const cells = (n: HTMLElement) => [n.parentElement!.nextElementSibling!.textContent, n.parentElement!.nextElementSibling!.nextElementSibling!.textContent]
    expect(cells(name)).toEqual(['0.050', '38.9'])
    // No temperature for Beta: its cell is empty.
    expect(cells(card.getByText('Mount Beta'))).toEqual(['0.200', ''])
    // The popup's anatomy: the hour on the band, one rule across every column
    // under the heads, and no footer when every row is listed.
    const shell = card.getByText('Sahale Mountain').closest('.overflow-hidden') as HTMLElement
    expect(shell.firstElementChild!.className).toContain('bg-band')
    const rule = shell.querySelector('[data-card-rule]') as HTMLElement
    expect(rule.className).toContain('col-span-full')
    expect(card.queryByText(/more$/)).toBeNull()
  })

  it('cuts the rows the plot cannot hold into the card\'s footer', () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(209)
    const many = Array.from({ length: 30 }, (_, i) => ({ ...alpha, name: `P${i}`, latitude: i / 100 }))
    render(<TimeSeriesChart {...props({ rows: many, metrics: ['precip'] })} />)
    const card = chart.tooltips[chart.tooltips.length - 1]
    const shown = within(render(<>{card({ active: true, payload: [{ dataKey: 'x', value: 1 }], label: TIMES[T] })}</>).container)
    const foot = shown.getByText(/^\+\d+ more$/)
    expect(foot.className).toContain('border-t')
    expect(foot.parentElement!.firstElementChild!.className).toContain('bg-band')
  })

  it('lets the card over a grid leave its panel and keeps it inside the chart area', () => {
    const { container } = render(<TimeSeriesChart {...props(FOUR)} />)
    expect(last(chart.tooltipProps, 4).every((p) => (p.allowEscapeViewBox as { x: boolean }).x === true)).toBe(true)
    const grid = container.firstElementChild!.lastElementChild!
    // The area is 400x300; Recharts put the card at (350, 20), 120x80, so the
    // cursor stood at (340, 10) and the card flips to its left: x 210.
    const box = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
    const rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this === grid ? box(0, 0, 400, 300) : box(350, 20, 120, 80)
    })
    const topCard = last(chart.tooltips, 4)[0]
    const shown = render(<>{topCard({ active: true, payload: [{ dataKey: 'x', value: 1 }], label: TIMES[T] })}</>)
    rects.mockRestore()
    const card = shown.container.firstElementChild as HTMLElement
    expect(card.style.transform).toBe('translate(-140px, 0px)')
    // As wide as its content, not shrunk to the hovered panel's box.
    expect(card.classList.contains('w-max')).toBe(true)
  })

  it('keeps one panel\'s card inside its plot', () => {
    render(<TimeSeriesChart {...props()} />)
    expect(chart.tooltipProps[chart.tooltipProps.length - 1].allowEscapeViewBox).toBeUndefined()
  })

  it('keeps the one-metric card as it was: no header, bare numbers', () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(209)
    render(<TimeSeriesChart {...props({ ...TWO, metrics: ['temp'] })} />)
    const card = chart.tooltips[chart.tooltips.length - 1]
    const shown = within(render(<>{card({ active: true, payload: [{ dataKey: 'x', value: 1 }], label: TIMES[T] })}</>).container)
    expect(shown.queryByText(CHART_METRICS.find((m) => m.key === 'temp')!.label)).toBeNull()
    expect(shown.getByText('Sahale Mountain').parentElement!.nextElementSibling!.textContent).toBe('38.9')
    // The same band and body, with no heads and no rule under them.
    expect(shown.getByText('Sahale Mountain').closest('.overflow-hidden')!.querySelector('[data-card-rule]')).toBeNull()
  })

  it('moves the playhead from a click on any panel', () => {
    const onPlayheadChange = vi.fn()
    render(<TimeSeriesChart {...props({ ...FOUR, onPlayheadChange })} />)
    const panels = last(chart.charts, 4)
    act(() => panels[0].onClick!({ activeLabel: TIMES[5] }))
    act(() => panels[3].onClick!({ activeLabel: TIMES[9] }))
    expect(onPlayheadChange.mock.calls).toEqual([[TIMES[5]], [TIMES[9]]])
  })

  it('reads the nearest line through the hovered panel and dims it in both', () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(209)
    render(<TimeSeriesChart {...props(TWO)} />)
    const bottom = last(chart.charts, 2)[1]
    chart.series = []
    // The bottom panel's top edge is temperature's highest: Sahale at 38.9.
    act(() => bottom.onMouseMove!({ activeTooltipIndex: T, chartY: 8 }))
    const dimmed = chart.series.slice(-4).filter((l) => l.strokeOpacity === LINE_DRAW.dimmedOpacity).map((l) => l.name)
    expect(dimmed).toEqual(['Mount Beta', 'Mount Beta'])
  })

  it('moves height between two panels with the grip, and a double press evens it', () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
    const { container } = render(<TimeSeriesChart {...props(TWO)} />)
    const topBox = () => container.firstElementChild!.children[1].children[0] as HTMLElement
    expect(topBox().style.flexGrow).toBe('0.5')
    act(() => chart.grip!.onDragStart())
    act(() => chart.grip!.onDrag(50))
    act(() => chart.grip!.onDragEnd())
    expect(topBox().style.flexGrow).toBe('0.375')
    act(() => chart.grip!.onReset())
    expect(topBox().style.flexGrow).toBe('0.5')
  })

  // The gutters are the handles (#499; TJ 2026-10-29): each moves its own
  // axis, the crossing both, and a double press evens what it moves.
  function gridAt(container: HTMLElement) {
    const rows = () => Array.from(container.firstElementChild!.lastElementChild!.children).slice(0, 2) as HTMLElement[]
    const colShare = () => (rows()[0].children[0] as HTMLElement).style.flexGrow
    const rowShare = () => rows()[0].style.flexGrow
    return { colShare, rowShare }
  }
  const drag = (el: HTMLElement, x: number, y: number, at: number) => {
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, timeStamp: at })
    fireEvent.pointerMove(document, { clientX: x, clientY: y })
    fireEvent.pointerUp(document, { clientX: x, clientY: y })
  }
  const press = (el: HTMLElement, at: number) => fireEvent.pointerDown(el, { clientX: 0, clientY: 0, timeStamp: at })

  it('moves the columns with the vertical gutter and the rows with the horizontal one', () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(408)
    width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(808)
    const { container } = render(<TimeSeriesChart {...props(FOUR)} />)
    const { colShare, rowShare } = gridAt(container)
    const cols = screen.getByRole('separator', { name: 'Resize the columns' })
    const rowsGutter = screen.getByRole('separator', { name: 'Resize the rows' })
    expect(cols.getAttribute('aria-orientation')).toBe('vertical')
    expect(rowsGutter.getAttribute('aria-orientation')).toBe('horizontal')
    drag(cols, 200, 100, 1000)
    expect(colShare()).toBe('0.75')
    expect(rowShare()).toBe('0.5')
    drag(rowsGutter, 200, 100, 2000)
    expect(colShare()).toBe('0.75')
    expect(rowShare()).toBe('0.75')
    // A double press on a gutter evens its own axis alone.
    press(cols, 3000)
    press(cols, 3100)
    expect(colShare()).toBe('0.5')
    expect(rowShare()).toBe('0.75')
  })

  it('moves both with the crossing, drops a panel under its floor, and a double press there evens both', () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(408)
    width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(808)
    const { container } = render(<TimeSeriesChart {...props(FOUR)} />)
    const { colShare, rowShare } = gridAt(container)
    const cross = screen.getByRole('separator', { name: 'Resize the panels' })
    // Every frame at once; 0 so the next move queues its own.
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    // One drag: two presses in a row would read as a double press.
    fireEvent.pointerDown(cross, { clientX: 0, clientY: 0 })
    const drawn = chart.charts.length
    fireEvent.pointerMove(document, { clientX: 200, clientY: 100 })
    // Mid-drag nothing is laid out again and nothing renders: the boxes and
    // the gutters move by transform, the split from the 800 by 400 measured
    // at the press (record 0243).
    expect(colShare()).toBe('0.5')
    expect(rowShare()).toBe('0.5')
    const rows = Array.from(container.firstElementChild!.lastElementChild!.children).slice(0, 2) as HTMLElement[]
    expect((rows[0].children[1] as HTMLElement).style.transform).toBe('translate(608px, 0px)')
    expect((rows[1].children[0] as HTMLElement).style.transform).toBe('translate(0px, 308px)')
    expect(cross.style.transform).toBe('translate(200px, 100px)')
    expect(cross.style.willChange).toBe('transform')
    expect(chart.charts).toHaveLength(drawn)
    // Into the corner: the first panel takes the area and the rest are not drawn.
    fireEvent.pointerMove(document, { clientX: 2000, clientY: 2000 })
    fireEvent.pointerUp(document, { clientX: 2000, clientY: 2000 })
    // Released: the split is committed and every transform is gone.
    expect(last(chart.charts, 1)).toHaveLength(1)
    expect(rowShare()).toBe('1')
    expect(cross.style.transform).toBe('')
    expect(cross.style.willChange).toBe('')
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(3)
    press(cross, 5000)
    press(cross, 5100)
    expect(colShare()).toBe('0.5')
    expect(rowShare()).toBe('0.5')
    raf.mockRestore()
  })

  it('stops the vertical gutter at the top row of three', () => {
    render(<TimeSeriesChart {...props({ ...FOUR, metrics: ['precip', 'temp', 'wind'] })} />)
    const cols = screen.getByRole('separator', { name: 'Resize the columns' })
    expect(cols.style.height).toContain('100% - 8px')
    expect(screen.getByRole('separator', { name: 'Resize the rows' })).toBeTruthy()
  })

  it('counts every drawn panel against the hover budget', () => {
    // 48 hours x 300 lines is 14,400 paths in one panel and 28,800 in two.
    const many = Array.from({ length: 300 }, (_, i) => resultRow({ name: `P${i}`, latitude: i / 100 }))
    render(<TimeSeriesChart {...props({ rows: many, metrics: ['precip'] })} />)
    expect(chart.charts[chart.charts.length - 1].onMouseMove).toBeDefined()
    chart.charts = []
    render(<TimeSeriesChart {...props({ rows: many, metrics: ['precip', 'temp'] })} />)
    expect(last(chart.charts, 2).every((c) => c.onMouseMove === undefined)).toBe(true)
  })

  it('stands a picker per slot at a desk, an × after each but the first and a + after the last', () => {
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    render(<TimeSeriesChart {...props({ ...TWO, metrics: ['precip', 'temp', 'wind'], onAdd, onRemove })} />)
    for (const name of ['Chart metric', 'Metric 2', 'Metric 3']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeTruthy()
    }
    const temp = CHART_METRICS.find((m) => m.key === 'temp')!.label
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: `Remove ${temp}` }))
    expect(onRemove).toHaveBeenCalledWith(1)
    const add = screen.getByRole('button', { name: 'Add a panel' }) as HTMLButtonElement
    expect(add.disabled).toBe(false)
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalled()
  })

  it('greys the + at four on a desk', () => {
    render(<TimeSeriesChart {...props(FOUR)} />)
    expect((screen.getByRole('button', { name: 'Add a panel' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('draws the first two of four on a phone, each titled, and greys its +', () => {
    const onPick = vi.fn()
    const onRemove = vi.fn()
    render(<TimeSeriesChart {...props({ ...FOUR, titled: true, onPick, onRemove })} />)
    expect(last(chart.charts, 2).every((c) => c.syncId !== undefined)).toBe(true)
    expect(screen.queryByRole('separator', { name: 'Resize the panels' })).toBeNull()
    const first = screen.getByRole('combobox', { name: 'Chart metric' }) as HTMLSelectElement
    const second = screen.getByRole('combobox', { name: 'Metric 2' }) as HTMLSelectElement
    expect(first.value).toBe('precip')
    expect(second.value).toBe('temp')
    expect(screen.queryByRole('combobox', { name: 'Metric 3' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Add a panel' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(second, { target: { value: 'wind' } })
    expect(onPick).toHaveBeenCalledWith(1, 'wind')
    fireEvent.click(screen.getByRole('button', { name: /^Remove / }))
    expect(onRemove).toHaveBeenCalledWith(1)
  })

  it("offers a phone's one panel a + beside its title", () => {
    const onAdd = vi.fn()
    render(<TimeSeriesChart {...props({ titled: true, onAdd })} />)
    const add = screen.getByRole('button', { name: 'Add a panel' }) as HTMLButtonElement
    expect(add.disabled).toBe(false)
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })
})
