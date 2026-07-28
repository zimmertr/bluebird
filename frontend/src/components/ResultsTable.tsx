import { useEffect, useRef, useState } from 'react'
import { AnalysisMode, DestinationResult, SortBy } from '../types'
import { cellStyle, METRIC_CONFIG } from '../utils/colors'
import { chartKey, rowsBetween, selectionState } from '../utils/chartData'
import { compareValues } from '../utils/sortResults'
import { pointModeColumns, orderColumns } from '../utils/tableColumns'
import { FireWarning, fireKey, fireWarningText } from '../utils/fireProximity'
import { destinationUrl } from '../utils/destinationUrl'
import { isPeakKind } from '../utils/geocode'
import type { PendingDestination } from '../utils/customList'
import { LINK_ACTION, TEXT } from '../styles'

function windyUrl(lat: number, lon: number, layer: string): string {
  return `https://www.windy.com/?${layer},${lat.toFixed(4)},${lon.toFixed(4)},11`
}

type SortKey = keyof DestinationResult
type SortDir = 'asc' | 'desc'

type ColDef = {
  key: SortKey
  label: string
  format?: (v: unknown) => string
  windyLayer?: string
}

function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

// The number cell that swaps to the remove × on row hover (touch devices show
// both — the row-remove rule in index.css). `rank` is "—" for pending rows.
function RankRemoveCell({ rank, name, onRemove }: { rank: string; name: string; onRemove?: () => void }) {
  return (
    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
      {onRemove ? (
        <>
          <span className="text-slate-500 group-hover:hidden">{rank}</span>
          <button
            onClick={onRemove}
            title="Remove from the results"
            aria-label={`Remove ${name}`}
            className="row-remove hidden group-hover:inline leading-none text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            ×
          </button>
        </>
      ) : (
        <span className="text-slate-500">{rank}</span>
      )}
    </td>
  )
}

const COLUMNS: ColDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'elevation_ft', label: 'Elev (ft)', format: (v) => (v != null ? Number(v).toLocaleString() : '—') },
  { key: 'precip_total_in', label: 'Precip Total (in)', format: (v) => Number(v).toFixed(3), windyLayer: 'rain' },
  { key: 'precip_avg_in_hr', label: 'Precip Avg (in/hr)', format: (v) => Number(v).toFixed(4), windyLayer: 'rain' },
  { key: 'precip_max_in_hr', label: 'Precip Max (in/hr)', format: (v) => Number(v).toFixed(4), windyLayer: 'rain' },
  { key: 'temp_min_f', label: 'Temp Min°F', format: (v) => Number(v).toFixed(1), windyLayer: 'temp' },
  { key: 'temp_max_f', label: 'Temp Max°F', format: (v) => Number(v).toFixed(1), windyLayer: 'temp' },
  { key: 'temp_avg_f', label: 'Temp Avg°F', format: (v) => Number(v).toFixed(1), windyLayer: 'temp' },
  { key: 'wind_min_mph', label: 'Wind Min mph', format: (v) => Number(v).toFixed(1), windyLayer: 'wind' },
  { key: 'wind_max_mph', label: 'Wind Max mph', format: (v) => Number(v).toFixed(1), windyLayer: 'wind' },
  { key: 'wind_avg_mph', label: 'Wind Avg mph', format: (v) => Number(v).toFixed(1), windyLayer: 'wind' },
  { key: 'aqi_avg', label: 'AQI Avg', format: (v) => (v != null ? Number(v).toFixed(0) : '—'), windyLayer: 'pm2p5' },
  { key: 'aqi_max', label: 'AQI Max', format: (v) => (v != null ? Number(v).toFixed(0) : '—'), windyLayer: 'pm2p5' },
]

interface Props {
  results: DestinationResult[]
  sortBy: SortBy
  sortDesc: boolean
  // From the analyzed snapshot, like sortBy/sortDesc: a point-sample analysis
  // ('now'/'at') shows one column per metric instead of the avg/min/max
  // triplets.
  mode?: AnalysisMode
  fireWarnings: Map<string, FireWarning>
  // Custom destinations awaiting their first analysis — pasted CSV rows and
  // searched places alike — shown immediately as un-forecasted rows (name +
  // elevation, "—" metrics) so both inputs have feedback before Analyze runs.
  pending?: PendingDestination[]
  // Absent for a CSV row: its truth is the textarea text, so it is removed by
  // editing that, not by an × here.
  onRemovePending?: (d: PendingDestination) => void
  // The × that replaces a row's rank number on hover — removes the destination
  // from the current report (and, for a searched place, deregisters it).
  onRemove?: (row: DestinationResult) => void
  // Clicking a row's name centers the map on that destination.
  onFocusResult?: (row: DestinationResult) => void
  // Chart selection. When onToggleChart is provided (the analysis carried
  // series), each ranked row with series gets a checkbox that toggles it on the
  // comparison chart, its accent tinted with the destination's line color.
  onToggleChart?: (row: DestinationResult) => void
  isCharted?: (row: DestinationResult) => boolean
  chartColor?: (row: DestinationResult) => string
  // Shift-click range select: (de)select every chartable row in the run,
  // matching the checked state the click produces.
  onChartRange?: (rows: DestinationResult[], selected: boolean) => void
}

export default function ResultsTable({
  results,
  sortBy,
  sortDesc,
  mode = 'window',
  fireWarnings,
  pending,
  onRemovePending,
  onRemove,
  onFocusResult,
  onToggleChart,
  isCharted,
  chartColor,
  onChartRange,
}: Props) {
  const coloredGroup = new Set(METRIC_CONFIG[sortBy].group)
  // The ranked metric's columns lead the table (right after #/Name/Elev), so
  // the numbers the ranking was built from are the first thing read. Keyed on
  // the analyzed snapshot, like the cell colors — panel knob changes don't
  // reshuffle the displayed report.
  const orderedColumns = orderColumns(mode !== 'window' ? pointModeColumns(COLUMNS) : COLUMNS, sortBy)
  const [sortKey, setSortKey] = useState<SortKey>(sortBy)
  const [sortDir, setSortDir] = useState<SortDir>(sortDesc ? 'desc' : 'asc')

  // Shift-click range select: the checkbox last interacted with is the anchor;
  // a shift-held click extends (de)selection to every chartable row between.
  const shiftHeldRef = useRef(false)
  const anchorRef = useRef<string | null>(null)

  // Each analysis is a fresh report: reset the column sort to the ranking that
  // produced it (sortBy/sortDesc are the analyzed snapshot, and `results` is a
  // new array per analysis). Manual header clicks override until then.
  useEffect(() => {
    setSortKey(sortBy)
    setSortDir(sortDesc ? 'desc' : 'asc')
  }, [sortBy, sortDesc, results])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Nulls sort last in both directions; string columns use numeric collation so
  // a CSV numbered 1..100 reads in order. See compareValues.
  const sorted = [...results].sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDir))

  // The leading checkbox column only appears once an analysis has returned
  // series to chart; rows without series (e.g. pinned search forecasts) render
  // an empty cell so the columns stay aligned.
  const showChartCol = !!onToggleChart

  // Every chartable row currently in the table, for the header "select all"
  // box. Its state (all/some/none) drives both the checked mark and the
  // indeterminate dash.
  const chartableRows = showChartCol ? results.filter((r) => r.series) : []
  const headState = selectionState(chartableRows, (r) => isCharted?.(r) ?? false)

  function handleChartToggle(row: DestinationResult) {
    const shift = shiftHeldRef.current
    shiftHeldRef.current = false
    const anchor = anchorRef.current
    anchorRef.current = chartKey(row)

    if (shift && anchor && onChartRange) {
      // Apply the state this click produces (select or clear) to the whole run,
      // in the current display order — what the user sees between the two boxes.
      const range = rowsBetween(sorted, anchor, chartKey(row)).filter((r) => r.series)
      if (range.length > 0) {
        onChartRange(range, !(isCharted?.(row) ?? false))
        return
      }
    }
    onToggleChart?.(row)
  }

  function renderChartToggle(row: DestinationResult) {
    if (!onToggleChart || !row.series) return null
    const on = isCharted?.(row) ?? false
    return (
      <input
        type="checkbox"
        checked={on}
        onClick={(e) => {
          shiftHeldRef.current = e.shiftKey
        }}
        onChange={() => handleChartToggle(row)}
        title="Add to the comparison chart (shift-click to select a range)"
        aria-label={`Chart ${row.name}`}
        className="h-3.5 w-3.5 cursor-pointer align-middle accent-sky-500"
        style={on && chartColor ? { accentColor: chartColor(row) } : undefined}
      />
    )
  }

  // Everything after the rank cell, shared by ranked rows and the pinned row
  // so the searched point gets identical formatting, links, and cell colors.
  function rowCells(row: DestinationResult) {
    return orderedColumns.map((col) => {
      const raw = row[col.key]
      const display = col.format ? col.format(raw) : String(raw ?? '—')
      const sortVal = row[sortBy]
      const isColored = coloredGroup.has(col.key as string) && sortVal != null
      // Color comes from the table's own base, or inline from cellStyle for a
      // ranked column — an inline color beats the inherited one either way.
      const cellClass = `px-2 py-1.5 whitespace-nowrap ${
        col.key === 'name' ? 'font-sans font-medium' : 'font-mono'
      }`
      const colorSty = isColored ? cellStyle(sortVal as number, sortBy) : undefined

      if (col.key === 'name') {
        const warning = fireWarnings.get(fireKey(row.latitude, row.longitude))
        return (
          <td key={col.key} className={cellClass}>
            <span className="flex items-center gap-1.5">
              {warning && (
                <span
                  title={fireWarningText(warning)}
                  aria-label={fireWarningText(warning)}
                  className="cursor-help"
                >
                  ⚠️
                </span>
              )}
              <button
                onClick={() => onFocusResult?.(row)}
                title="Center the map on this destination"
                aria-label={`Center map on ${row.name}`}
                className={`${LINK_ACTION} cursor-pointer text-left`}
              >
                {display}
              </button>
              <a
                href={destinationUrl(row)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in Peakbagger / OpenStreetMap"
                aria-label={`Open ${row.name} in an external map`}
                className="shrink-0 text-slate-500 hover:text-sky-400"
              >
                <ExternalLinkIcon />
              </a>
            </span>
          </td>
        )
      }

      if (col.windyLayer) {
        return (
          <td key={col.key} className={cellClass} style={colorSty}>
            <a
              href={windyUrl(row.latitude, row.longitude, col.windyLayer)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline cursor-pointer"
            >
              {display}
            </a>
          </td>
        )
      }

      return (
        <td key={col.key} className={cellClass} style={colorSty}>
          {display}
        </td>
      )
    })
  }

  return (
    // No overflow here — the panel's scroll container in App.tsx owns both
    // axes so the horizontal scrollbar stays pinned to the visible bottom.
    <div>
      {/* The table's base type is set once here so every cell inherits it and
          only the ranked columns' inline colors override. */}
      <table className={`min-w-full ${TEXT.control}`}>
        <thead className="sticky top-0 bg-slate-700 z-10">
          <tr>
            {showChartCol && (
              <th className="w-6 px-2 py-2">
                {onChartRange && chartableRows.length > 0 && (
                  <input
                    type="checkbox"
                    checked={headState === 'all'}
                    ref={(el) => {
                      // `indeterminate` is a DOM property, not an attribute, so
                      // React can't set it via a prop — sync it on every render.
                      if (el) el.indeterminate = headState === 'some'
                    }}
                    onChange={() => onChartRange(chartableRows, headState !== 'all')}
                    title="Add or remove every destination on the comparison chart"
                    aria-label="Chart all destinations"
                    className="h-3.5 w-3.5 cursor-pointer align-middle accent-sky-500"
                  />
                )}
              </th>
            )}
            <th scope="col" className={`${TEXT.subheading} px-2 py-2 text-left w-6`}>#</th>
            {orderedColumns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                onClick={() => handleSort(col.key)}
                className={`${TEXT.subheading} px-2 py-2 text-left cursor-pointer whitespace-nowrap hover:text-white select-none`}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 text-sky-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pending?.map((d) => (
            <tr
              key={`pending-${d.latitude},${d.longitude}`}
              className="group border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            >
              {showChartCol && <td className="px-2 py-1.5" />}
              <RankRemoveCell
                rank="—"
                name={d.name}
                onRemove={
                  onRemovePending && d.source === 'search' ? () => onRemovePending(d) : undefined
                }
              />
              {orderedColumns.map((col) => {
                if (col.key === 'name') {
                  return (
                    <td key={col.key} className="px-2 py-1.5 whitespace-nowrap font-sans font-medium">
                      <span className="flex items-center gap-1.5">
                        {d.name}
                        <a
                          href={destinationUrl({
                            name: d.name,
                            type: isPeakKind(d.kind ?? '') ? 'peak' : 'custom',
                            osm_id: d.osmId ?? null,
                            latitude: d.latitude,
                            longitude: d.longitude,
                          } as DestinationResult)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Peakbagger / OpenStreetMap"
                          aria-label={`Open ${d.name} in an external map`}
                          className="shrink-0 text-slate-500 hover:text-sky-400"
                        >
                          <ExternalLinkIcon />
                        </a>
                      </span>
                    </td>
                  )
                }
                if (col.key === 'elevation_ft') {
                  return (
                    <td key={col.key} className="px-2 py-1.5 whitespace-nowrap font-mono">
                      {d.elevation_ft != null ? d.elevation_ft.toLocaleString() : '—'}
                    </td>
                  )
                }
                return (
                  <td key={col.key} className="px-2 py-1.5 whitespace-nowrap font-mono text-slate-500">
                    —
                  </td>
                )
              })}
            </tr>
          ))}
          {sorted.map((row, i) => (
            <tr
              key={`${row.name}-${i}`}
              className="group border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            >
              {showChartCol && <td className="px-2 py-1.5">{renderChartToggle(row)}</td>}
              <RankRemoveCell
                rank={String(i + 1)}
                name={row.name}
                onRemove={onRemove ? () => onRemove(row) : undefined}
              />
              {rowCells(row)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
