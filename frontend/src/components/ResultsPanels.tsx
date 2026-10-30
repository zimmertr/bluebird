import { Suspense, lazy, memo, useMemo, useRef, type ReactNode } from 'react'
import type { DestinationResult, SortBy } from '../types'
import type { ChartCompare } from '../hooks/useChartCompare'
import type { FireProximity } from '../hooks/useFireProximity'
import type { ClosureProximity } from '../hooks/useClosureProximity'
import type { PresentedReport } from '../hooks/usePresentedReport'
import type { ResultsLayout } from '../hooks/useResultsLayout'
import type { TableView } from '../hooks/useTableView'
import type { PendingDestination } from '../utils/customList'
import type { TimelineAxis } from '../utils/timeline'
import ModelCompare from './ModelCompare'
import ResizeGrip from './ResizeGrip'
import ResultsTable from './ResultsTable'
import { IconClose } from './icons'
import {
  FOCUS_RING,
  CHART_LEGEND,
  ICON_ACTION,
  LAYOUT_HOLD,
  MOTION,
  MUTED,
  RADIUS,
  RESULTS_PANE,
  SCROLL_BARS,
  SCROLL_SHADOW,
  TEXT,
} from '../styles'
import type { LayoutMotion } from '../hooks/useLayoutMotion'
import { usePaneMotion } from '../hooks/usePaneMotion'
import { useScrollShadows } from '../hooks/useScrollShadows'

// Lazy, because `recharts` is the one large library the first screen does not
// need: the map mounts before any chart exists, and a reader who never opens
// the chart never downloads it. No fallback: the panel is empty for the length
// of the fetch either way, and a word there would be a new string for a wait
// measured in a hundred milliseconds off an already warm connection.
//
// Once the module has loaded, the lazy is handed it as a settled thenable,
// which React's lazy reads in the render that mounts the pane. A promise,
// even a settled `import()`, suspends that render, and React holds a
// boundary's reveal 300 ms behind the empty fallback it showed, so a chart
// whose chunk the tutorial had already fetched stood empty for 340 ms on the
// Chart card (#786). `loadTimeSeriesChart` is the fetch, for a caller that
// knows the chart is coming.
type ChartModule = typeof import('./TimeSeriesChart')
let chartModule: ChartModule | null = null
const keep = (loaded: ChartModule) => (chartModule = loaded)
export function loadTimeSeriesChart(): Promise<ChartModule> {
  return import('./TimeSeriesChart').then(keep)
}
const TimeSeriesChart = lazy(() => {
  const loaded = chartModule
  if (loaded === null) return import('./TimeSeriesChart').then(keep)
  return { then: (done: (m: ChartModule) => void) => done(loaded) } as unknown as Promise<ChartModule>
})

// What the chart draws for its rows while a model comparison is up: nothing,
// because the comparison composes every line itself. A module constant so the
// chart's line memo is not rebuilt by a fresh empty array on every render.
const NO_CHART_ROWS: DestinationResult[] = []

/**
 * A shut pane's body as it was last drawn (record 0216): while `holding`,
 * React skips it, so a pane kept mounted behind its shut frame draws nothing
 * for a sort, a cut or a tick of the player until it opens again, and draws
 * once then if anything changed. Its frame clips it to nothing meanwhile.
 */
const Held = memo(
  function Held({ children }: { holding: boolean; children: ReactNode }) {
    return children
  },
  (_, next) => next.holding,
)

export interface ResultsPanelsProps {
  /** The panels shown, their heights, and their grips (`useResultsLayout`). */
  layout: Pick<ResultsLayout, 'resultsMode' | 'chartGrip' | 'chartPanelPx' | 'tableGrip' | 'tablePanelPx'>
  /** The charted set and the comparison (`useChartCompare`). */
  charts: Pick<ChartCompare, 'chart' | 'chartMetrics' | 'compare' | 'rowChartColor' | 'shared'>
  /** An hour the chart's tooltip stands on without a mouse (the tutorial, #536). */
  chartTooltipIndex?: number | null
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
  /** The ranking's direction, which the chart's extreme line follows. */
  sortDesc: boolean
  /** A phone, where the chart's metric picker is its title (#696; record 0149). */
  chartTitled: boolean
  /**
   * A desk, where a press on Table, Chart or Both and the collapse chevron
   * open and close the panes at the panel's speed (record 0202). A phone's
   * change at once.
   */
  panesMove?: boolean
  /**
   * Whether the results are collapsed to their bar, which shuts both panes.
   * A phone does not render the panels at all while collapsed.
   */
  collapsed?: boolean
  /**
   * Which edge of a desk's layout is moving (`useLayoutMotion`): while the
   * panel moves, the chart and the table hold a width (`LAYOUT_HOLD`).
   */
  layoutMotion?: LayoutMotion
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
  /** The closure check (`useClosureProximity`). */
  closure: ClosureProximity
  /** The committed rows whose elevation lookup is still out (`useAnalyze`, #673). */
  pendingHeights: ReadonlySet<string>
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
  chartTooltipIndex = null,
  tableView,
  report,
  pending,
  removeResult,
  sortBy,
  sortDesc,
  chartTitled,
  panesMove = false,
  collapsed = false,
  layoutMotion = null,
  pointSample,
  forecastTimes,
  playbackIndex,
  timelineAxes,
  movePlayheadTo,
  fire,
  closure,
  pendingHeights,
  modelId,
  onRemovePending,
  onFocusResult,
  onFocusPending,
}: ResultsPanelsProps) {
  const { resultsMode, chartGrip, chartPanelPx, tableGrip, tablePanelPx } = layout
  const tableScrollRef = useRef<HTMLDivElement>(null)
  // Each pane's frame and body: shown by the mode and the chevron, mounted at
  // the press at the height the mode pressed gives it, and at a desk kept
  // while its frame closes, at the height it had (record 0202).
  const chartShown = !collapsed && resultsMode !== 'table'
  const tableShown = !collapsed && resultsMode !== 'chart'
  const chartPane = usePaneMotion(chartShown, chartPanelPx, panesMove)
  const tablePane = usePaneMotion(tableShown, tablePanelPx, panesMove)
  const paneMotion = panesMove ? MOTION.pane : ''
  // While the panel moves the chart keeps the width it had and the table's
  // box takes the window's, so neither is drawn again in every frame.
  const chartWidth =
    layoutMotion === 'closing' ? LAYOUT_HOLD.chartClosing : layoutMotion === 'opening' ? LAYOUT_HOLD.chartOpening : ''
  const chartHold = chartWidth
  const pushing = layoutMotion === 'closing' || layoutMotion === 'opening'
  const tableHold = pushing ? LAYOUT_HOLD.table : ''
  // Each body on a layer of its own while the panel moves (record 0216): the
  // box of a fixed height inside the frame, which moves whole. Not while the
  // panes move, where the table stands still on the screen and the chart is
  // cheap to paint where it now stands, and lifting both onto layers at the
  // press painted them whole: Both to Table started 237 ms after the press
  // rather than 131 at a quarter of the CPU (2026-10-22).
  const layer = pushing ? LAYOUT_HOLD.layer : ''
  useScrollShadows(tableScrollRef, tablePane.mounted)
  const { chart, chartMetrics, compare, rowChartColor, shared } = charts
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
  // The chart-only legend. In Both mode the table's checkbox column is the
  // series picker and this would be a second copy of it, so it exists exactly
  // where that column does not, and lists the rows that column would. Each
  // chip toggles its destination; the × is the same removal as the table
  // row's and obeys the same rules (searched places deregister, removals
  // survive live knobs). The NAME keeps a fixed budget (max-w-44) and
  // truncates; the model suffix beside it never truncates, so a compared chip
  // is wider by its suffix. max-w-full keeps a chip inside the legend row, so
  // on a phone a wide chip wraps to its own row and shrinks its name rather
  // than overflowing.
  //
  // At a desk it is a pane of its own under the chart, held to the foot the
  // way the table is (#795): Chart to Both shuts it while the table opens, at
  // the panes' speed, so the chart stands at one size in every mode and no
  // press draws it again. In the chart's box it would take its height from
  // the plot, and every press that brought it or took it away would redraw
  // the chart once the move had ended.
  const legendStrip =
    legend.length > 0 ? (
      <div className={CHART_LEGEND.strip}>
        <div className={CHART_LEGEND.chips}>
          {legend.map(({ key, row, suffix }) => {
            const plotted = chart.isSelected(row)
            return (
              <span
                key={key}
                className={`inline-flex max-w-full items-center ${RADIUS.control} ${
                  plotted ? 'bg-raised' : 'bg-panel/50'
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
    ) : null
  const legendShown = !collapsed && resultsMode === 'chart' && legendStrip !== null
  const legendPane = usePaneMotion(legendShown, 0, panesMove)
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
      <div className={`${RESULTS_PANE.frame} ${chartPane.open ? RESULTS_PANE.open : RESULTS_PANE.shut} ${paneMotion}`}>
        <div inert={!chartShown} className={`${RESULTS_PANE.top} ${chartHold}`}>
          {chartPane.mounted && (
            <>
              <ResizeGrip
                onReset={chartGrip.onReset}
                onDragStart={chartGrip.onDragStart}
                onDrag={chartGrip.onDrag}
                onDragEnd={chartGrip.onDragEnd}
              />
              <div
                className={`flex min-h-0 flex-shrink-0 flex-col ${layer}`}
                style={{ height: `${chartPane.px}px` }}
              >
                <Held holding={!chartShown}>
                  <div className="min-h-0 flex-1">
                    <Suspense fallback={null}>
                      <TimeSeriesChart
                        times={forecastTimes}
                        tooltipIndex={chartTooltipIndex}
                        // While a comparison is up every line on the chart is
                        // a (destination, model) pair, composed once by the
                        // hook so each one is named and coloured the same
                        // way; the chart has no plain destination rows to
                        // draw. With nothing compared it is the row list it
                        // has always been.
                        rows={compare.active ? NO_CHART_ROWS : chart.selectedRows}
                        metrics={chartMetrics.metrics}
                        onPick={chartMetrics.pick}
                        onAdd={chartMetrics.add}
                        onRemove={chartMetrics.remove}
                        onMove={chartMetrics.move}
                        sortBy={sortBy}
                        sortDesc={sortDesc}
                        colorFor={chart.colorFor}
                        sharedNames={shared}
                        playheadMs={playbackIndex !== null ? forecastTimes[playbackIndex] ?? null : null}
                        onPlayheadChange={
                          timelineAxes.includes('forecast') ? movePlayheadTo : undefined
                        }
                        extraLines={compare.lines}
                        modelEnds={compare.endLines}
                        controls={compareControls}
                        titled={chartTitled}
                      />
                    </Suspense>
                  </div>
                  {/* A phone's legend stands in the chart's box: its panes
                      change at once, and its Chart fills the sheet. */}
                  {!panesMove && resultsMode === 'chart' && legendStrip}
                </Held>
              </div>
            </>
          )}
        </div>
      </div>
      {panesMove && (
        <div className={`${RESULTS_PANE.frame} ${legendPane.open ? RESULTS_PANE.open : RESULTS_PANE.shut} ${paneMotion}`}>
          <div inert={!legendShown} className={`${RESULTS_PANE.foot} ${chartHold}`}>
            {legendPane.mounted && <Held holding={!legendShown}>{legendStrip}</Held>}
          </div>
        </div>
      )}
      <div className={`${RESULTS_PANE.frame} ${tablePane.open ? RESULTS_PANE.open : RESULTS_PANE.shut} ${paneMotion}`}>
        <div inert={!tableShown} className={`${RESULTS_PANE.foot} ${tableHold}`}>
          {tablePane.mounted && (
            <>
              <ResizeGrip
                onReset={tableGrip.onReset}
                onDragStart={tableGrip.onDragStart}
                onDrag={tableGrip.onDrag}
                onDragEnd={tableGrip.onDragEnd}
              />
              {/* `relative` so this box is the containing block of the rows'
                  screen-reader notes: `SR_ONLY` positions them absolutely, and
                  with no positioned ancestor nearer than the app's root they
                  stood in the root's coordinates, one per row, past this box's
                  clipping. At 101 rows the root's scrollable overflow reached
                  3,260 px, and anything that scrolled an element into view then
                  moved the whole page up and left it there (the tutorial,
                  2026-10-06). */}
              <div
                ref={tableScrollRef}
                className={`@container relative overflow-auto min-h-0 ${SCROLL_BARS} ${SCROLL_SHADOW.end} flex-shrink-0 ${layer}`}
                style={{ height: `${tablePane.px}px` }}
              >
                <Held holding={!tableShown}>
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
                    closureWarnings={closure.warnings}
                    closureUncovered={closure.uncovered}
                    closureStatus={closure.status}
                    pendingHeights={pendingHeights}
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
                </Held>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
