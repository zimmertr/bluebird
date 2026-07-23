import { useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DestinationResult } from '../types'
import {
  CHART_METRICS,
  ChartMetric,
  alignRowToGrid,
  buildChartData,
  chartKey,
  computeYDomain,
  formatMetricValue,
  nearestKey,
  pixelToValue,
  valueAt,
} from '../utils/chartData'

// Explicit geometry so the hover handler can invert pixels → data values: the
// plotting band is the container minus these margins and the x-axis strip.
const MARGIN = { top: 8, right: 16, bottom: 2, left: 8 }
const X_AXIS_HEIGHT = 22
const TOOLTIP_MAX = 8

interface Props {
  times: number[]
  rows: DestinationResult[]
  metric: ChartMetric
  onMetricChange: (m: ChartMetric) => void
  colorFor: (row: DestinationResult) => string
  onSetColor: (row: DestinationResult, hex: string) => void
  onRemove: (row: DestinationResult) => void
}

export default function TimeSeriesChart({
  times,
  rows,
  metric,
  onMetricChange,
  colorFor,
  onSetColor,
  onRemove,
}: Props) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [cursorValue, setCursorValue] = useState<number | null>(null)

  // Align each series onto the active grid by timestamp — a no-op for ranked
  // rows; a pinned row may have been fetched for a different window.
  const aligned = useMemo(() => rows.map((r) => alignRowToGrid(r, times)), [rows, times])
  const data = buildChartData(times, aligned, metric)
  const [yMin, yMax] = computeYDomain(aligned, metric)

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

  return (
    <div className="flex h-full flex-col">
      {/* Metric radios — one series at a time; default is the ranked metric. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1">
        {CHART_METRICS.map((m) => (
          <label
            key={m.key}
            className="flex cursor-pointer items-center gap-1 text-xs text-slate-300"
          >
            <input
              type="radio"
              name="chart-metric"
              checked={metric === m.key}
              onChange={() => onMetricChange(m.key)}
              className="accent-sky-500"
            />
            {m.label}
          </label>
        ))}
      </div>

      {/* Legend — swatch opens a color picker; × removes the line. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pb-1">
        {aligned.map((row) => {
          const key = chartKey(row)
          const dim = focusedKey != null && focusedKey !== key
          return (
            <span
              key={key}
              className={`flex items-center gap-1 text-xs ${dim ? 'opacity-40' : ''} ${
                focusedKey === key ? 'font-semibold text-white' : 'text-slate-300'
              }`}
            >
              <label className="relative inline-flex h-3 w-3 cursor-pointer" title="Change line color">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: colorFor(row) }} />
                <input
                  type="color"
                  value={colorFor(row)}
                  onChange={(e) => onSetColor(row, e.target.value)}
                  className="absolute inset-0 h-3 w-3 cursor-pointer opacity-0"
                  aria-label={`Line color for ${row.name}`}
                />
              </label>
              {row.name}
              <button
                onClick={() => onRemove(row)}
                title="Remove from chart"
                aria-label={`Remove ${row.name} from chart`}
                className="leading-none text-slate-500 hover:text-slate-200"
              >
                ×
              </button>
            </span>
          )
        })}
      </div>

      <div ref={plotRef} className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={MARGIN} onMouseMove={handleMove} onMouseLeave={handleLeave}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              height={X_AXIS_HEIGHT}
              stroke="#94a3b8"
              tick={{ fontSize: 10 }}
              tickFormatter={(t: any) => fmtAxisTime(t)}
            />
            <YAxis
              domain={[yMin, yMax]}
              width={44}
              stroke="#94a3b8"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: any) => formatMetricValue(v, metric)}
            />
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
                />
              )}
            />
            {ordered.map((row) => {
              const key = chartKey(row)
              return (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  name={row.name}
                  stroke={colorFor(row)}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  strokeWidth={focusedKey === key ? 2.5 : 1.5}
                  strokeOpacity={focusedKey != null && focusedKey !== key ? 0.25 : 1}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function fmtAxisTime(t: number): string {
  return new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric' })
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

  const shown = items.slice(0, TOOLTIP_MAX)
  const rest = items.length - shown.length

  return (
    <div className="rounded-md border border-slate-600 bg-slate-800/95 px-2.5 py-1.5 text-xs shadow-lg">
      {label != null && (
        <div className="mb-1 font-mono text-[10px] text-slate-400">{fmtTooltipTime(label)}</div>
      )}
      {shown.map((it) => (
        <div
          key={it.key}
          className={`flex items-center justify-between gap-3 ${
            it.key === focusedKey ? 'font-semibold text-white' : 'text-slate-300'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: colorFor(it.row) }} />
            {it.row.name}
          </span>
          <span className="font-mono">{formatMetricValue(it.value, metric)}</span>
        </div>
      ))}
      {rest > 0 && <div className="mt-0.5 text-[10px] text-slate-500">+{rest} more</div>}
    </div>
  )
}
