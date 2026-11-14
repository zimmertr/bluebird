import { type ComponentProps, type ReactNode, useState } from 'react'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TimeSeriesChart from './TimeSeriesChart'
import { CHART_METRICS, type ChartMetric, type ChartMetrics, extremeValue, moveMetric } from '../utils/chart/chartData'
import { CHROME, CROWDED_PAST, LINE_DRAW } from '../utils/chart/chartColors'
import { CARD_CURSOR_OFFSET_PX, PHONE_PLOT_MARGIN, PLOT_MARGIN, hourX } from '../utils/chart/chartPointer'
import { ACCENT, CHART_CARD, CHART_PANEL_TITLE, CHART_PICKER, DRAG } from '../styles'
import { GHOST_SCALE, TITLED_TOP_LABEL_DY, ghostTransform, titleAt } from '../utils/chart/panelTitle'
import { placeAt, render } from '../testSupport/render'
import { DOUBLE_PRESS_MS } from '../utils/doublePress'
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
    dy?: number
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
  dotsAt: [] as (number | null)[],
  // Every LineChart, XAxis and Tooltip drawn, in order, so a two-panel test
  // can read each panel's (#499).
  charts: [] as { onClick?: Handler; onMouseMove?: Handler; syncId?: string }[],
  xAxes: [] as { hide?: boolean; height?: number }[],
  tooltips: [] as ((props: unknown) => ReactNode)[],
  tooltipProps: [] as { allowEscapeViewBox?: unknown; wrapperStyle?: unknown }[],
  grip: undefined as undefined | { onReset: () => void; onDragStart: () => void; onDrag: (px: number) => void; onDragEnd: () => void; line?: boolean },
}))
// The grip's handlers, kept so a test can drag it without a pointer.
vi.mock('./ResizeGrip', async (importOriginal) => ({
  GridGutter: (await importOriginal<typeof import('./ResizeGrip')>()).GridGutter,
  default: (p: NonNullable<typeof chart.grip>) => {
    chart.grip = p
    return <i data-testid="split-grip" />
  },
}))
// The canvas lines (record 0256): every stroke the panel hands it, kept in the
// order drawn, as the mock above kept every Recharts Line.
vi.mock('./ChartLines', () => ({
  default: (p: { strokes: Record<string, unknown>[]; at: number | null }) => {
    chart.series.push(...p.strokes)
    chart.dotsAt.push(p.at)
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
    Label: (p: { position: string; value: string; paintOrder?: string; stroke?: string; dy?: number }) => (
      <i data-testid="label" data-position={p.position} data-paint-order={p.paintOrder} data-stroke={p.stroke} data-dy={p.dy}>
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
    onMove: noop,
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
  return container.querySelector('[data-chart-stage]')!.parentElement as HTMLElement
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

  // A desk's click still pins a card; a phone pins nothing.
  it('takes no click on a phone with no playhead to move', () => {
    render(<TimeSeriesChart {...props({ phone: true })} />)
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

  // The reading lasts while the finger rests (TJ 2026-10-30): a lift takes it
  // away, so there is never a card to dismiss.
  it('lets go of the reading when the finger lifts', () => {
    const { container } = render(<TimeSeriesChart {...props()} />)
    placePlot(container, 360)
    fireEvent.pointerDown(plotOf(container), { pointerType: 'touch', clientX: 252, clientY: 560 })
    expect(tip().active).toBe('true')
    fireEvent.pointerUp(plotOf(container), { pointerType: 'touch' })
    // Held shut, so the tap's compatibility mouse events cannot reopen it,
    // and the hover dots go with it.
    expect(tip().active).toBe('false')
    expect(chart.dotsAt[chart.dotsAt.length - 1]).toBeNull()
    // A real mouse hands the card back to Recharts.
    fireEvent.pointerMove(plotOf(container), { pointerType: 'mouse', clientX: 252, clientY: 560 })
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

// A phone panel wears its own picker at its top left (#499; TJ 2026-10-30),
// and its plot starts under it, so a finger reads the band Recharts draws.
describe('TimeSeriesChart on a phone', () => {
  it('stands the picker over its panel, the + after it, with no row above the plot', () => {
    const { container } = render(<TimeSeriesChart {...props({ phone: true, metrics: ['temp'] })} />)
    const bar = screen.getByRole('button', { name: /^Chart metric/ }).closest(`.${CSS.escape('top-2')}`)!
    expect(bar.className).toBe(CHART_PICKER.bar)
    expect(bar.querySelector('[aria-label="Add a panel"]')).not.toBeNull()
    // The root holds the stack alone: the row is gone.
    // No native select at any width (record 0252).
    expect(container.querySelector('select')).toBeNull()
    expect(container.firstElementChild!.children).toHaveLength(1)
    expect(chart.margin).toEqual(PHONE_PLOT_MARGIN)
  })

  // Every panel's picker opens the one menu's sheet on a phone, headed by its
  // name, as the model picker does (record 0252).
  it('opens a sheet headed by its name and picks from it', () => {
    const onPick = vi.fn()
    const temp = CHART_METRICS.find((m) => m.key === 'temp')!
    const other = CHART_METRICS.find((m) => m.key !== 'temp')!
    render(<TimeSeriesChart {...props({ phone: true, metrics: ['temp'], onPick })} />)
    const field = screen.getByRole('button', { name: `Chart metric ${temp.label}` })
    expect(field.getAttribute('aria-haspopup')).toBe('dialog')
    fireEvent.click(field)
    const sheet = screen.getByRole('dialog', { name: 'Chart metric' })
    fireEvent.click(within(sheet).getByRole('option', { name: other.label }))
    expect(onPick).toHaveBeenCalledWith(0, other.key)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the row for a comparison note, with no picker in it', () => {
    const { container } = render(<TimeSeriesChart {...props({ phone: true, controls: <p>note</p> })} />)
    expect(container.firstElementChild!.children).toHaveLength(2)
    expect(container.firstElementChild!.firstElementChild!.querySelector('[data-picker-slot]')).toBeNull()
  })

  it('stands the pickers in a row at a desk, the plot at the plain margins', () => {
    render(<TimeSeriesChart {...props()} />)
    expect(document.querySelector(`.${CSS.escape('top-2')}`)).toBeNull()
    expect(chart.margin).toEqual(PLOT_MARGIN)
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
    // The card's room is the chart's area, the stack around the panel.
    Object.defineProperty(plotIn(container).parentElement!.parentElement!, 'clientHeight', { value: 400 })
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
      expect(swatch.nextElementSibling!.className).toBe(CHART_CARD.name)
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
  // The grid's own tests name it: four open as one over three (TJ 2026-10-30).
  const FOUR: Partial<Props> = { ...TWO, metrics: ['precip', 'temp', 'wind', 'aqi'], layout: '2x2' }
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

  // One hour for every panel's dots (TJ 2026-10-30): a finger on one panel
  // puts them all on its hour, and a lift takes them all away.
  it('stands every panel\'s dots on one hour and hides them together', () => {
    const { container } = render(<TimeSeriesChart {...props(TWO)} />)
    placePlot(container, 360)
    fireEvent.pointerDown(plotIn(container), { pointerType: 'touch', clientX: 252, clientY: 560 })
    expect(last(chart.dotsAt, 2)).toEqual([TIMES[32], TIMES[32]])
    fireEvent.pointerUp(plotIn(container), { pointerType: 'touch' })
    expect(last(chart.dotsAt, 2)).toEqual([null, null])
  })

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
    // At a desk the bar is the grid's quiet line, as every layout's is (TJ 2026-10-30).
    expect(chart.grip!.line).toBe(true)
  })

  it('stands three as a row of two over one, each with its own axes', () => {
    const { container } = render(<TimeSeriesChart {...props({ ...FOUR, metrics: ['precip', 'temp', 'wind'], layout: '2-1' })} />)
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

  // One panel stands in the stack too, so its card keeps to the chart's area
  // rather than to the plot (TJ 2026-10-30).
  it('lets one panel\'s card leave its plot for the chart\'s area', () => {
    render(<TimeSeriesChart {...props()} />)
    expect(chart.tooltipProps[chart.tooltipProps.length - 1].allowEscapeViewBox).toEqual({ x: true, y: true })
  })

  // Every card carries its heads, one metric's too, so a card pinned from it
  // sorts by name at the same size (the maintainer, 2026-10-30).
  it('heads the one-metric card too, over bare numbers', () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(209)
    render(<TimeSeriesChart {...props({ ...TWO, metrics: ['temp'] })} />)
    const card = chart.tooltips[chart.tooltips.length - 1]
    const shown = within(render(<>{card({ active: true, payload: [{ dataKey: 'x', value: 1 }], label: TIMES[T] })}</>).container)
    expect(shown.getByText('Name')).toBeTruthy()
    expect(shown.getByText(CHART_METRICS.find((m) => m.key === 'temp')!.label)).toBeTruthy()
    expect(shown.getByText('Sahale Mountain').parentElement!.nextElementSibling!.textContent).toBe('38.9')
    expect(shown.getByText('Sahale Mountain').closest('.overflow-hidden')!.querySelector('[data-card-rule]')).not.toBeNull()
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
    // at the press (record 0255).
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
    render(<TimeSeriesChart {...props({ ...FOUR, metrics: ['precip', 'temp', 'wind'], layout: '2-1' })} />)
    const cols = screen.getByRole('separator', { name: 'Resize the columns' })
    expect(cols.style.height).toContain('100% - 8px')
    expect(screen.getByRole('separator', { name: 'Resize the rows' })).toBeTruthy()
  })

  // No hover budget (record 0297): every panel follows the cursor at a size
  // the old budget refused, 48 hours x 300 lines in each of two panels.
  it('follows the cursor in every panel at any size', () => {
    const many = Array.from({ length: 300 }, (_, i) => resultRow({ name: `P${i}`, latitude: i / 100 }))
    render(<TimeSeriesChart {...props({ rows: many, metrics: ['precip', 'temp'] })} />)
    expect(last(chart.charts, 2).every((c) => c.onMouseMove !== undefined)).toBe(true)
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

  // The panels follow the row (#499; TJ 2026-10-30): every picker but the
  // first has a grip; the arrow keys move it one place and a drag over the
  // row lands it on the nearest slot. Nothing moves into the first slot.
  it('moves a panel with its grip, by the arrow keys and by a drag', () => {
    const onMove = vi.fn()
    const { container } = render(<TimeSeriesChart {...props({ ...FOUR, onMove })} />)
    const label = (k: string) => CHART_METRICS.find((m) => m.key === k)!.label
    const grips = screen.getAllByRole('button', { name: /^Move / })
    expect(grips).toHaveLength(3)
    const second = screen.getByRole('button', { name: `Move ${label('temp')}` })
    fireEvent.keyDown(second, { key: 'ArrowRight' })
    expect(onMove).toHaveBeenLastCalledWith(1, 2)
    fireEvent.keyDown(second, { key: 'ArrowLeft' })
    expect(onMove).toHaveBeenCalledTimes(1)

    // The slots stand 200px apart on one line; a drag from slot 3 to over
    // slot 1 shows the drop bar there and lands it on release.
    const slots = Array.from(container.querySelectorAll<HTMLElement>('[data-picker-slot]'))
    const rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const i = slots.indexOf(this as HTMLElement)
      const x = i * 200
      return { x, y: 0, left: x, top: 0, width: 180, height: 22, right: x + 180, bottom: 22, toJSON: () => ({}) } as DOMRect
    })
    const third = screen.getByRole('button', { name: `Move ${label('aqi')}` })
    fireEvent.pointerDown(third, { button: 0, pointerId: 1, clientX: 610, clientY: 11 })
    fireEvent.pointerMove(third, { pointerId: 1, clientX: 290, clientY: 11 })
    expect(container.querySelector('[data-picker-slot="1"] > span[aria-hidden="true"]')).not.toBeNull()
    // The picker is carried under the pointer as the table's columns are.
    const ghost = document.body.querySelector<HTMLElement>(`.${CSS.escape('-rotate-1')}`)!
    expect(ghost.className).toBe(DRAG.ghost)
    expect(ghost.textContent).toBe(label('aqi'))
    fireEvent.pointerUp(third, { pointerId: 1, clientX: 290, clientY: 11 })
    expect(document.body.querySelector(`.${CSS.escape('-rotate-1')}`)).toBeNull()
    rects.mockRestore()
    expect(onMove).toHaveBeenLastCalledWith(3, 1)
  })

  // The reader's arrangement (#499; TJ 2026-10-30): one over three stands
  // as rows with a bar between them and a bar between each pair in a row.
  it('stands one over three in rows, each with its own bars', () => {
    const { container } = render(<TimeSeriesChart {...props({ ...FOUR, layout: '1-3', onLayout: () => {} })} />)
    const rows = Array.from(container.firstElementChild!.lastElementChild!.children).filter((el) => !el.getAttribute('role') && !el.hasAttribute('aria-hidden'))
    expect(rows.map((r) => r.querySelectorAll('[data-chart-box]').length)).toEqual([1, 3])
    expect(screen.getAllByRole('separator', { name: 'Resize the rows' })).toHaveLength(1)
    expect(screen.getAllByRole('separator', { name: 'Resize the columns' })).toHaveLength(2)
    // A crossing wherever the row bar meets a panel bar, as the grid has.
    expect(screen.getAllByRole('separator', { name: 'Resize the panels' })).toHaveLength(2)
    expect(last(chart.xAxes, 4).every((a) => a.hide === false)).toBe(true)
  })

  it('opens four as one over three, with the ranking full width', () => {
    const { container } = render(<TimeSeriesChart {...props({ ...FOUR, layout: null })} />)
    const rows = Array.from(container.firstElementChild!.lastElementChild!.children).filter((el) => !el.getAttribute('role') && !el.hasAttribute('aria-hidden'))
    expect(rows.map((r) => r.querySelectorAll('[data-chart-box]').length)).toEqual([1, 3])
  })

  // A desk's chart too short for the layout its panels now stand in asks
  // the results for the room, once, and only for a change (#925).
  it('asks for the room a third or fourth panel needs, and only when panels or the layout change', () => {
    const area = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    height = area
    const onShort = vi.fn()
    const { rerender } = render(<TimeSeriesChart {...props({ ...TWO, onShort })} />)
    // The first draw is no change, however short.
    expect(onShort).not.toHaveBeenCalled()
    rerender(<TimeSeriesChart {...props({ ...FOUR, layout: null, onShort })} />)
    // One over three: two rows of 72px floors and the 8px bar between.
    expect(onShort).toHaveBeenCalledTimes(1)
    expect(onShort).toHaveBeenCalledWith(152 - 100)
    rerender(<TimeSeriesChart {...props({ ...FOUR, layout: null, onShort })} />)
    expect(onShort).toHaveBeenCalledTimes(1)
    // Tall enough: a layout change asks nothing.
    area.mockReturnValue(400)
    rerender(<TimeSeriesChart {...props({ ...FOUR, layout: '2x2', onShort })} />)
    rerender(<TimeSeriesChart {...props({ ...TWO, onShort })} />)
    expect(onShort).toHaveBeenCalledTimes(1)
  })

  it("asks nothing when the tutorial's panels come or go, or on a phone", () => {
    height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const onShort = vi.fn()
    // The tour hands no listener while its panels stand in.
    const { rerender } = render(<TimeSeriesChart {...props({ ...TWO, onShort })} />)
    rerender(<TimeSeriesChart {...props({ ...FOUR, layout: null })} />)
    rerender(<TimeSeriesChart {...props({ ...TWO, onShort })} />)
    expect(onShort).not.toHaveBeenCalled()
    const phone = render(<TimeSeriesChart {...props({ ...TWO, onShort, phone: true })} />)
    phone.rerender(<TimeSeriesChart {...props({ ...FOUR, layout: null, onShort, phone: true })} />)
    expect(onShort).not.toHaveBeenCalled()
  })

  it('opens the Panel layout menu and picks a layout from it', async () => {
    const onLayout = vi.fn()
    render(<TimeSeriesChart {...props({ ...FOUR, onLayout })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Panel layout' }))
    fireEvent.click(await screen.findByRole('button', { name: 'One row' }))
    expect(onLayout).toHaveBeenCalledWith('row')
  })

  // Each click pins a card at that hour beside any already pinned
  // it, and the ✕ lets each go (TJ 2026-10-30, P2).
  it('pins a card per click, each beside the last with its own unpin', () => {
    const { container } = render(<TimeSeriesChart {...props({ ...TWO, onPlayheadChange: () => {} })} />)
    placePlot(container, 360)
    act(() => chart.onClick!({ activeLabel: TIMES[2] }, { clientX: 100, shiftKey: false }))
    act(() => chart.onClick!({ activeLabel: TIMES[5] }, { clientX: 200, shiftKey: true }))
    const unpins = screen.getAllByRole('button', { name: /^Unpin / })
    expect(unpins).toHaveLength(2)
    fireEvent.click(unpins[0])
    expect(screen.getAllByRole('button', { name: /^Unpin / })).toHaveLength(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /^Unpin / })).toBeNull()
  })

  // Escape lets the active card go, the one touched last, and a second press
  // the other (TJ 2026-10-30).
  it('lets the active pinned card go on Escape, then the other', () => {
    const { container } = render(<TimeSeriesChart {...props({ ...TWO, onPlayheadChange: () => {} })} />)
    placePlot(container, 360)
    act(() => chart.onClick!({ activeLabel: TIMES[2] }, { clientX: 100, shiftKey: false }))
    act(() => chart.onClick!({ activeLabel: TIMES[5] }, { clientX: 200, shiftKey: true }))
    const [first, second] = screen.getAllByRole('button', { name: /^Unpin / }).map((b) => b.getAttribute('aria-label'))
    fireEvent.pointerDown(screen.getByRole('button', { name: first! }).closest('[class*="absolute"]')!)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getAllByRole('button', { name: /^Unpin / }).map((b) => b.getAttribute('aria-label'))).toEqual([second])
  })

  // The pinned card on screen, found by its unpin.
  const pinnedCard = () => screen.getByRole('button', { name: /^Unpin / }).closest<HTMLElement>('[class*="absolute"]')!

  it('sorts a pinned card by the head pressed, again to turn it round', () => {
    const { container } = render(<TimeSeriesChart {...props({ ...TWO, onPlayheadChange: () => {} })} />)
    placePlot(container, 360)
    act(() => chart.onClick!({ activeLabel: TIMES[2] }, { clientX: 100, shiftKey: false }))
    const heads = Array.from(pinnedCard().querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
    // One head orders the card, the clicked panel's metric.
    expect(heads.filter((h) => h.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    // The names sort A to Z first, then turn round.
    const name = screen.getByRole('button', { name: /^Name/ })
    expect(name.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(name)
    expect(name.getAttribute('aria-pressed')).toBe('true')
    expect(name.textContent).toContain('↑')
    fireEvent.click(name)
    expect(name.textContent).toContain('↓')
    // A metric opens high to low.
    const metric = heads.find((h) => h !== name && h.getAttribute('aria-pressed') === 'false')!
    fireEvent.click(metric)
    expect(metric.textContent).toContain('↓')
    fireEvent.click(metric)
    expect(metric.textContent).toContain('↑')
  })

  // A pinned card is the hover card it was pinned from, at its size (the
  // maintainer, 2026-10-30): the hover card's heads, `Name` among them, an
  // arrow only on the sorted head, outside it, and no rule between rows.
  it('pins a card that looks like the hover card', () => {
    const { container } = render(<TimeSeriesChart {...props({ ...TWO, onPlayheadChange: () => {} })} />)
    placePlot(container, 360)
    act(() => chart.onClick!({ activeLabel: TIMES[2] }, { clientX: 100, shiftKey: false }))
    expect(screen.getByRole('button', { name: /^Name/ })).toBeTruthy()
    const heads = Array.from(pinnedCard().querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
    // The arrow on the sorted head alone, outside its label's width.
    expect(heads.map((h) => h.textContent!.includes('↓'))).toEqual(heads.map((h) => h.getAttribute('aria-pressed') === 'true'))
    const sorted = heads.find((h) => h.getAttribute('aria-pressed') === 'true')!
    expect(sorted.querySelector(`.${CHART_CARD.sortArrow.split(' ')[0]}`)).not.toBeNull()
    const row = pinnedCard().querySelector('[data-pin-row]')!
    expect(row.className).not.toMatch(/border-t/)
  })

  // A double press on a pinned card's corner puts the card back at the size
  // it was pinned at, the hover card's (TJ, 2026-11-04, record 0270), and
  // starts no drag; a press long after the last is a drag of its own.
  it("puts a pinned card back at its pinned size on a double press of its corner", () => {
    // The corner times its presses by each event's timeStamp, which jsdom
    // stamps from the clock, so the clock is the test's.
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'performance'] })
    vi.setSystemTime(T0 + 30 * 24 * HOUR)
    const { container } = render(<TimeSeriesChart {...props({ ...TWO, onPlayheadChange: () => {} })} />)
    // The panels' area laid out, so the pinned height is a length jsdom
    // keeps: over an unmeasured area it is negative, which jsdom drops.
    const root = container.firstElementChild as HTMLElement
    placeAt(root, { left: 0, top: 0, width: 800, height: 400 })
    placeAt(root.children[1], { left: 0, top: 40, width: 800, height: 360 })
    placePlot(container, 360)
    act(() => chart.onClick!({ activeLabel: TIMES[2] }, { clientX: 100, shiftKey: false }))
    const card = pinnedCard()
    const corner = card.lastElementChild as HTMLElement
    expect(corner.className).toBe(CHART_CARD.corner)
    const box = () => ({ width: card.style.width, height: card.style.height, fitsContent: card.classList.contains('w-max') })
    const pinnedAt = box()
    expect(pinnedAt.fitsContent).toBe(true)
    expect(pinnedAt.height).not.toBe('')
    const size = (dx: number, dy: number) => {
      fireEvent.pointerDown(corner, { clientX: 300, clientY: 300 })
      fireEvent.pointerMove(document, { clientX: 300 + dx, clientY: 300 + dy })
      fireEvent.pointerUp(document, { clientX: 300 + dx, clientY: 300 + dy })
    }
    size(40, 30)
    const sized = box()
    expect(sized.fitsContent).toBe(false)
    expect(sized.width).not.toBe('')
    expect(sized.height).not.toBe(pinnedAt.height)
    vi.advanceTimersByTime(1000)
    size(60, 60)
    expect(box().width).not.toBe('')
    expect(box().fitsContent).toBe(false)
    vi.advanceTimersByTime(DOUBLE_PRESS_MS - 100)
    fireEvent.pointerDown(corner, { clientX: 304, clientY: 302 })
    // A move after the second press sizes nothing: it started no drag.
    fireEvent.pointerMove(document, { clientX: 500, clientY: 500 })
    fireEvent.pointerUp(document, { clientX: 500, clientY: 500 })
    expect(box()).toEqual(pinnedAt)
  })

  it('greys the + at four on a desk', () => {
    render(<TimeSeriesChart {...props(FOUR)} />)
    expect((screen.getByRole('button', { name: 'Add a panel' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('stacks four in one column on a phone, a grip between each pair, and greys its +', () => {
    const onPick = vi.fn()
    render(<TimeSeriesChart {...props({ ...FOUR, phone: true, onPick })} />)
    expect(last(chart.charts, 4).every((c) => c.syncId === chart.charts[chart.charts.length - 1].syncId)).toBe(true)
    // One time axis, printed by the bottom panel alone.
    expect(last(chart.xAxes, 4).map((a) => a.hide)).toEqual([true, true, true, false])
    expect(screen.getAllByTestId('split-grip')).toHaveLength(3)
    expect(screen.queryByRole('separator', { name: 'Resize the panels' })).toBeNull()
    // Each panel wears its own picker.
    for (const name of ['Chart metric', 'Metric 2', 'Metric 3', 'Metric 4']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) }).closest('[data-picker-slot]')!.parentElement!.className).toBe(CHART_PICKER.bar)
    }
    expect((screen.getByRole('button', { name: 'Add a panel' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("offers a phone's two panels a +", () => {
    render(<TimeSeriesChart {...props({ ...TWO, phone: true })} />)
    expect((screen.getByRole('button', { name: 'Add a panel' }) as HTMLButtonElement).disabled).toBe(false)
  })

  // The tutorial's Panels card lights the row that holds the + at either
  // width (#850): a desk's picker row, a phone's first panel's heading.
  it('marks the row holding the + for the tutorial at either width', () => {
    const { unmount } = render(<TimeSeriesChart {...props(FOUR)} />)
    const desk = screen.getByRole('button', { name: 'Add a panel' }).parentElement!
    expect(desk.dataset.tour).toBe('chart-panels')
    expect(desk.querySelectorAll('[data-picker-slot]')).toHaveLength(4)
    unmount()
    render(<TimeSeriesChart {...props({ ...FOUR, phone: true })} />)
    const phone = screen.getByRole('button', { name: 'Add a panel' }).parentElement!
    expect(phone.dataset.tour).toBe('chart-panels')
    expect(phone.className).toBe(CHART_PICKER.bar)
  })

  it('holds the Panel layout menu open for the tutorial', () => {
    render(<TimeSeriesChart {...props({ ...FOUR, onLayout: () => {}, layoutMenuOpen: true })} />)
    expect(screen.getByRole('group', { name: 'Panel layout' }).dataset.tour).toBe('chart-layout-menu')
  })

  // The tutorial's Pinned hours card (#850): a card on each hour it names,
  // the first at the panels' head and the second at their foot so neither
  // covers the other, gone when the card moves on, and the reader's own pins
  // set aside under the demonstration and back after it.
  describe("the tutorial's pinned hours", () => {
    const OTHER = TIMES.map((t) => t + 100 * 24 * HOUR)
    const cards = (container: HTMLElement) =>
      Array.from(container.querySelectorAll<HTMLElement>('[data-tour="chart-pins"] > div'))
    const unpins = () => screen.queryAllByRole('button', { name: /^Unpin / })
    // Lays the root, the panels' area and the first panel out, then hands
    // the chart the tour's pins, as the tour does a card after the chart.
    function pinned(hours: readonly number[] | null, over: Partial<Props> = {}) {
      const base = { ...FOUR, layout: null, onPlayheadChange: () => {}, ...over }
      const view = render(<TimeSeriesChart {...props(base)} />)
      const root = view.container.firstElementChild as HTMLElement
      placeAt(root, { left: 0, top: 0, width: 800, height: 400 })
      placeAt(root.children[1], { left: 0, top: 40, width: 800, height: 360 })
      placeAt(root.querySelector('[data-chart-box]')!, { left: 0, top: 40, width: 800, height: 176 })
      view.rerender(<TimeSeriesChart {...props({ ...base, tourPins: hours })} />)
      return { ...view, base }
    }

    it('stands a card on each hour, one at the head and one at the foot', () => {
      // A card is as tall as its style says, which jsdom does not lay out.
      height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return parseFloat(this.style.height) || 0
      })
      const { container } = pinned([11, 35])
      const [head, foot] = cards(container)
      expect(cards(container)).toHaveLength(2)
      expect(unpins()).toHaveLength(2)
      const top = (el: HTMLElement) => parseFloat(el.style.top)
      const tall = (el: HTMLElement) => parseFloat(el.style.height)
      // Inside the area, which starts 40px down the chart.
      expect(top(head)).toBeGreaterThanOrEqual(40)
      expect(top(foot)).toBeGreaterThanOrEqual(top(head) + tall(head))
      expect(top(foot) + tall(foot)).toBeLessThanOrEqual(400)
      // Each beside its own hour's line, as a click there stands its card:
      // right of it in the plot's left half, left of it in the right half
      // (jsdom lays the cards out no wider than nothing).
      expect(parseFloat(head.style.left)).toBeCloseTo(hourX(800, TIMES, 11) + CARD_CURSOR_OFFSET_PX)
      expect(parseFloat(foot.style.left)).toBeCloseTo(hourX(800, TIMES, 35) - CARD_CURSOR_OFFSET_PX)
    })

    it('lets the cards go when the tour moves on, and when it ends', () => {
      const { container, rerender, base } = pinned([11, 35])
      rerender(<TimeSeriesChart {...props({ ...base, tourPins: [] })} />)
      expect(cards(container)).toHaveLength(0)
      rerender(<TimeSeriesChart {...props({ ...base, tourPins: [11, 35] })} />)
      expect(cards(container)).toHaveLength(2)
      rerender(<TimeSeriesChart {...props({ ...base, tourPins: null })} />)
      expect(cards(container)).toHaveLength(0)
      expect(unpins()).toHaveLength(0)
    })

    it("sets the reader's own pins aside under the demonstration, Escape included, and gives them back", () => {
      const { container, rerender, base } = pinned(null)
      act(() => chart.charts[chart.charts.length - 1].onClick!({ activeLabel: TIMES[2] }, { clientX: 100 }))
      expect(unpins()).toHaveLength(1)
      const own = unpins()[0].getAttribute('aria-label')
      // The demonstration's grid and none of its cards: the reader's card waits.
      rerender(<TimeSeriesChart {...props({ ...base, times: OTHER, tourPins: [] })} />)
      expect(unpins()).toHaveLength(0)
      fireEvent.keyDown(document, { key: 'Escape' })
      rerender(<TimeSeriesChart {...props({ ...base, times: OTHER, tourPins: [11, 35] })} />)
      expect(unpins()).toHaveLength(2)
      expect(unpins().map((b) => b.getAttribute('aria-label'))).not.toContain(own)
      rerender(<TimeSeriesChart {...props({ ...base, tourPins: null })} />)
      expect(cards(container)).toHaveLength(0)
      expect(unpins().map((b) => b.getAttribute('aria-label'))).toEqual([own])
    })

    it('still drops the pins of a report a new one replaces', () => {
      const { rerender, base } = pinned(null)
      act(() => chart.charts[chart.charts.length - 1].onClick!({ activeLabel: TIMES[2] }, { clientX: 100 }))
      expect(unpins()).toHaveLength(1)
      rerender(<TimeSeriesChart {...props({ ...base, times: OTHER })} />)
      rerender(<TimeSeriesChart {...props({ ...base })} />)
      expect(unpins()).toHaveLength(0)
    })
  })
})

// Every desk panel names its metric when two or more are drawn, and a title
// past the first drags its panel to another slot (#846; TJ 2026-11-03).
describe('TimeSeriesChart panel titles', () => {
  const label = (k: ChartMetric) => CHART_METRICS.find((m) => m.key === k)!.label
  const titles = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-panel-label]'))
  const texts = (c: HTMLElement) => titles(c).map((t) => t.textContent)
  const titleOf = (c: HTMLElement, k: ChartMetric) => titles(c).find((t) => t.textContent === label(k))!
  const FOUR: ChartMetrics = ['precip', 'temp', 'wind', 'aqi']
  const grips = () => screen.getAllByRole('button', { name: /^Move / }).map((b) => b.getAttribute('aria-label'))
  const bar = (c: HTMLElement) => c.querySelector<HTMLElement>(`[class="${CHART_PANEL_TITLE.drop}"]`)!
  const ghost = () => Array.from(document.body.children).find((el) => el.className === CHART_PANEL_TITLE.ghost) as HTMLElement | undefined

  // The panels' metrics as the chart holds them, moved by `moveMetric` as
  // `useChartMetrics` moves them, so a test reads what a move did.
  function Held({ start, onMove, ...over }: Partial<Props> & { start: ChartMetrics }) {
    const [metrics, setMetrics] = useState(start)
    return (
      <TimeSeriesChart
        {...props({
          ...over,
          metrics,
          sortBy: 'precip_total_in',
          onMove: (from, to) => {
            onMove?.(from, to)
            setMetrics((m) => moveMetric(m, from, to))
          },
        })}
      />
    )
  }

  // One row of four, each box 100 by 100 and 8px apart, the area at the
  // page's origin; jsdom lays nothing out, so the drag measures these.
  let rects: { mockRestore: () => void } | undefined
  let raf: { mockRestore: () => void } | undefined
  function layOut(container: HTMLElement) {
    rects?.mockRestore()
    const box = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
    rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const i = Array.from(container.querySelectorAll('[data-chart-box]')).indexOf(this)
      return i >= 0 ? box(i * 108, 0, 100, 100) : box(0, 0, 424, 100)
    })
  }
  // A drag from a title: a press, a move past the threshold, then each point.
  function dragTitle(title: HTMLElement, from: { x: number; y: number }, ...to: { x: number; y: number }[]) {
    fireEvent.pointerDown(title, { button: 0, pointerId: 1, clientX: from.x, clientY: from.y })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: from.x + 10, clientY: from.y })
    for (const p of to) fireEvent.pointerMove(document, { pointerId: 1, clientX: p.x, clientY: p.y })
  }
  const release = (p: { x: number; y: number }) => fireEvent.pointerUp(document, { pointerId: 1, clientX: p.x, clientY: p.y })

  beforeEach(() => {
    chart.lines = []
    chart.dotsAt = []
    // Every frame at once; 0 so the next move queues its own.
    raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
  })
  afterEach(() => {
    rects?.mockRestore()
    raf?.mockRestore()
    rects = undefined
    raf = undefined
    ghost()?.remove()
  })

  it('names every drawn panel at two, three and four, in the picker\'s own words', () => {
    for (const metrics of [FOUR.slice(0, 2), FOUR.slice(0, 3), FOUR]) {
      const { container, unmount } = render(<TimeSeriesChart {...props({ metrics, sortBy: 'precip_total_in' })} />)
      expect(texts(container)).toEqual(metrics.map(label))
      for (const t of titles(container)) {
        // A quiet name: hidden from assistive technology, no control, no tooltip.
        expect(t.tagName).toBe('DIV')
        expect(t.getAttribute('aria-hidden')).toBe('true')
        expect(t.hasAttribute('title')).toBe(false)
        expect(t.className.startsWith(CHART_PANEL_TITLE.chip)).toBe(true)
      }
      unmount()
    }
  })

  it('names no panel when one is drawn, and none on a phone', () => {
    const one = render(<TimeSeriesChart {...props()} />)
    expect(titles(one.container)).toEqual([])
    one.unmount()
    const phone = render(<TimeSeriesChart {...props({ metrics: FOUR, phone: true })} />)
    expect(titles(phone.container)).toEqual([])
  })

  // Placed over the plot band's corner rather than in its margin, so the
  // plot keeps its margins and a hover reads the hours it read before.
  it('stands at the band\'s top left, outside the plot, the margins unmoved', () => {
    const { container } = render(<TimeSeriesChart {...props({ metrics: FOUR.slice(0, 2) })} />)
    const [first] = titles(container)
    expect({ left: first.style.left, top: first.style.top }).toEqual({ left: `${titleAt().left}px`, top: `${titleAt().top}px` })
    for (const plot of Array.from(container.querySelectorAll('[data-chart-stage]')).map((s) => s.parentElement!)) {
      expect(titles(container).some((t) => plot.contains(t))).toBe(false)
    }
    // Beside the plot in its box, which a split drag moves, and out of the
    // stage, which a split drag stretches.
    expect(first.parentElement!.hasAttribute('data-chart-box')).toBe(true)
    expect(chart.margin).toEqual(PLOT_MARGIN)
  })

  it('follows a pick and a move', () => {
    const { container, rerender } = render(<TimeSeriesChart {...props({ metrics: FOUR })} />)
    rerender(<TimeSeriesChart {...props({ metrics: ['wind', 'temp', 'precip', 'aqi'] })} />)
    expect(texts(container)).toEqual(['wind', 'temp', 'precip', 'aqi'].map((k) => label(k as ChartMetric)))
    rerender(<TimeSeriesChart {...props({ metrics: ['wind', 'precip', 'aqi', 'temp'] })} />)
    expect(texts(container)).toEqual(['wind', 'precip', 'aqi', 'temp'].map((k) => label(k as ChartMetric)))
  })

  it('makes the first title a label and every other a handle that lights under the pointer', () => {
    const { container } = render(<TimeSeriesChart {...props({ metrics: FOUR })} />)
    const [first, ...rest] = titles(container)
    expect(first.className).not.toContain('cursor-grab')
    expect(first.className).not.toContain(ACCENT.hoverText)
    for (const t of rest) {
      expect(t.className).toContain(CHART_PANEL_TITLE.grab)
      expect(t.className).toContain(ACCENT.hoverText)
    }
  })

  // The chrome label moves, the title never does: a titled first panel's Now
  // label stands under the chip, and one panel's keeps its place.
  it('moves the Now label under the title, and only in a titled panel', () => {
    vi.setSystemTime(TIMES[10])
    const seam = () => (chart.lines as LineProps[]).filter((l) => l.x === TIMES[10] && l.label).map((l) => l.label!)
    const two = render(<TimeSeriesChart {...props({ metrics: FOUR.slice(0, 2) })} />)
    expect(seam().map((l) => [l.value, l.dy])).toEqual([['Now', TITLED_TOP_LABEL_DY]])
    two.unmount()
    chart.lines = []
    const one = render(<TimeSeriesChart {...props()} />)
    expect(seam().map((l) => [l.value, l.dy])).toEqual([['Now', undefined]])
    one.unmount()
    chart.lines = []
    render(<TimeSeriesChart {...props({ metrics: FOUR.slice(0, 2), phone: true })} />)
    expect(seam().map((l) => [l.value, l.dy])).toEqual([['Now', undefined]])
  })

  it('hangs a titled panel\'s extreme label under the title', () => {
    const rows = [resultRow({ name: 'Mount Alpha', series: series({ wind_mph: TIMES.map((_, i) => (i === 6 ? 75.4 : 20)) }) })]
    render(<TimeSeriesChart {...props({ rows, metrics: ['wind', 'temp'], sortBy: 'wind_avg_mph' })} />)
    const [extreme] = (chart.lines as LineProps[]).filter((p) => p.y === 75.4)
    const Content = extreme.label!.content as (p: object) => ReactNode
    render(<>{Content({ ...extreme.label, viewBox: { x: 52, y: PLOT_MARGIN.top + 2, width: 156, height: 0 } })}</>)
    const drawn = screen.getByTestId('label')
    expect(drawn.dataset.position).toBe('insideTopRight')
    // 5px off its line and 14 more: 21px under the band's top, under the chip.
    expect(drawn.dataset.dy).toBe('14')
  })

  it('moves a panel by its title as the grip would, and the row follows', () => {
    const onMove = vi.fn()
    const { container } = render(<Held start={FOUR} layout="row" onMove={onMove} />)
    layOut(container)
    const aqiBox = titleOf(container, 'aqi').closest('[data-chart-box]')
    // From the last slot to over the second: the move the grip test makes.
    dragTitle(titleOf(container, 'aqi'), { x: 350, y: 10 }, { x: 158, y: 50 })
    release({ x: 158, y: 50 })
    expect(onMove.mock.calls).toEqual([[3, 1]])
    expect(texts(container)).toEqual(['precip', 'aqi', 'temp', 'wind'].map((k) => label(k as ChartMetric)))
    expect(grips()).toEqual(['aqi', 'temp', 'wind'].map((k) => `Move ${label(k as ChartMetric)}`))
    // Keyed by metric, so the panel that moved is the same element.
    expect(titleOf(container, 'aqi').closest('[data-chart-box]')).toBe(aqiBox)
    expect(container.querySelectorAll('[data-chart-box]')[1]).toBe(aqiBox)
  })

  it('lifts a picture of the panel and marks where it lands with one bar', () => {
    const { container } = render(<Held start={FOUR} layout="row" />)
    layOut(container)
    expect(bar(container).hidden).toBe(true)
    dragTitle(titleOf(container, 'aqi'), { x: 350, y: 10 }, { x: 158, y: 50 })
    const lifted = ghost()!
    expect(lifted.getAttribute('aria-hidden')).toBe('true')
    expect(lifted.querySelector('[data-chart-box], [data-chart-stage], [data-panel-label]')).toBeNull()
    expect(lifted.textContent).toContain(label('aqi'))
    // Pressed 26px into the box and 10 down, at half size, under the pointer.
    expect(lifted.style.transform).toBe(ghostTransform({ x: 158, y: 50 }, { x: 26, y: 10 }, GHOST_SCALE))
    expect([lifted.style.width, lifted.style.height]).toEqual(['100px', '100px'])
    // Before the second panel: in the gutter on its left.
    const b = bar(container)
    expect(b.hidden).toBe(false)
    expect([b.style.left, b.style.top, b.style.width, b.style.height]).toEqual(['103px', '0px', '2px', '100px'])
    // Back over its own slot: no bar.
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 380, clientY: 50 })
    expect(bar(container).hidden).toBe(true)
    release({ x: 380, y: 50 })
    expect(ghost()).toBeUndefined()
  })

  it('changes nothing on a drop on the first slot, its own slot, or outside every panel', () => {
    const onMove = vi.fn()
    const { container } = render(<Held start={FOUR} layout="row" onMove={onMove} />)
    layOut(container)
    for (const at of [{ x: 50, y: 50 }, { x: 380, y: 50 }, { x: 200, y: 400 }]) {
      dragTitle(titleOf(container, 'aqi'), { x: 350, y: 10 }, at)
      expect(bar(container).hidden).toBe(true)
      release(at)
      expect(ghost()).toBeUndefined()
    }
    // A press that never travels is no drag.
    fireEvent.pointerDown(titleOf(container, 'aqi'), { button: 0, pointerId: 1, clientX: 350, clientY: 10 })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 352, clientY: 11 })
    expect(ghost()).toBeUndefined()
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 352, clientY: 11 })
    // The first title takes no drag at all.
    dragTitle(titleOf(container, 'precip'), { x: 60, y: 10 }, { x: 260, y: 50 })
    expect(ghost()).toBeUndefined()
    release({ x: 260, y: 50 })
    expect(onMove).not.toHaveBeenCalled()
    expect(texts(container)).toEqual(FOUR.map(label))
  })

  it('lets go on a cancel, and on Escape without closing a pinned card', () => {
    const onMove = vi.fn()
    const { container } = render(<Held start={FOUR} layout="row" onMove={onMove} onPlayheadChange={() => {}} />)
    layOut(container)
    dragTitle(titleOf(container, 'aqi'), { x: 350, y: 10 }, { x: 158, y: 50 })
    fireEvent.pointerCancel(document, { pointerId: 1 })
    expect(ghost()).toBeUndefined()
    expect(bar(container).hidden).toBe(true)
    release({ x: 158, y: 50 })
    act(() => chart.charts[chart.charts.length - 1].onClick!({ activeLabel: TIMES[2] }, { clientX: 100 }))
    expect(screen.getAllByRole('button', { name: /^Unpin / })).toHaveLength(1)
    dragTitle(titleOf(container, 'aqi'), { x: 350, y: 10 }, { x: 158, y: 50 })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(ghost()).toBeUndefined()
    expect(screen.getAllByRole('button', { name: /^Unpin / })).toHaveLength(1)
    release({ x: 158, y: 50 })
    expect(onMove).not.toHaveBeenCalled()
    expect(texts(container)).toEqual(FOUR.map(label))
  })

  // The title stands outside the plot, so the plot's own handlers never hear it.
  it('never pins a card, moves the playhead or reads a finger from a press on a title', () => {
    const onPlayheadChange = vi.fn()
    const { container } = render(<TimeSeriesChart {...props({ metrics: FOUR, onPlayheadChange })} />)
    for (const t of titles(container)) {
      fireEvent.pointerDown(t, { pointerType: 'touch', pointerId: 2, clientX: 252, clientY: 560 })
      fireEvent.pointerUp(t, { pointerType: 'touch', pointerId: 2, clientX: 252, clientY: 560 })
      fireEvent.pointerDown(t, { button: 0, pointerId: 1, clientX: 252, clientY: 560 })
      fireEvent.pointerUp(document, { pointerId: 1, clientX: 252, clientY: 560 })
      fireEvent.click(t)
    }
    expect(onPlayheadChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Unpin / })).toBeNull()
    expect(chart.dotsAt.every((at) => at === null)).toBe(true)
  })
})
