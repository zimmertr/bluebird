import { useRef } from 'react'
import { DestinationResult, SortBy } from '../types'
import { cellStyle, METRIC_CONFIG } from '../utils/colors'
import { chartKey, rowsBetween, selectionState } from '../utils/chartData'
import { SortDir, SortKey, displayedColumns } from '../utils/tableColumns'
import { FireWarning, fireKey, fireWarningText } from '../utils/fireProximity'
import { destinationUrl } from '../utils/destinationUrl'
import { isPeakKind } from '../utils/geocode'
import type { PendingDestination } from '../utils/customList'
import { CHOICE_INPUT, LINK_ACTION, TABLE, TAP, TEXT } from '../styles'
import { RANKING_KEYS } from '../metrics'

function windyUrl(lat: number, lon: number, layer: string): string {
  return `https://www.windy.com/?${layer},${lat.toFixed(4)},${lon.toFixed(4)},11`
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
    <td className={`${TABLE.cell} tabular-nums whitespace-nowrap`}>
      {onRemove ? (
        <>
          <span className="text-slate-400 group-hover:hidden">{rank}</span>
          <button
            onClick={onRemove}
            title="Remove from the results"
            aria-label={`Remove ${name}`}
            className={`row-remove ${TAP.dense} hidden group-hover:inline-flex leading-none text-slate-400 hover:text-slate-200 cursor-pointer`}
          >
            ×
          </button>
        </>
      ) : (
        <span className="text-slate-400">{rank}</span>
      )}
    </td>
  )
}

interface Props {
  // Already in display order: App applies the detail-column sort below before
  // handing these over, so the rows arrive as they are drawn.
  results: DestinationResult[]
  // The ranking the displayed rows are already in. Live on the client path,
  // where the panel re-derives the rows from the held field on every change.
  sortBy: SortBy
  sortDesc: boolean
  // Re-rank the whole field by one of the four ranking metrics. Absent on the
  // server path, which holds no field to re-rank, so a header click there falls
  // back to reordering the rows on screen.
  onRank?: (key: SortBy, desc: boolean) => void
  // The detail-column sort: which non-ranking column the rows are read in, and
  // which way. Held by App rather than here since #125, because the CSV export
  // has to leave in the order that is on screen, and a component that keeps its
  // own display order privately is the one thing that can contradict
  // present.ts's promise that a single place answers what the table shows.
  detailSortKey: SortKey
  detailSortDir: SortDir
  onDetailSort: (key: SortKey, dir: SortDir) => void
  // Derived from the analyzed snapshot's window, unlike sortBy/sortDesc: an
  // analysis covering one hourly stamp shows one column per metric instead of
  // the avg/min/max triplets, and no knob can change that without a new
  // analysis.
  pointSample?: boolean
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
  onRank,
  detailSortKey,
  detailSortDir,
  onDetailSort,
  pointSample = false,
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
  // The ranked metric's columns lead the table (right after #/Name/Elevation), so
  // the numbers the ranking was built from are the first thing read. Keyed on
  // the analyzed snapshot, like the cell colors — panel knob changes don't
  // reshuffle the displayed report.
  const orderedColumns = displayedColumns(pointSample, sortBy)

  // Shift-click range select: the checkbox last interacted with is the anchor;
  // a shift-held click extends (de)selection to every chartable row between.
  const shiftHeldRef = useRef(false)
  const anchorRef = useRef<string | null>(null)

  // A header click means "rank by this", and for the four metrics that are also
  // ranking keys it can mean it literally: `onRank` re-cuts the whole held field,
  // so clicking Wind gives the least windy destinations in the area rather than
  // the driest ones reordered by wind. The remaining columns are detail, and
  // reorder the rows on screen as they always have. Widening the ranking
  // vocabulary to cover them needs marker thresholds, a URL spelling and an
  // aggregate-aware header noun per key, which is a separate change (see
  // RANKING_KEYS in metrics.ts).
  //
  // Column ORDER keys off the ranking metric and not its direction, so toggling
  // ascending/descending never moves the header out from under the cursor;
  // switching metric does move it, which is the report changing shape.
  function handleSort(key: SortKey) {
    if (onRank && (RANKING_KEYS as readonly string[]).includes(key)) {
      onRank(key as SortBy, key === sortBy ? !sortDesc : false)
      return
    }
    onDetailSort(key, key === detailSortKey && detailSortDir === 'asc' ? 'desc' : 'asc')
  }

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
      const range = rowsBetween(results, anchor, chartKey(row)).filter((r) => r.series)
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
    // The label carries the target, not the input: a min-size on a checkbox
    // draws a bigger checkbox, where what is wanted is a bigger place to hit.
    return (
      <label className={TAP.dense}>
        <input
          type="checkbox"
          checked={on}
          onClick={(e) => {
            shiftHeldRef.current = e.shiftKey
          }}
          onChange={() => handleChartToggle(row)}
          title="Add to the comparison chart (shift-click to select a range)"
          aria-label={`Chart ${row.name}`}
          className={CHOICE_INPUT}
          style={on && chartColor ? { accentColor: chartColor(row) } : undefined}
        />
      </label>
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
      const cellClass = `${TABLE.cell} whitespace-nowrap ${
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
                className={`${LINK_ACTION} ${TAP.dense} cursor-pointer text-left`}
              >
                {display}
              </button>
              <a
                href={destinationUrl(row)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in Peakbagger / OpenStreetMap"
                aria-label={`Open ${row.name} in an external map`}
                className={`${TAP.dense} shrink-0 text-slate-500 hover:text-sky-400`}
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
              className={`${TAP.dense} hover:underline cursor-pointer`}
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
              <th className={`${TABLE.head} w-6`}>
                {onChartRange && chartableRows.length > 0 && (
                  <label className={TAP.dense}>
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
                      className={CHOICE_INPUT}
                    />
                  </label>
                )}
              </th>
            )}
            <th scope="col" className={`${TABLE.head} w-6`}>#</th>
            {orderedColumns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={detailSortKey === col.key ? (detailSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                onClick={() => handleSort(col.key)}
                className={`${TABLE.head} cursor-pointer whitespace-nowrap hover:text-white select-none`}
              >
                {col.label}
                {detailSortKey === col.key && (
                  <span className="ml-1 text-sky-400">{detailSortDir === 'asc' ? '↑' : '↓'}</span>
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
              {showChartCol && <td className={TABLE.cell} />}
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
                    <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-sans font-medium`}>
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
                          className={`${TAP.dense} shrink-0 text-slate-500 hover:text-sky-400`}
                        >
                          <ExternalLinkIcon />
                        </a>
                      </span>
                    </td>
                  )
                }
                if (col.key === 'elevation_ft') {
                  return (
                    <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-mono`}>
                      {d.elevation_ft != null ? d.elevation_ft.toLocaleString() : '—'}
                    </td>
                  )
                }
                return (
                  <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-mono text-slate-400`}>
                    —
                  </td>
                )
              })}
            </tr>
          ))}
          {results.map((row, i) => (
            <tr
              key={`${row.name}-${i}`}
              className="group border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            >
              {showChartCol && <td className={TABLE.cell}>{renderChartToggle(row)}</td>}
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
