import { Suspense, lazy, useMemo } from 'react'
import type { DestinationResult, SortBy } from '../types'
import type { ChartCompare } from '../hooks/useChartCompare'
import type { FireProximity } from '../hooks/useFireProximity'
import type { PresentedReport } from '../hooks/usePresentedReport'
import type { ResultsLayout } from '../hooks/useResultsLayout'
import type { TableView } from '../hooks/useTableView'
import type { PendingDestination } from '../utils/customList'
import type { TimelineAxis } from '../utils/timeline'
import ModelCompare from './ModelCompare'
import ResizeGrip from './ResizeGrip'
import ResultsTable from './ResultsTable'
import { IconClose } from './icons'
import { FOCUS_RING, ICON_ACTION, MUTED, RADIUS, TEXT } from '../styles'

// Lazy, because `recharts` is the one large library the first screen does not
// need: the map mounts before any chart exists, and a reader who never opens
// the chart never downloads it. No fallback: the panel is empty for the length
// of the fetch either way, and a word there would be a new string for a wait
// measured in a hundred milliseconds off an already warm connection.
const TimeSeriesChart = lazy(() => import('./TimeSeriesChart'))

// What the chart draws for its rows while a model comparison is up: nothing,
// because the comparison composes every line itself. A module constant so the
// chart's line memo is not rebuilt by a fresh empty array on every render.
const NO_CHART_ROWS: DestinationResult[] = []

export interface ResultsPanelsProps {
  /** The panels shown, their heights, and their grips (`useResultsLayout`). */
  layout: Pick<ResultsLayout, 'resultsMode' | 'chartGrip' | 'chartPanelPx' | 'tableGrip' | 'tablePanelPx'>
  /** The charted set and the comparison (`useChartCompare`). */
  charts: Pick<ChartCompare, 'chart' | 'compare' | 'rowChartColor'>
  /** The table's rows, columns and widths (`useTableView`). */
  tableView: Pick<
    TableView,
    | 'tableRows'
    | 'tableColumns'
    | 'tableColWidths'
    | 'setTableColWidths'
    | 'analysisModelLabel'
    | 'partialNote'
    | 'legend'
    | 'handleColumnMove'
  >
  /** The header sort and the table's empty reason (`usePresentedReport`). */
  report: Pick<PresentedReport, 'detailSort' | 'sortDetail' | 'emptyReason'>
  /** Named destinations no analysis has covered, drawn above the ranked rows. */
  pending: PendingDestination[]
  /** Removes a row, from the table or from a chart chip (`useRemovals`). */
  removeResult: (row: DestinationResult) => void
  /** The ranking, which the table marks. */
  sortBy: SortBy
  /** Whether the report is one hour, which relabels the metric columns. */
  pointSample: boolean
  /** The report's hourly grid, and the playhead on it. */
  forecastTimes: number[]
  playbackIndex: number | null
  /** The axes the player offers; the chart moves the playhead only on the forecast one. */
  timelineAxes: TimelineAxis[]
  movePlayheadTo: (ms: number) => void
  /** The wildfire check (`useFireProximity`). */
  fire: FireProximity
  /** The model the report was analyzed under. */
  modelId: string
  /** A pending row's remove button, and a row's press that centres the map on it. */
  onRemovePending: (d: { latitude: number; longitude: number }) => void
  onFocusResult: (row: DestinationResult) => void
  onFocusPending: (at: { latitude: number; longitude: number }) => void
}

/**
 * The chart panel and the table panel under the results bar, each behind its
 * own grip (#409 cut them out of `App.tsx`).
 *
 * `ResultsTable` and `TimeSeriesChart` are memoized and compare their props by
 * identity, so this hands them only the members it is given, never a value it
 * builds: an inline function or a fresh empty literal here would redraw a row
 * per destination on every render of the page.
 */
export default function ResultsPanels({
  layout,
  charts,
  tableView,
  report,
  pending,
  removeResult,
  sortBy,
  pointSample,
  forecastTimes,
  playbackIndex,
  timelineAxes,
  movePlayheadTo,
  fire,
  modelId,
  onRemovePending,
  onFocusResult,
  onFocusPending,
}: ResultsPanelsProps) {
  const { resultsMode, chartGrip, chartPanelPx, tableGrip, tablePanelPx } = layout
  const { chart, compare, rowChartColor } = charts
  const {
    tableRows,
    tableColumns,
    tableColWidths,
    setTableColWidths,
    analysisModelLabel,
    partialNote,
    legend,
    handleColumnMove,
  } = tableView
  const { detailSort, sortDetail, emptyReason } = report
  // The comparison's controls, which the chart draws under its plot. An
  // element is a prop like any other, and one built in the render would be a
  // new one every time, redrawing the memoized chart on every popover, toggle
  // and tick while a comparison is up. Kept on the three values it reads.
  const compareControls = useMemo(
    () =>
      compare.active ? (
        <ModelCompare compared={compare.shown} paceRemainingS={compare.paceRemainingS} />
      ) : undefined,
    [compare.active, compare.shown, compare.paceRemainingS],
  )
  return (
    <>
      {resultsMode !== 'table' && (
        <>
          <ResizeGrip
            onReset={chartGrip.onReset}
            onDragStart={chartGrip.onDragStart}
            onDrag={chartGrip.onDrag}
            onDragEnd={chartGrip.onDragEnd}
          />
          <div
            className="flex min-h-0 flex-shrink-0 flex-col"
            style={{ height: `${chartPanelPx}px` }}
          >
            <div className="min-h-0 flex-1">
              <Suspense fallback={null}>
                <TimeSeriesChart
                  times={forecastTimes}
                  // While a comparison is up every line on the chart is
                  // a (destination, model) pair, composed once by the
                  // hook so each one is named and coloured the same
                  // way; the chart has no plain destination rows to
                  // draw. With nothing compared it is the row list it
                  // has always been.
                  rows={compare.active ? NO_CHART_ROWS : chart.selectedRows}
                  metric={chart.metric}
                  onMetricChange={chart.setMetric}
                  colorFor={chart.colorFor}
                  playheadMs={playbackIndex !== null ? forecastTimes[playbackIndex] ?? null : null}
                  onPlayheadChange={
                    timelineAxes.includes('forecast') ? movePlayheadTo : undefined
                  }
                  extraLines={compare.lines}
                  modelEnds={compare.endLines}
                  controls={compareControls}
                />
              </Suspense>
            </div>
            {/* Chart-only legend. In Both mode the table's checkbox
                column is the series picker and this would be a
                second copy of it, so it exists exactly where that
                column does not, and lists the rows that column
                would. Each chip toggles its destination; the ×
                is the same removal as the table row's and obeys the
                same rules (searched places deregister, removals
                survive live knobs). The NAME keeps a fixed budget
                (max-w-44) and truncates; the model suffix beside it
                never truncates, so a compared chip is wider by its
                suffix. max-w-full keeps a chip inside the legend
                row, so on a phone a wide chip wraps to its own row
                and shrinks its name rather than overflowing. Two
                chip rows at most — 26px chips + the 6px gap =
                58px — then it scrolls. */}
            {resultsMode === 'chart' && legend.length > 0 && (
              <div className="flex-shrink-0 border-t border-slate-600 bg-slate-900/50 px-3 py-1.5">
                <div className="results-scrollbars flex max-h-[58px] flex-wrap gap-1.5 overflow-y-auto">
                  {legend.map(({ key, row, suffix }) => {
                    const plotted = chart.isSelected(row)
                    return (
                      <span
                        key={key}
                        className={`inline-flex max-w-full items-center ${RADIUS.control} ${
                          plotted ? 'bg-slate-700' : 'bg-slate-800/50'
                        }`}
                      >
                        <button
                          onClick={() => chart.toggle(row)}
                          aria-pressed={plotted}
                          aria-label={`${plotted ? 'Hide' : 'Show'} ${row.name} on the chart`}
                          className={`${TEXT.control} ${FOCUS_RING} inline-flex min-w-0 cursor-pointer items-center gap-1.5 py-1 pl-2 pr-1`}
                        >
                          <span
                            className={`h-2 w-2 flex-shrink-0 ${RADIUS.pill} ${plotted ? '' : MUTED}`}
                            style={{ backgroundColor: rowChartColor(row) }}
                          />
                          <span className={`flex min-w-0 ${plotted ? '' : MUTED}`}>
                            <span className="min-w-0 max-w-44 truncate">{row.name}</span>
                            {suffix && (
                              <span className="flex-shrink-0 whitespace-pre">{suffix}</span>
                            )}
                          </span>
                        </button>
                        <button
                          onClick={() => removeResult(row)}
                          aria-label={`Remove ${row.name}`}
                          className={`${ICON_ACTION} ${FOCUS_RING} cursor-pointer py-1 pl-1 pr-2 leading-none`}
                        >
                          <IconClose size="chip" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {resultsMode !== 'chart' && (
        <>
          <ResizeGrip
            onReset={tableGrip.onReset}
            onDragStart={tableGrip.onDragStart}
            onDrag={tableGrip.onDrag}
            onDragEnd={tableGrip.onDragEnd}
          />
          <div data-tour="results" className="@container overflow-auto min-h-0 results-scrollbars flex-shrink-0" style={{ height: `${tablePanelPx}px` }}>
            <ResultsTable
              emptyReason={emptyReason}
              results={tableRows}
              sortBy={sortBy}
              detailSortKey={detailSort.key}
              detailSortDir={detailSort.dir}
              onDetailSort={sortDetail}
              pointSample={pointSample}
              columns={tableColumns}
              columnWidths={tableColWidths}
              onColumnWidthsChange={setTableColWidths}
              modelFallbackLabel={analysisModelLabel}
              onColumnMove={handleColumnMove}
              fireWarnings={fire.warnings}
              fireUncovered={fire.uncovered}
              fireStatus={fire.status}
              pending={pending}
              onRemove={removeResult}
              onRemovePending={onRemovePending}
              onFocusResult={onFocusResult}
              onFocusPending={onFocusPending}
              modelId={modelId}
              times={forecastTimes}
              onToggleChart={chart.toggle}
              isCharted={chart.isSelected}
              chartColor={rowChartColor}
              onChartRange={chart.setRange}
              partialNote={partialNote}
            />
          </div>
        </>
      )}
    </>
  )
}
