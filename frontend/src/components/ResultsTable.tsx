import { memo, useMemo, useRef } from 'react'
import { DestinationResult, SortBy } from '../types'
import { FAMILY_KEYS, familyOf } from '../metrics'
import { selectionState } from '../utils/chartData'
import { MODEL_KEY, SortDir, SortKey, displayedColumns, ColDef } from '../utils/tableColumns'
import type { FireProximityStatus, FireWarning } from '../utils/fireProximity'
import type { PendingDestination } from '../utils/customList'
import { geoKey } from '../utils/points'
import { pendingChartRow, rankText, rowKeys } from '../utils/resultsCells'
import { useChartBox } from '../hooks/useChartBox'
import { TEXT } from '../styles'
import ResultsTableHeader from './ResultsTableHeader'
import ResultsTableRow, { FireClock, PendingRow } from './ResultsTableRow'

// Hoisted so a table with no widths set hands every row the same empty map,
// which is what lets a memoized row skip.
const NO_WIDTHS: Record<string, number> = {}

interface Props {
  // Already in display order: App applies the detail-column sort below before
  // handing these over, so the rows arrive as they are drawn.
  results: DestinationResult[]
  // Why the table has no rows, when it has none. Rendered as a row under the
  // headers rather than above the table, so an empty report still reads as a
  // table that found nothing rather than as a notice with a table beneath it.
  emptyReason?: string | null
  // The ranking the displayed rows are already in. Live on the client path,
  // where the panel re-derives the rows from the held field on every change.
  sortBy: SortBy
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
  // Columns to display, filtered by user visibility choices. The file always
  // carries the full set via buildResultsCsv; only the screen narrows.
  columns?: ColDef[]
  // What the Model column reads for a row no comparison tagged: the model the
  // analysis itself ran. The column can be shown with one model selected
  // (it is in the Columns picker), and a dash there would say the row came
  // from nowhere.
  modelFallbackLabel?: string | null
  // Center the map on a destination that has no forecast yet. Separate from
  // `onFocusResult` because there is no result to pass: a pending row is a
  // coordinate and a name, and the popup the ranked version opens is built
  // from numbers this row does not have.
  onFocusPending?: (at: { latitude: number; longitude: number }) => void
  // Which forecast model the rows came from, so a metric cell can ask Windy
  // for the same one. A compared row carries its own and wins over this.
  modelId?: string | null
  // The hourly grid the rows' series are aligned to, epoch ms. A floor or a
  // ceiling names one hour of it, and the Windy link opens on that hour.
  times?: readonly number[]
  // Move one column to where another sits. Absent means the header does not
  // reorder — the CSV-only and pre-analysis renders pass nothing.
  onColumnMove?: (fromKey: string, toKey: string) => void
  fireWarnings: Map<string, FireWarning>
  // Rows the fire dataset could not see (outside its US coverage, #256).
  // Their Wildfire (mi) cells read "N/A", where a cleared check prints the
  // dash, so a missing warning is never mistaken for a clear one.
  fireUncovered: Set<string>
  // The lookup's own state. The Wildfire (mi) column is always on screen, so
  // its cells have to say when they are still waiting (a ticking ellipsis)
  // versus answered — a column that appeared only on 'ready' looked like the
  // table quietly growing a column moments after every analysis.
  fireStatus: FireProximityStatus
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
  // Column widths the user has set (px by column key), held by App so they
  // survive mode switches and the collapse chevron. A column absent from the
  // map keeps its natural width — see utils/columnResize.ts for the model.
  columnWidths?: Record<string, number>
  onColumnWidthsChange?: (widths: Record<string, number>) => void
  // The one line under the table that says what the `*` on a Model cell means:
  // a compared model ends inside the window, so its aggregates cover fewer
  // hours (#493, #508). Null when no row on display is short. Drawn only while
  // the Model column is, since the marks it explains ride that column.
  partialNote?: string | null
}

function ResultsTable({
  results,
  emptyReason,
  sortBy,
  detailSortKey,
  detailSortDir,
  onDetailSort,
  pointSample = false,
  columns,
  modelFallbackLabel,
  onFocusPending,
  modelId,
  times,
  onColumnMove,
  fireWarnings,
  fireUncovered,
  fireStatus,
  pending,
  onRemovePending,
  onRemove,
  onFocusResult,
  onToggleChart,
  isCharted,
  chartColor,
  onChartRange,
  columnWidths,
  onColumnWidthsChange,
  partialNote = null,
}: Props) {
  // Memoized because every row is memoized on it.
  const coloredGroup = useMemo(() => new Set<string>(FAMILY_KEYS[familyOf(sortBy)]), [sortBy])
  // The ranked metric's columns lead the table (right after #/Name/Elevation), so
  // the numbers the ranking was built from are the first thing read. Keyed on
  // the analyzed snapshot, like the cell colors — panel knob changes don't
  // reshuffle the displayed report. Defaults to all columns if none provided.
  const orderedColumns = useMemo(
    () => columns ?? displayedColumns(pointSample, sortBy),
    [columns, pointSample, sortBy],
  )

  // 'idle' animates too, because it is what the hook reports for the one
  // render before its effect has run.
  const fireLoading = fireStatus === 'idle' || fireStatus === 'loading'

  // The leading checkbox column only appears once an analysis has returned
  // series to chart; rows without series (e.g. pinned search forecasts) render
  // an empty cell so the columns stay aligned.
  const showChartCol = !!onToggleChart

  // Every chartable row currently in the table, for the header "select all"
  // box. Its state (all/some/none) drives both the checked mark and the
  // indeterminate dash.
  // Memoized, with the columns above, because the header is memoized on them:
  // a fresh array on every render of the table would redraw it.
  const chartableRows = useMemo(
    () => (showChartCol ? results.filter((r) => r.series) : []),
    [showChartCol, results],
  )
  const headState = selectionState(chartableRows, (r) => isCharted?.(r) ?? false)

  const footnote = orderedColumns.some((c) => c.key === MODEL_KEY) ? partialNote : null

  // Every data cell is sized by the same widths the header resizes.
  const widths = columnWidths ?? NO_WIDTHS
  const tableRef = useRef<HTMLTableElement>(null)
  const chartBox = useChartBox({ results, isCharted, onChartRange, onToggleChart })
  // Memoized with the rows: a key per destination, so a sort moves rows
  // rather than handing each position a different destination.
  const keys = useMemo(() => rowKeys(results), [results])

  return (
    // No overflow here — the panel's scroll container in ResultsPanels.tsx owns both
    // axes so the horizontal scrollbar stays pinned to the visible bottom.
    <div>
      {/* The table's base type is set once here so every cell inherits it and
          only the ranked columns' inline colors override. */}
      <table ref={tableRef} className={`min-w-full ${TEXT.control}`}>
        <ResultsTableHeader
          columns={orderedColumns}
          detailSortKey={detailSortKey}
          detailSortDir={detailSortDir}
          onDetailSort={onDetailSort}
          onColumnMove={onColumnMove}
          columnWidths={columnWidths}
          onColumnWidthsChange={onColumnWidthsChange}
          tableRef={tableRef}
          showChartCol={showChartCol}
          chartableRows={chartableRows}
          headState={headState}
          onChartRange={onChartRange}
        />
        <tbody>
          <FireClock running={fireLoading}>
            {pending?.map((d) => {
              const charted = showChartCol && (isCharted?.(pendingChartRow(d)) ?? false)
              return (
                <PendingRow
                  key={`pending-${d.latitude},${d.longitude}`}
                  destination={d}
                  columns={orderedColumns}
                  widths={widths}
                  chartBox={showChartCol ? chartBox : undefined}
                  charted={charted}
                  chartColor={charted ? chartColor?.(pendingChartRow(d)) : undefined}
                  onRemovePending={onRemovePending}
                  onFocusPending={onFocusPending}
                />
              )
            })}
            {results.map((row, i) => {
              const at = geoKey(row.latitude, row.longitude)
              const charted = showChartCol && (isCharted?.(row) ?? false)
              return (
                <ResultsTableRow
                  key={keys[i]}
                  row={row}
                  rank={rankText(row, i)}
                  columns={orderedColumns}
                  widths={widths}
                  coloredGroup={coloredGroup}
                  pointSample={pointSample}
                  modelFallbackLabel={modelFallbackLabel}
                  modelId={modelId}
                  times={times}
                  fireStatus={fireStatus}
                  fireWarning={fireWarnings.get(at)}
                  fireUncovered={fireUncovered.has(at)}
                  chartBox={showChartCol ? chartBox : undefined}
                  charted={charted}
                  chartColor={charted ? chartColor?.(row) : undefined}
                  onRemove={onRemove}
                  onFocusResult={onFocusResult}
                />
              )
            })}
            {emptyReason && results.length === 0 && (pending?.length ?? 0) === 0 && (
              <tr>
                {/* The cell spans the table, which is wider than the panel once
                    the columns overflow, so centring inside it would push the
                    sentence off the right edge behind a sideways scroll through
                    columns of nothing. The inner block is pinned to the scroll
                    container's left edge and sized to its VISIBLE width in
                    container units, so it stays centred on what the reader can
                    see at any scroll offset. */}
                <td colSpan={orderedColumns.length + (showChartCol ? 2 : 1) + 1} className="p-0">
                  <div className={`sticky left-0 w-[100cqi] px-4 py-3 text-center ${TEXT.helper}`}>
                    {emptyReason}
                  </div>
                </td>
              </tr>
            )}
          </FireClock>
        </tbody>
        {footnote && (
          <tfoot>
            <tr>
              {/* A table row rather than a line after the table, for the
                  empty-reason row's reason: the pinned block needs a cell as
                  wide as the table to travel in. A block after the table is
                  only as wide as the scroll box, so it scrolls out of view as
                  soon as a wide comparison table is scrolled sideways, which
                  every one on a phone is. */}
              <td colSpan={orderedColumns.length + (showChartCol ? 2 : 1) + 1} className="p-0">
                <div className={`sticky left-0 w-[100cqi] px-3 py-1.5 ${TEXT.micro}`}>{footnote}</div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
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
export default memo(ResultsTable)
