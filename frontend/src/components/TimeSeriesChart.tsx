import { type PointerEvent, ReactNode, memo, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DestinationResult, SortBy } from '../types'
import { CHART_METRIC_W, CHART_PLOT_TOUCH, CHART_TITLE, RADIUS, SELECT, SURFACE_FLOATING, TEXT } from '../styles'
import { IconSelectArrow } from './icons'
import {
  CHART_METRICS,
  ChartLine,
  ChartMetric,
  alignRowToGrid,
  axisTimeLabel,
  nowWithinGrid,
  buildChartData,
  chartKey,
  computeYDomain,
  extremeLabel,
  extremeLabelPosition,
  extremeValue,
  formatMetricValue,
  formatTooltipValue,
  metricForSort,
  nearestKey,
  pixelToValue,
  tracksCursor,
  valueAt,
  tooltipCapacity,
} from '../utils/chartData'
import type { ModelEndLine } from '../utils/modelCompare'
import {
  PLOT_MARGIN,
  TITLED_PLOT_MARGIN,
  X_AXIS_HEIGHT_PX,
  Y_AXIS_WIDTH_PX,
  fingerReading,
  hourIndexAt,
} from '../utils/chartPointer'
import {
  CHART_AXIS_COLOR,
  CHART_GRID_COLOR,
  CHART_PLAYHEAD_COLOR,
  CHART_SURFACE_COLOR,
  CHART_TICK_PX,
} from '../utils/chartColors'

// Explicit geometry so the hover handler can invert pixels → data values: the
// plotting band is the container minus these margins and the x-axis strip.
// The numbers are `utils/chartPointer.ts`', which a finger's reading and a
// click's hour invert through too. A phone's plot takes the titled margins,
// its picker standing as a title over the plot (#696).
const X_AXIS_HEIGHT = X_AXIS_HEIGHT_PX
// Hoisted so both axes hand Recharts one object rather than a new one a render.
const AXIS_TICK = { fontSize: CHART_TICK_PX }
// Named rather than spelled on the YAxis alone, because a click is inverted to an
// hour through the plotting band's left edge, which sits after this strip.
const Y_AXIS_WIDTH = Y_AXIS_WIDTH_PX

// The chart's chrome lines: the Now seam, a compared model's end and the
// extreme value (#699). One stroke and one label style for all of them, so
// they read as one kind of mark and cannot drift apart. Dashed so none can be
// mistaken for a series, and in the axis colour because each marks a fact
// about the data rather than a warning.
const CHROME_LINE = { stroke: CHART_AXIS_COLOR, strokeDasharray: '4 3' } as const
//
// Every label wears a halo in the panel's own colour: the stroke is painted
// first (`paintOrder`), so it erases whatever line runs under the letters and
// the fill stands on the surface, where the bare text was lost wherever a
// series crossed it. 3px is a pixel and a half either side of an 11px glyph's
// strokes, enough to clear a 2.5px focused line without fattening the type.
type ChromeLabelPosition = 'insideTopLeft' | 'insideTopRight' | 'insideBottomRight'
function chromeLabel(value: string, position: ChromeLabelPosition) {
  return {
    value,
    position,
    fill: CHART_AXIS_COLOR,
    fontSize: CHART_TICK_PX,
    stroke: CHART_SURFACE_COLOR,
    strokeWidth: 3,
    strokeLinejoin: 'round' as const,
    paintOrder: 'stroke',
  }
}

/**
 * The extreme line's label, placed once Recharts knows where the line is: at
 * its right end, above it, or below it when the line runs through the top
 * headroom (`extremeLabelPosition`). Everything else is the chrome label as
 * given; the computed x and y are dropped so the inner Label places itself
 * for the position chosen here rather than the one it was handed.
 */
function headroomLabel(plotTop: number) {
  return function HeadroomLabel({ viewBox, x: _x, y: _y, content: _content, ...rest }: any) {
    return <Label {...rest} viewBox={viewBox} position={extremeLabelPosition(viewBox.y, plotTop)} />
  }
}
// One per margin, hoisted, so the label's component is the same between
// renders and Recharts never remounts it.
const HEADROOM_LABEL = headroomLabel(PLOT_MARGIN.top)
const TITLED_HEADROOM_LABEL = headroomLabel(TITLED_PLOT_MARGIN.top)

// Which rows are plotted is the table's job: the checkbox column is the one
// series picker (#242 review dropped the chart's own legend strip), so this
// component only receives the rows already chosen.
interface Props {
  /**
   * An hour index the tooltip stands on without a mouse, or null to follow
   * one. The tutorial's results step sets it so the card can be read beside
   * what a hover shows (#536).
   */
  tooltipIndex?: number | null

  times: number[]
  rows: DestinationResult[]
  metric: ChartMetric
  onMetricChange: (m: ChartMetric) => void
  /**
   * The ranking and its direction, which decide which end of the charted
   * family the extreme line marks. Primitives, so the memo compares them by
   * value; the direction is resolved in here rather than by the caller.
   */
  sortBy: SortBy
  sortDesc: boolean
  colorFor: (row: DestinationResult) => string
  // The map timeline's playhead, when it is scrubbing this same grid (#121).
  // Null whenever it is not — no analysis, or the transport sitting on the
  // radar axis — so the line appears exactly when there is a moment on the map
  // it corresponds to.
  playheadMs?: number | null
  // Move that playhead by clicking the chart. Absent when no forecast axis
  // exists, which is what makes a click on a chart with no timeline behind it
  // do nothing rather than something invisible.
  onPlayheadChange?: (ms: number) => void
  /**
   * Lines that are not plain destinations: one per (destination, model) pair
   * while a comparison is up (#232). They arrive ready to draw — aligned to
   * `times`, coloured and named, because what a comparison
   * covers is a decision about spend rather than about drawing. Every line is
   * solid: colour is the one channel, the destination's on the ranking model's
   * lines and the model's on every other, and `chartColors.ts` is what keeps
   * the two sets apart.
   *
   * A comparison supplies the ranking model's lines here too, and `rows` then
   * arrives empty: every entry has to read alike, so all of them are composed
   * in one place rather than half here and half there.
   */
  extraLines?: readonly ChartLine[]
  /**
   * Where a compared model's forecast ends inside the window, one entry per
   * instant (#493). Every line runs to its own model's reach, so a shorter
   * model's lines simply stop; this is what says where and why.
   */
  modelEnds?: readonly ModelEndLine[]
  /** The comparison control, rendered beside the metric select. */
  controls?: ReactNode
  /**
   * A phone (#696; record 0149): the metric select is the plot's title rather
   * than a row above it, and the plot is inset under the title's line.
   */
  titled?: boolean
}

// A stable empty default: a fresh `[]` per render would rebuild every line, and
// with it every path Recharts strokes, on every hover.
const NO_EXTRA_LINES: readonly ChartLine[] = []
const NO_MODEL_ENDS: readonly ModelEndLine[] = []

function TimeSeriesChart({
  tooltipIndex = null,
  times,
  rows,
  metric,
  onMetricChange,
  sortBy,
  sortDesc,
  colorFor,
  playheadMs = null,
  onPlayheadChange,
  extraLines = NO_EXTRA_LINES,
  modelEnds = NO_MODEL_ENDS,
  controls,
  titled = false,
}: Props) {
  const plotRef = useRef<HTMLDivElement>(null)
  // Where the last finger went down on the plot, for the click its tap makes.
  const tapXRef = useRef<number | null>(null)
  // A phone's picker is the plot's title rather than a row above it (#696),
  // and the plot is inset under it.
  const MARGIN = titled ? TITLED_PLOT_MARGIN : PLOT_MARGIN
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [cursorValue, setCursorValue] = useState<number | null>(null)
  // The hour a finger reads (#336; record 0144), which the tooltip shows as
  // it shows a hovered one. A touch sends no hover, so Recharts never learns
  // the hour from it; this is the hour handed to it instead. Kept when the
  // finger lifts, so the reading can be read without a finger over it.
  const [fingerIndex, setFingerIndex] = useState<number | null>(null)

  // Align each series onto the active grid by timestamp — a no-op for ranked
  // rows; a pinned row may have been fetched for a different window.
  const aligned = useMemo(() => rows.map((r) => alignRowToGrid(r, times)), [rows, times])

  // Everything plotted, as lines rather than rows: under a comparison a line is
  // a destination AND a model (#232), and nothing below this point has any
  // reason to know which kind it is drawing.
  //
  // `colorFor` is deliberately not a dependency. It is a fresh closure every
  // render by construction, so including it would rebuild every line on every
  // hover — the exact cost the `data` memo below exists to avoid — and it
  // cannot answer differently for a row that has not changed: a colour is
  // assigned once per coordinate and never reassigned.
  const lines: ChartLine[] = useMemo(
    () => [
      ...aligned.map((row) => ({
        key: chartKey(row),
        label: row.name,
        color: colorFor(row),
        series: row.series,
        // A plain row is a destination as the field ranked it, so it may set
        // the extreme line; a comparison marks its own lines.
        ranked: true,
      })),
      ...extraLines,
    ],
    // Kept: `colorFor` is the omission, and the paragraph above says why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aligned, extraLines],
  )
  // A point-sample analysis has a one-timestamp grid: there are no segments to
  // stroke, so each series must render as a dot or the chart would come up blank.
  const pointGrid = times.length === 1
  // The grid's whole extent, which decides whether a tick names an hour or a
  // day. Zero for a point sample, where the single tick is a date either way.
  const spanMs = times.length > 1 ? times[times.length - 1] - times[0] : 0
  // The seam between recorded and expected, when the window spans it. Read once
  // per render rather than memoized: the grid is fixed for the analysis, so this
  // only moves when the clock crosses an hour the chart is already drawing.
  const nowMs = nowWithinGrid(times, Date.now())
  // Whether hovering may emphasize the nearest line. Past the budget it may not:
  // the re-render rebuilds every line's path from every point, and the chart ends
  // up lagging seconds behind the pointer. It falls back to a plain shared
  // tooltip, and comes back on as soon as fewer lines are charted. See tracksCursor.
  const followCursor = tracksCursor(times.length, lines.length)
  // Memoized because hovering re-renders: handleMove below stores the cursor's
  // value and the nearest line in state, so every mouse movement that changes
  // either one lands here again. Neither of these depends on that state, and
  // both are O(times x rows) — for 100 destinations over the full 106-day span
  // that is ~254,000 object writes plus ~254,000 comparisons, re-done per
  // mousemove. Measured before this memo: ~20ms of blocked main thread per
  // hover against a 16.7ms frame budget, and a continuous mousemove stream
  // queued faster than it could be serviced until the renderer stopped
  // answering. Both keys are already stable — `aligned` is itself memoized.
  const data = useMemo(() => buildChartData(times, lines, metric), [times, lines, metric])
  const [yMin, yMax] = useMemo(() => computeYDomain(lines, metric), [lines, metric])
  // Which end of the family the extreme line marks: the ranking's own
  // direction while the chart shows the ranked family, and the largest value
  // on any other, where no direction was ever chosen.
  const highest = metric === metricForSort(sortBy) ? sortDesc : true
  // Memoized beside the y domain for the same reason: it is a walk over every
  // drawn value, and a hover re-renders without changing any of its inputs.
  const extreme = useMemo(() => extremeValue(lines, metric, highest), [lines, metric, highest])

  // Render the focused line last (on top) with siblings dimmed. One nearest-line
  // computation feeds both the line emphasis and the tooltip ordering.
  const ordered = focusedKey
    ? [
        ...lines.filter((l) => l.key !== focusedKey),
        ...lines.filter((l) => l.key === focusedKey),
      ]
    : lines

  function handleMove(state: any) {
    // A mouse takes the reading back from a finger that left one.
    if (fingerIndex !== null) setFingerIndex(null)
    tapXRef.current = null
    const idx = state?.activeTooltipIndex
    const py = typeof state?.chartY === 'number' ? state.chartY : state?.activeCoordinate?.y
    const h = plotRef.current?.clientHeight ?? 0
    const plotHeight = h - MARGIN.top - MARGIN.bottom - X_AXIS_HEIGHT
    if (idx == null || typeof py !== 'number' || plotHeight <= 0) {
      setFocusedKey(null)
      setCursorValue(null)
      return
    }
    const cv = pixelToValue(py, MARGIN.top, plotHeight, yMin, yMax)
    const valuesByKey: Record<string, number | null> = {}
    for (const line of lines) valuesByKey[line.key] = valueAt(line, metric, idx)
    setCursorValue(cv)
    setFocusedKey(nearestKey(valuesByKey, cv))
  }

  function handleLeave() {
    setFocusedKey(null)
    setCursorValue(null)
  }

  // A finger (or a pen) on the chart reads the hour under it, as a resting
  // mouse does: the tooltip at that hour and, where the chart may follow a
  // cursor, the nearest line drawn over the rest. A horizontal drag keeps
  // reading, because the plot leaves only vertical panning to the browser
  // (`touch-pan-y` below); a vertical drag is the sheet's scroll, and the
  // browser cancels the pointer, which drops the reading.
  function readFinger(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse') return
    if (e.type === 'pointerdown') tapXRef.current = e.clientX
    const el = plotRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const reading = fingerReading(e.clientX - box.left, e.clientY - box.top, box, times, yMin, yMax, MARGIN)
    if (reading === null) return
    setFingerIndex(reading.index)
    if (!followCursor) return
    const valuesByKey: Record<string, number | null> = {}
    for (const line of lines) valuesByKey[line.key] = valueAt(line, metric, reading.index)
    setCursorValue(reading.value)
    setFocusedKey(nearestKey(valuesByKey, reading.value))
  }

  function dropFinger() {
    tapXRef.current = null
    setFingerIndex(null)
    handleLeave()
  }
  // The tutorial's hour wins over a finger's; an hour past a grid that has
  // since shrunk is no reading at all.
  const shownIndex = tooltipIndex ?? (fingerIndex !== null && fingerIndex < times.length ? fingerIndex : null)

  // A click puts the map's playhead on the hour under the pointer. The chart
  // and the map are two views of one hourly grid, so a reader who has found the
  // bad afternoon on the chart should be able to see it on the map without
  // hunting for it again on a 200px scrubber.
  //
  // The hour is read from the click's own `clientX`, inverted through the
  // plotting band and snapped to the grid, which is the hour a hover at that
  // pixel names. Recharts' `activeLabel` is not trusted first because it comes
  // from the hover state: a touch tap sends no hover before its click, so the
  // first tap carries no label, and each later tap carries the hour the tap
  // BEFORE it left behind. The label stays as the fallback for a click that
  // arrives with no position.
  //
  // A tap's own click is not trusted for its pixel either: Chrome moves the
  // click it makes from a tap toward a clickable node near the finger (touch
  // adjustment), 7px left of the finger in the browser suite (#696), which
  // named the hour before the one the finger read. So a tap names the hour
  // where the finger went down (`tapXRef`), the one its reading shows.
  function handleClick(state: any, event?: { clientX?: unknown }) {
    if (!onPlayheadChange) return
    const x = tapXRef.current ?? event?.clientX
    tapXRef.current = null
    const el = plotRef.current
    if (typeof x === 'number' && el) {
      const box = el.getBoundingClientRect()
      const i = hourIndexAt(x - box.left, box.width, times)
      if (i !== null) {
        onPlayheadChange(times[i])
        return
      }
    }
    const t = state?.activeLabel
    if (typeof t === 'number') onPlayheadChange(t)
  }

  const metricOptions = CHART_METRICS.map((m) => (
    <option key={m.key} value={m.key}>
      {m.label}
    </option>
  ))
  const metricLabel = CHART_METRICS.find((m) => m.key === metric)?.label ?? ''

  return (
    <div className="flex h-full flex-col">
      {/* The metric, one series at a time; opens on the ranked metric.

          A select rather than one radio per metric (#348). The labels carry
          their units, and five of them at the panel's 12px type need 584px of
          row, where a phone's results sheet is the phone's width: at 402px the
          radios wrapped and AQI sat alone on a second line. The select is
          CHART_METRIC_W wide whatever its labels say, so this row cannot wrap
          and a sixth metric costs it nothing. It is the panel's old 144px
          rather than the 118px column the sidebar came down to: this control
          lines up with nothing above it, and `Freezing level (ft)` needs the
          wider one. The row itself does not wrap either:
          the comparison note beside the control shrinks (`min-w-0`) rather
          than dropping under it. */}
      {/* At a desk the select stands in a row above the plot; on a phone it
          is the plot's title (below), and the row stands only to hold a
          comparison's note. */}
      {(!titled || controls) && (
        <div className="flex flex-shrink-0 items-center gap-x-4 px-3 py-1">
          {!titled && (
            // flex, not block, for the reason the ranking rows' dropdown
            // gives: an inline-level select in a block wrapper reserves
            // descender space below itself and sits a pixel low against what
            // is beside it.
            <div className="relative flex flex-shrink-0">
              <select
                aria-label="Chart metric"
                value={metric}
                onChange={(e) => onMetricChange(e.target.value as ChartMetric)}
                className={`${SELECT} ${CHART_METRIC_W} px-2 py-0.5`}
              >
                {metricOptions}
              </select>
              <IconSelectArrow />
            </div>
          )}
          {controls}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* A phone's picker (#696, record 0149): the app's select at the
            metric's width as the plot's title, the native select laid over it so a
            tap opens the phone's own picker. Outside the plot's box, so a press
            on it is the select's and not a finger reading the plot. */}
        {titled && (
          <div className={CHART_TITLE.box}>
            <span aria-hidden="true" className={CHART_TITLE.text}>
              {metricLabel}
            </span>
            <IconSelectArrow />
            <select
              aria-label="Chart metric"
              value={metric}
              onChange={(e) => onMetricChange(e.target.value as ChartMetric)}
              className={CHART_TITLE.select}
            >
              {metricOptions}
            </select>
          </div>
        )}
        <div
          ref={plotRef}
          onPointerDown={readFinger}
          onPointerMove={readFinger}
          onPointerCancel={dropFinger}
          className={`min-h-0 flex-1 overflow-hidden ${CHART_PLOT_TOUCH}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={MARGIN}
              onMouseMove={followCursor ? handleMove : undefined}
              onMouseLeave={followCursor ? handleLeave : undefined}
              onClick={onPlayheadChange ? handleClick : undefined}
              className={onPlayheadChange ? 'cursor-pointer' : undefined}
            >
              <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                height={X_AXIS_HEIGHT}
                stroke={CHART_AXIS_COLOR}
                tick={AXIS_TICK}
                tickFormatter={(t: any) => axisTimeLabel(t, spanMs)}
              />
              <YAxis
                domain={[yMin, yMax]}
                width={Y_AXIS_WIDTH}
                stroke={CHART_AXIS_COLOR}
                tick={AXIS_TICK}
                tickFormatter={(v: any) => formatMetricValue(v, metric)}
              />
              {/* Wears the axis's own color rather than a semantic one: it is
                  chrome marking where the x-axis changes meaning, not a warning.
                  Dashed so it cannot be mistaken for a series. */}
              {nowMs !== null && (
                <ReferenceLine x={nowMs} {...CHROME_LINE} label={chromeLabel('Now', 'insideTopLeft')} />
              )}
              {/* Where a compared model's forecast ends. Chrome marking where
                  one model's data stops, not a warning, so it wears the axis
                  colour and the "Now" seam's dash rather than a status hue: a
                  shorter reach is a fact about the model, not a fault. The label
                  is the whole signal, which is why there is no hover entry. */}
              {modelEnds.map((end) => (
                <ReferenceLine
                  key={end.endMs}
                  x={end.endMs}
                  {...CHROME_LINE}
                  label={chromeLabel(end.label, 'insideTopLeft')}
                />
              ))}
              {/* The map's playhead. Solid and in the accent where the "Now"
                  seam above is dashed and in the axis colour, because this one
                  is a control's position and that one is a fact about the data.
                  No label: the transport's own readout already states the hour,
                  and a second copy of it would move with the line across a chart
                  that is mostly line already. */}
              {playheadMs !== null && (
                <ReferenceLine x={playheadMs} stroke={CHART_PLAYHEAD_COLOR} strokeWidth={1.5} />
              )}
              <Tooltip
                isAnimationActive={false}
                defaultIndex={shownIndex ?? undefined}
                active={shownIndex === null ? undefined : true}
                content={(props: any) => (
                  <ChartTooltip
                    {...props}
                    lines={lines}
                    metric={metric}
                    focusedKey={focusedKey}
                    cursorValue={cursorValue}
                    // Read at render rather than observed: this component
                    // re-renders on every hover move, which is the only time
                    // the value is used.
                    maxRows={tooltipCapacity(plotRef.current?.clientHeight ?? 0)}
                  />
                )}
              />
              {ordered.map((line) => {
                const key = line.key
                const dimmed = focusedKey != null && focusedKey !== key
                return (
                  <Line
                    key={key}
                    type="linear"
                    dataKey={key}
                    name={line.label}
                    stroke={line.color}
                    dot={
                      pointGrid
                        ? {
                            r: focusedKey === key ? 4.5 : 3.5,
                            strokeWidth: 0,
                            fill: line.color,
                            fillOpacity: dimmed ? 0.25 : 1,
                          }
                        : false
                    }
                    connectNulls={false}
                    isAnimationActive={false}
                    strokeWidth={focusedKey === key ? 2.5 : 1.5}
                    strokeOpacity={dimmed ? 0.25 : 1}
                  />
                )
              })}
              {/* The most extreme value among the ranked lines drawn (#699),
                  as one dashed line across the plot in the Now seam's style,
                  labelled with the value. A line rather than a mark on a point,
                  because it covers every hour that ties it and never sits on
                  the axis. After the lines, so it stays whole while the hover
                  dims them; a reference line has no hover entry. A point sample
                  gets the same line through its extreme dot. */}
              {extreme !== null && (
                <ReferenceLine
                  y={extreme}
                  {...CHROME_LINE}
                  label={{ ...chromeLabel(extremeLabel(extreme, metric), 'insideBottomRight'), content: titled ? TITLED_HEADROOM_LABEL : HEADROOM_LABEL }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}

function fmtTooltipTime(t: number): string {
  return new Date(t).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface TooltipItem {
  key: string
  value: number
  line: ChartLine
}

interface ChartTooltipProps {
  active?: boolean
  payload?: { dataKey?: string; value?: number | null }[]
  label?: number
  lines: readonly ChartLine[]
  metric: ChartMetric
  focusedKey: string | null
  cursorValue: number | null
  // How many series the card has room to list, from the plot area's current
  // height rather than a constant — see tooltipCapacity.
  maxRows: number
}

// Shared X-locked tooltip: all lines at the hovered instant, ordered by nearness
// to the cursor (focused line bold and first), capped so a big overlay stays
// readable.
function ChartTooltip({
  active,
  payload,
  label,
  lines,
  metric,
  focusedKey,
  cursorValue,
  maxRows,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const items: TooltipItem[] = []
  for (const p of payload) {
    if (p.value == null || p.dataKey == null) continue
    const line = lines.find((l) => l.key === p.dataKey)
    if (line) items.push({ key: p.dataKey, value: p.value, line })
  }
  items.sort((a, b) => {
    if (a.key === focusedKey) return -1
    if (b.key === focusedKey) return 1
    if (cursorValue == null) return b.value - a.value
    return Math.abs(a.value - cursorValue) - Math.abs(b.value - cursorValue)
  })

  const shown = items.slice(0, maxRows)
  const rest = items.length - shown.length

  return (
    <div className={`${SURFACE_FLOATING} ${TEXT.control} px-2.5 py-1.5`}>
      {label != null && (
        <div className={`${TEXT.micro} mb-1 font-mono`}>{fmtTooltipTime(label)}</div>
      )}
      {shown.map((it) => (
        <div
          key={it.key}
          className={`flex items-center justify-between gap-3 ${
            it.key === focusedKey ? 'font-semibold text-white' : ''
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 ${RADIUS.control}`} style={{ backgroundColor: it.line.color }} />
            {it.line.label}
          </span>
          <span className="font-mono">{formatTooltipValue(it.value, metric)}</span>
        </div>
      ))}
      {rest > 0 && <div className={`${TEXT.micro} mt-0.5`}>+{rest} more</div>}
    </div>
  )
}

// Memoized because App.tsx re-renders on any of its 50-odd pieces of state, and
// most of them cannot change what this component draws. Measured 2026-09-14 on
// a 946-destination analysis: toggling a map overlay, which touches neither the
// ranking nor the rows, cost 311 to 392 ms of synchronous React work, because
// the table and the chart both re-rendered for it. Every function prop this
// takes is wrapped in `useCallback` at the call site or in its hook; a fresh
// identity there puts the whole cost straight back (#337, finding 8).
export default memo(TimeSeriesChart)
