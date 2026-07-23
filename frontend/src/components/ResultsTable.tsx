import { useEffect, useState } from 'react'
import { DestinationResult, SortBy } from '../types'
import { cellStyle, METRIC_CONFIG } from '../utils/colors'
import { FireWarning, fireKey, fireWarningText } from '../utils/fireProximity'
import { destinationUrl } from '../utils/destinationUrl'

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

const COLUMNS: ColDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'elevation_ft', label: 'Elev (ft)', format: (v) => (v != null ? Number(v).toLocaleString() : '—') },
  { key: 'precip_total_in', label: 'Precip Total"', format: (v) => Number(v).toFixed(3), windyLayer: 'rain' },
  { key: 'precip_avg_in_hr', label: 'Precip Avg"/hr', format: (v) => Number(v).toFixed(4), windyLayer: 'rain' },
  { key: 'precip_max_in_hr', label: 'Precip Max"/hr', format: (v) => Number(v).toFixed(4), windyLayer: 'rain' },
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
  fireWarnings: Map<string, FireWarning>
  // Forecasts for the pinned searched locations — rendered above the ranked
  // rows, outside the sort and the analysis limit. Clicking a row's 📍 unpins it.
  pinned?: DestinationResult[]
  onUnpin?: (row: DestinationResult) => void
  // Clicking a row's name centers the map on that destination.
  onFocusResult?: (row: DestinationResult) => void
  // Chart selection. When onToggleChart is provided (the analysis carried
  // series), each ranked row with series gets a checkbox that toggles it on the
  // comparison chart, its accent tinted with the destination's line color.
  onToggleChart?: (row: DestinationResult) => void
  isCharted?: (row: DestinationResult) => boolean
  chartColor?: (row: DestinationResult) => string
}

export default function ResultsTable({
  results,
  sortBy,
  sortDesc,
  fireWarnings,
  pinned,
  onUnpin,
  onFocusResult,
  onToggleChart,
  isCharted,
  chartColor,
}: Props) {
  const coloredGroup = new Set(METRIC_CONFIG[sortBy].group)
  const [sortKey, setSortKey] = useState<SortKey>(sortBy)
  const [sortDir, setSortDir] = useState<SortDir>(sortDesc ? 'desc' : 'asc')

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

  const sorted = [...results].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    // Missing values (e.g. AQI beyond its forecast horizon) sort last either way
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  // The leading checkbox column only appears once an analysis has returned
  // series to chart; rows without series (e.g. pinned search forecasts) render
  // an empty cell so the columns stay aligned.
  const showChartCol = !!onToggleChart

  function renderChartToggle(row: DestinationResult) {
    if (!onToggleChart || !row.series) return null
    const on = isCharted?.(row) ?? false
    return (
      <input
        type="checkbox"
        checked={on}
        onChange={() => onToggleChart(row)}
        title="Add to the comparison chart"
        aria-label={`Chart ${row.name}`}
        className="h-3.5 w-3.5 cursor-pointer align-middle accent-sky-500"
        style={on && chartColor ? { accentColor: chartColor(row) } : undefined}
      />
    )
  }

  // Everything after the rank cell, shared by ranked rows and the pinned row
  // so the searched point gets identical formatting, links, and cell colors.
  function rowCells(row: DestinationResult) {
    return COLUMNS.map((col) => {
      const raw = row[col.key]
      const display = col.format ? col.format(raw) : String(raw ?? '—')
      const sortVal = row[sortBy]
      const isColored = coloredGroup.has(col.key as string) && sortVal != null
      const cellClass = `px-2 py-1.5 whitespace-nowrap ${
        col.key === 'name' ? 'font-sans font-medium' : 'font-mono'
      } ${!isColored ? 'text-slate-200' : ''}`
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
                className="text-sky-400 hover:text-sky-300 hover:underline cursor-pointer text-left"
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
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-slate-700 z-10">
          <tr>
            {showChartCol && <th className="w-6 px-2 py-2" aria-label="Chart" />}
            <th className="px-2 py-2 text-left text-slate-400 font-medium w-6">#</th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-2 py-2 text-left text-slate-400 font-medium cursor-pointer whitespace-nowrap hover:text-white select-none"
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
          {pinned?.map((row) => (
            <tr
              key={`pin-${row.latitude},${row.longitude}`}
              className="border-t border-slate-700/50 bg-amber-400/10 hover:bg-amber-400/20 transition-colors"
            >
              {showChartCol && <td className="px-2 py-1.5" />}
              {/* Matches the amber search pin on the map */}
              <td className="px-2 py-1.5">
                <button
                  onClick={() => onUnpin?.(row)}
                  title="Pinned from search — click to unpin"
                  aria-label={`Unpin ${row.name}`}
                  className="cursor-pointer leading-none hover:scale-125 transition-transform"
                >
                  📍
                </button>
              </td>
              {rowCells(row)}
            </tr>
          ))}
          {sorted.map((row, i) => (
            <tr
              key={`${row.name}-${i}`}
              className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            >
              {showChartCol && <td className="px-2 py-1.5">{renderChartToggle(row)}</td>}
              <td className="px-2 py-1.5 text-slate-500 tabular-nums">{i + 1}</td>
              {rowCells(row)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
