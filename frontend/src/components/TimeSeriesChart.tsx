import { ReactNode, memo, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DestinationResult } from '../types'
import { CHART_METRIC_W, RADIUS, SELECT, SURFACE_FLOATING, TEXT } from '../styles'
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
  cutSeriesAfter,
  formatMetricValue,
  nearestKey,
  pixelToValue,
  tracksCursor,
  valueAt,
  tooltipCapacity,
} from '../utils/chartData'

// Explicit geometry so the hover handler can invert pixels → data values: the
// plotting band is the container minus these margins and the x-axis strip.
const MARGIN = { top: 8, right: 16, bottom: 2, left: 8 }
const X_AXIS_HEIGHT = 22

// Which rows are plotted is the table's job: the checkbox column is the one
// series picker (#242 review dropped the chart's own legend strip), so this
// component only receives the rows already chosen.
interface Props {
  times: number[]
  rows: DestinationResult[]
  metric: ChartMetric
  onMetricChange: (m: ChartMetric) => void
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
   * `times`, coloured, named and already clamped — because what a comparison
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
   * Where every line on the chart stops, `rows` included. Null unless a
   * comparison has clamped it: lines running to different hours cannot be read
   * against each other, so the shortest reach on the chart bounds all of them.
   */
  cutAfterMs?: number | null
  /** The comparison control, rendered beside the metric select. */
  controls?: ReactNode
}

// A stable empty default: a fresh `[]` per render would rebuild every line, and
// with it every path Recharts strokes, on every hover.
const NO_EXTRA_LINES: readonly ChartLine[] = []

function TimeSeriesChart({
  times,
  rows,
  metric,
  onMetricChange,
  colorFor,
  playheadMs = null,
  onPlayheadChange,
  extraLines = NO_EXTRA_LINES,
  cutAfterMs = null,
  controls,
}: Props) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [cursorValue, setCursorValue] = useState<number | null>(null)

  // Align each series onto the active grid by timestamp — a no-op for ranked
  // rows; a pinned row may have been fetched for a different window — then stop
  // it wherever a comparison says every line stops.
  const aligned = useMemo(
    () =>
      rows.map((r) => {
        const onGrid = alignRowToGrid(r, times)
        if (cutAfterMs === null) return onGrid
        return { ...onGrid, series: cutSeriesAfter(times, onGrid.series, cutAfterMs) }
      }),
    [rows, times, cutAfterMs],
  )

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
      })),
      ...extraLines,
    ],
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

  // Render the focused line last (on top) with siblings dimmed. One nearest-line
  // computation feeds both the line emphasis and the tooltip ordering.
  const ordered = focusedKey
    ? [
        ...lines.filter((l) => l.key !== focusedKey),
        ...lines.filter((l) => l.key === focusedKey),
      ]
    : lines

  function handleMove(state: any) {
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

  // A click puts the map's playhead on the hour under the pointer. The chart
  // and the map are two views of one hourly grid, so a reader who has found the
  // bad afternoon on the chart should be able to see it on the map without
  // hunting for it again on a 200px scrubber. `activeLabel` is Recharts' own
  // name for the x value the tooltip is tracking, which is the timestamp.
  function handleClick(state: any) {
    const t = state?.activeLabel
    if (onPlayheadChange && typeof t === 'number') onPlayheadChange(t)
  }

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
      <div className="flex flex-shrink-0 items-center gap-x-4 px-3 py-1">
        {/* flex, not block, for the reason the ranking rows' dropdown gives:
            an inline-level select in a block wrapper reserves descender space
            below itself and sits a pixel low against what is beside it. */}
        <div className="relative flex flex-shrink-0">
          <select
            aria-label="Chart metric"
            value={metric}
            onChange={(e) => onMetricChange(e.target.value as ChartMetric)}
            className={`${SELECT} ${CHART_METRIC_W} px-2 py-0.5`}
          >
            {CHART_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <IconSelectArrow />
        </div>
        {controls}
      </div>

      <div ref={plotRef} className="min-h-0 flex-1 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={MARGIN}
            onMouseMove={followCursor ? handleMove : undefined}
            onMouseLeave={followCursor ? handleLeave : undefined}
            onClick={onPlayheadChange ? handleClick : undefined}
            className={onPlayheadChange ? 'cursor-pointer' : undefined}
          >
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              height={X_AXIS_HEIGHT}
              stroke="#94a3b8"
              tick={{ fontSize: 10 }}
              tickFormatter={(t: any) => axisTimeLabel(t, spanMs)}
            />
            <YAxis
              domain={[yMin, yMax]}
              width={44}
              stroke="#94a3b8"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: any) => formatMetricValue(v, metric)}
            />
            {/* Wears the axis's own color rather than a semantic one: it is
                chrome marking where the x-axis changes meaning, not a warning.
                Dashed so it cannot be mistaken for a series. */}
            {nowMs !== null && (
              <ReferenceLine
                x={nowMs}
                stroke="#94a3b8"
                strokeDasharray="4 3"
                label={{ value: 'Now', position: 'insideTopLeft', fill: '#94a3b8', fontSize: 10 }}
              />
            )}
            {/* The map's playhead. Solid and in the accent where the "Now"
                seam above is dashed and in the axis colour, because this one
                is a control's position and that one is a fact about the data.
                No label: the transport's own readout already states the hour,
                and a second copy of it would move with the line across a chart
                that is mostly line already. */}
            {playheadMs !== null && (
              <ReferenceLine x={playheadMs} stroke="#38bdf8" strokeWidth={1.5} />
            )}
            <Tooltip
              isAnimationActive={false}
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
          </LineChart>
        </ResponsiveContainer>
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
          <span className="font-mono">{formatMetricValue(it.value, metric)}</span>
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
