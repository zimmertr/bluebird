import { useMemo, useRef, useState } from 'react'
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
import { CHOICE_INPUT, CHOICE_ROW, RADIUS, SURFACE_FLOATING, TEXT } from '../styles'
import {
  CHART_METRICS,
  ChartMetric,
  alignRowToGrid,
  axisTimeLabel,
  nowWithinGrid,
  buildChartData,
  chartKey,
  computeYDomain,
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
}

export default function TimeSeriesChart({
  times,
  rows,
  metric,
  onMetricChange,
  colorFor,
  playheadMs = null,
  onPlayheadChange,
}: Props) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [cursorValue, setCursorValue] = useState<number | null>(null)

  // Align each series onto the active grid by timestamp — a no-op for ranked
  // rows; a pinned row may have been fetched for a different window.
  const aligned = useMemo(() => rows.map((r) => alignRowToGrid(r, times)), [rows, times])
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
  const followCursor = tracksCursor(times.length, aligned.length)
  // Memoized because hovering re-renders: handleMove below stores the cursor's
  // value and the nearest line in state, so every mouse movement that changes
  // either one lands here again. Neither of these depends on that state, and
  // both are O(times x rows) — for 100 destinations over the full 106-day span
  // that is ~254,000 object writes plus ~254,000 comparisons, re-done per
  // mousemove. Measured before this memo: ~20ms of blocked main thread per
  // hover against a 16.7ms frame budget, and a continuous mousemove stream
  // queued faster than it could be serviced until the renderer stopped
  // answering. Both keys are already stable — `aligned` is itself memoized.
  const data = useMemo(() => buildChartData(times, aligned, metric), [times, aligned, metric])
  const [yMin, yMax] = useMemo(() => computeYDomain(aligned, metric), [aligned, metric])

  // Render the focused line last (on top) with siblings dimmed. One nearest-line
  // computation feeds both the line emphasis and the tooltip ordering.
  const ordered = focusedKey
    ? [
        ...aligned.filter((r) => chartKey(r) !== focusedKey),
        ...aligned.filter((r) => chartKey(r) === focusedKey),
      ]
    : aligned

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
    for (const row of aligned) valuesByKey[chartKey(row)] = valueAt(row, metric, idx)
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
      {/* Metric radios — one series at a time; default is the ranked metric. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1">
        {CHART_METRICS.map((m) => (
          <label key={m.key} className={CHOICE_ROW}>
            <input
              type="radio"
              name="chart-metric"
              checked={metric === m.key}
              onChange={() => onMetricChange(m.key)}
              className={CHOICE_INPUT}
            />
            {m.label}
          </label>
        ))}
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
                  rows={aligned}
                  metric={metric}
                  colorFor={colorFor}
                  focusedKey={focusedKey}
                  cursorValue={cursorValue}
                  // Read at render rather than observed: this component
                  // re-renders on every hover move, which is the only time
                  // the value is used.
                  maxRows={tooltipCapacity(plotRef.current?.clientHeight ?? 0)}
                />
              )}
            />
            {ordered.map((row) => {
              const key = chartKey(row)
              const dimmed = focusedKey != null && focusedKey !== key
              return (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  name={row.name}
                  stroke={colorFor(row)}
                  dot={
                    pointGrid
                      ? {
                          r: focusedKey === key ? 4.5 : 3.5,
                          strokeWidth: 0,
                          fill: colorFor(row),
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
  row: DestinationResult
}

interface ChartTooltipProps {
  active?: boolean
  payload?: { dataKey?: string; value?: number | null }[]
  label?: number
  rows: DestinationResult[]
  metric: ChartMetric
  colorFor: (row: DestinationResult) => string
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
  rows,
  metric,
  colorFor,
  focusedKey,
  cursorValue,
  maxRows,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const items: TooltipItem[] = []
  for (const p of payload) {
    if (p.value == null || p.dataKey == null) continue
    const row = rows.find((r) => chartKey(r) === p.dataKey)
    if (row) items.push({ key: p.dataKey, value: p.value, row })
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
            <span className={`h-2 w-2 ${RADIUS.control}`} style={{ backgroundColor: colorFor(it.row) }} />
            {it.row.name}
          </span>
          <span className="font-mono">{formatMetricValue(it.value, metric)}</span>
        </div>
      ))}
      {rest > 0 && <div className={`${TEXT.micro} mt-0.5`}>+{rest} more</div>}
    </div>
  )
}
