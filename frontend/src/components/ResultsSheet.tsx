import { useLayoutEffect, useRef, useState } from 'react'
import type { Constraints } from '../utils/constraints'
import type { ChartCompare } from '../hooks/useChartCompare'
import type { PresentedReport } from '../hooks/usePresentedReport'
import type { Removals } from '../hooks/useRemovals'
import type { ResultsLayout } from '../hooks/useResultsLayout'
import type { TableView } from '../hooks/useTableView'
import ColumnsPicker from './ColumnsPicker'
import ModelsPicker from './ModelsPicker'
import RemovedPicker from './RemovedPicker'
import ResultsBar from './ResultsBar'
import { GridGutter } from './ResizeGrip'
import { IconChevron } from './icons'
import ResultsPanels, { type ResultsPanelsProps } from './ResultsPanels'
import { resultsHeading } from '../metrics'
import type { Lens } from '../utils/score/lenses'
import { takeOrphanedFocus } from '../hooks/useFocusHandoff'
import { columnWidthPx } from '../utils/results/resultsSheet'
import { LAYER, LAYOUT_HOLD, RESULTS_COLUMN, SAFE_AREA, SR_ONLY, SURFACE_SHEET } from '../styles'

interface ResultsSheetProps
  extends Omit<
    ResultsPanelsProps,
    | 'layout'
    | 'charts'
    | 'tableView'
    | 'report'
    | 'pending'
    | 'removeResult'
    | 'onRemovePending'
    | 'onFocusResult'
    | 'onFocusPending'
    // Read off `isDesktop` here (#696, record 0202).
    | 'chartPhone'
    | 'panesMove'
    // Read off the layout's collapse here (record 0202).
    | 'collapsed'
  > {
  /** The sheet's view (`useResultsView`): whether it shows, its layout, the chart, the table and the table's callbacks. */
  resultsView: ResultsSheetView
  /** Whether a report is on screen. */
  showResults: boolean
  /** Docked under the map at a desktop width, a sheet over it on a phone. */
  isDesktop: boolean
  /** The ranking's direction, which the bar's title names. */
  sortDesc: boolean
  /** The displayed rows, the title's parts and the header sort (`usePresentedReport`). */
  report: Pick<
    PresentedReport,
    | 'results'
    | 'windowTitle'
    | 'detailSort'
    | 'sortDetail'
    | 'pending'
    | 'rowCount'
    | 'emptyReason'
    | 'lens'
    | 'scoreHeadline'
    | 'scoreRange'
    | 'bestHours'
    | 'hiddenByLimits'
  >
  /** The removed rows and the ways back (`useRemovals`). */
  removals: Pick<Removals, 'removed' | 'removeResult' | 'restoreRemoved' | 'restoreAllRemoved'>
  /** Bumped once per committed report, which is when the bar's title is announced. */
  analysisSeq: number
  /** Picks the lens the field ranks by, or none (record 0307). */
  onLens?: (lens: Lens | null) => void
  /** The bounds as chips under the lenses, each with its ×, and the pill that opens the Limits card (record 0319). */
  limits?: {
    constraints: Constraints
    onRemove: (key: keyof Constraints) => void
    onAdd: () => void
  }
}

/** What the sheet reads of `useResultsView`. */
interface ResultsSheetView {
  /** Whether the results area shows at all. */
  showTable: boolean
  /** The sheet's element, its fold, its mode and its panel sizes (`useResultsLayout`). */
  layout: Pick<
    ResultsLayout,
    | 'sheetRef'
    | 'sheetRaised'
    | 'barRef'
    | 'legendRef'
    | 'resultsCollapsed'
    | 'toggleCollapsed'
    | 'resultsMode'
    | 'chooseResultsMode'
    | 'bothHasRoom'
    | 'chartGrip'
    | 'chartPanelPx'
    | 'chartPaneRef'
    | 'tableGrip'
    | 'tablePanelPx'
    | 'raiseChart'
  >
  /** The chart and the comparison, and the Models popover's list (`useChartCompare`). */
  charts: Pick<
    ChartCompare,
    | 'chart'
    | 'chartMetrics'
    | 'compare'
    | 'rowChartColor'
    | 'shared'
    | 'selectedModelRows'
    | 'hiddenModels'
    | 'toggleHiddenModel'
    | 'showAllModels'
    | 'compareWait'
    | 'compareNotes'
  >
  /** The table's shape and its file (`useTableView`). */
  tableView: TableView
  /** Removes a named destination no analysis has covered yet. */
  onRemovePending: ResultsPanelsProps['onRemovePending']
  /** Flies the map to a ranked row. */
  onFocusResult: ResultsPanelsProps['onFocusResult']
  /** Flies the map to a destination not yet forecast. */
  onFocusPending: ResultsPanelsProps['onFocusPending']
}

/**
 * What the panels are handed, wherever they stand: the sheet's own element
 * and a desk's chart pane under the map read it alike, so the two halves of
 * one report cannot be handed two different reports.
 */
function panelsProps(p: ResultsSheetProps): Omit<ResultsPanelsProps, 'part'> {
  const { resultsView, report, removals, isDesktop } = p
  return {
    layout: resultsView.layout,
    charts: resultsView.charts,
    chartTooltipIndex: p.chartTooltipIndex ?? null,
    chartTour: p.chartTour,
    tableView: resultsView.tableView,
    report,
    pending: report.pending,
    removeResult: removals.removeResult,
    sortBy: p.sortBy,
    sortDesc: p.sortDesc,
    chartPhone: !isDesktop,
    panesMove: isDesktop,
    collapsed: resultsView.layout.resultsCollapsed,
    layoutMotion: p.layoutMotion ?? null,
    pointSample: p.pointSample,
    forecastTimes: p.forecastTimes,
    playbackIndex: p.playbackIndex,
    timelineAxes: p.timelineAxes,
    movePlayheadTo: p.movePlayheadTo,
    fire: p.fire,
    closure: p.closure,
    pendingHeights: p.pendingHeights,
    modelId: p.modelId,
    onRemovePending: resultsView.onRemovePending,
    onFocusResult: resultsView.onFocusResult,
    onFocusPending: resultsView.onFocusPending,
  }
}

/**
 * A desk's chart under the map (record 0312): the chart's pane of
 * the panels, while the table stands in the column down the map's right edge
 * (`ResultsSheet`). Nothing on a phone, whose sheet draws every pane.
 */
export function ResultsChartPane(props: ResultsSheetProps) {
  if (!props.isDesktop || !props.resultsView.showTable) return null
  return <ResultsPanels {...panelsProps(props)} part="chart" />
}

/**
 * The round button on the map's right edge that brings a desk's collapsed
 * column back: the bar's own chevron, pointing at where the column comes in
 * from, under the bar chevron's own name.
 */
export function ResultsExpand({
  isDesktop,
  layout,
}: {
  isDesktop: boolean
  layout: Pick<ResultsLayout, 'resultsCollapsed' | 'toggleCollapsed'>
}) {
  if (!isDesktop || !layout.resultsCollapsed) return null
  return (
    <button type="button" aria-label="Expand results" onClick={layout.toggleCollapsed} className={RESULTS_COLUMN.expand}>
      <IconChevron up className="-rotate-90" />
    </button>
  )
}

/**
 * The results: the bar, the chart and table panels, and the three popovers
 * the bar opens (#409 cut them out of `App.tsx`).
 *
 * Docked below the map on desktop; on a phone the same results stand
 * on the map's bottom edge as a sheet, so the map keeps its full
 * height and its legends keep their room (#249). One surface either
 * way — only where it sits changes.
 *
 * The popovers render whether the sheet does or not, as they did beside it:
 * each is closed until its trigger, which only the sheet draws, opens it.
 */
// The width grip stands over the column's left rule, half on the map.
const COLUMN_GUTTER_PLACE = { top: 0, bottom: 0, left: '-0.25rem' } as const

export default function ResultsSheet(props: ResultsSheetProps) {
  const {
  resultsView,
  showResults,
  isDesktop,
  sortDesc,
  report,
  removals,
  analysisSeq,
  onLens,
  limits,
  sortBy,
  pointSample,
  layoutMotion = null,
  } = props
  const { showTable, layout, charts, tableView } = resultsView
  const { sheetRef, barRef, resultsCollapsed, toggleCollapsed, resultsMode, chooseResultsMode, bothHasRoom } = layout
  const { results, windowTitle, pending, rowCount, lens, scoreHeadline, bestHours, hiddenByLimits } = report
  const { selectedModelRows, hiddenModels, toggleHiddenModel, showAllModels, compareWait, compareNotes } = charts
  const {
    allColumns,
    pickerVisibleKeys,
    columnsAtDefault,
    resetColumns,
    handleVisibilityChange,
    handleColumnMove,
    handleDownloadCsv,
  } = tableView
  const { removed, restoreRemoved, restoreAllRemoved } = removals

  // Each popover's open flag and its trigger. Nothing outside the sheet opens
  // one, so nothing outside it holds them.
  // Each menu stands 4px under the button that opened it at a desk (record
  // 0201); on a phone each is a bottom sheet instead (#696; record 0136).
  const sheet = !isDesktop
  const columnsButtonRef = useRef<HTMLButtonElement>(null)
  const modelsButtonRef = useRef<HTMLButtonElement>(null)
  const removedButtonRef = useRef<HTMLButtonElement>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [removedOpen, setRemovedOpen] = useState(false)
  // Removed greys at zero (record 0224), so the menu closes once nothing is
  // removed, whatever emptied it. Set while rendering, so the commit that
  // empties the list is the one that shuts the menu.
  if (removedOpen && removed.size === 0) setRemovedOpen(false)
  // Restoring the last removed row takes its Restore button, the menu and the
  // Removed button out from under the keyboard. The row brought back takes it,
  // by its name's button in the table, or Columns when the table is not
  // showing it: under the limit's cut, outside a bound, or in Chart (#576).
  const restoredKeys = useRef<readonly string[]>([])
  const restoreOne = (key: string) => {
    restoredKeys.current = [key]
    restoreRemoved(key)
  }
  const restoreAll = () => {
    restoredKeys.current = [...removed.keys()]
    restoreAllRemoved()
  }
  useLayoutEffect(() => {
    if (removed.size > 0 || restoredKeys.current.length === 0) return
    const keys = new Set(restoredKeys.current)
    restoredKeys.current = []
    const rows = sheetRef.current?.querySelectorAll<HTMLElement>('[data-results-table] tr[data-key]') ?? []
    const row = [...rows].find((tr) => keys.has(tr.dataset.key ?? ''))
    takeOrphanedFocus(row?.querySelector<HTMLElement>('[data-row-name]') ?? null)
    takeOrphanedFocus(columnsButtonRef.current)
  }, [removed.size, sheetRef])

  // What a committed report says to a screen reader: the bar's own title, as
  // it reads in the commit that brought the report (#576). Held per report
  // rather than following the title, because a live sort or bound retitles the
  // bar on every keystroke and announcing each one would drown the reader.
  // Set while rendering, the way React derives state from a prop that moved,
  // so the words land in the same commit as the rows.
  const heading = resultsHeading(sortBy, sortDesc, pointSample, rowCount, pending.length)
  const [announced, setAnnounced] = useState({ seq: analysisSeq, text: '' })
  if (announced.seq !== analysisSeq) setAnnounced({ seq: analysisSeq, text: heading })

  // A desk's column width, dragged by its left edge, or null for the
  // class's own clamp, which a double press puts back. Measured from the
  // width the drag began at, as every grip's drag is (`dragFrom`).
  const [columnPx, setColumnPx] = useState<number | null>(null)
  const widthFrom = useRef(0)

  return (
    <>
      {/* Mounted for good, empty until the first report: a region that
          arrives holding its text is not announced. */}
      <div role="status" className={SR_ONLY}>
        {announced.text}
      </div>
      {/* A desk's column goes with the chevron, and the round button on
          the map's edge brings it back (`ResultsExpand`). */}
      {showTable && !(isDesktop && resultsCollapsed) && (
        <div
          ref={sheetRef}
          data-tour="results"
          style={isDesktop && columnPx !== null ? { width: columnPx } : undefined}
          className={
            isDesktop
              ? // The column down the map's right edge, on a layer of its own
                // while it moves (record 0216).
                RESULTS_COLUMN.column +
                (layoutMotion === 'opening' || layoutMotion === 'closing' ? ` ${LAYOUT_HOLD.layer}` : '')
              : // The sheet's surface runs under a phone's home indicator and
                // its grip and header stand above it (record 0145). Never
                // taller than the map: at full screen (#837) its panels are
                // sized from the header's estimate, and a header taller than
                // that clips the table's foot rather than lifting the bar off
                // the top of the screen.
                `absolute inset-x-0 bottom-0 max-h-full flex flex-col ${SURFACE_SHEET} ${SAFE_AREA.pad} ${
                  layout.sheetRaised ? LAYER.sheetRaised : LAYER.sheet
                }`
          }
        >
          {isDesktop && (
            <GridGutter
              axis="col"
              label="Resize results"
              place={COLUMN_GUTTER_PLACE}
              onReset={() => setColumnPx(null)}
              onDragStart={() => {
                widthFrom.current = sheetRef.current?.getBoundingClientRect().width ?? 0
              }}
              onDrag={(rightPx) => setColumnPx(columnWidthPx(widthFrom.current - rightPx, window.innerWidth))}
              onDragEnd={() => {}}
            />
          )}
          <ResultsBar
            barRef={barRef}
            sortBy={sortBy}
            sortDesc={sortDesc}
            pointSample={pointSample}
            rowCount={rowCount}
            pendingCount={pending.length}
            windowTitle={windowTitle}
            resultsCollapsed={resultsCollapsed}
            toggleCollapsed={toggleCollapsed}
            showResults={showResults}
            resultsMode={resultsMode}
            chooseResultsMode={chooseResultsMode}
            bothHasRoom={bothHasRoom}
            showTable={showTable}
            sheet={sheet}
            columnsButtonRef={columnsButtonRef}
            onToggleColumns={() => setColumnsOpen(!columnsOpen)}
            columnsOpen={columnsOpen}
            modelsButtonRef={modelsButtonRef}
            onToggleModels={() => setModelsOpen(!modelsOpen)}
            modelsOpen={modelsOpen}
            removedButtonRef={removedButtonRef}
            onToggleRemoved={() => setRemovedOpen(!removedOpen)}
            removedOpen={removedOpen}
            removedCount={removed.size}
            canDownload={results.length > 0 || pending.length > 0}
            onDownloadCsv={handleDownloadCsv}
            compareWait={compareWait}
            compareNotes={compareNotes}
            lens={lens}
            onLens={onLens}
            scoreHeadline={scoreHeadline}
            bestHours={bestHours}
            modelLabel={tableView.analysisModelLabel}
            limits={limits && { ...limits, hidden: hiddenByLimits }}
          />
          {/* A desk's column holds the table, or a lone chart's chips, and
              the chart stands under the map (`ResultsChartPane`); a phone's
              sheet holds every pane, and drops them while collapsed. */}
          {(isDesktop || !resultsCollapsed) && (
            <ResultsPanels {...panelsProps(props)} part={isDesktop ? 'column' : 'all'} />
          )}
        </div>
      )}

      {/* Columns picker popover */}
      <ColumnsPicker
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        // Model is always offered, whatever the report holds: a column a
        // reader can never see is a column they cannot ask for.
        columns={allColumns}
        sortBy={sortBy}
        visibleKeys={pickerVisibleKeys}
        onVisibilityChange={handleVisibilityChange}
        onColumnMove={handleColumnMove}
        onReset={resetColumns}
        atDefault={columnsAtDefault}
        triggerRef={columnsButtonRef}
        sheet={sheet}
      />

      {/* Model visibility popover */}
      <ModelsPicker
        open={modelsOpen}
        onOpenChange={setModelsOpen}
        models={selectedModelRows}
        hidden={hiddenModels}
        onToggle={toggleHiddenModel}
        onReset={showAllModels}
        triggerRef={modelsButtonRef}
        sheet={sheet}
      />

      {/* Removed rows popover */}
      <RemovedPicker
        open={removedOpen}
        onOpenChange={setRemovedOpen}
        entries={[...removed.entries()]}
        onRestore={restoreOne}
        onRestoreAll={restoreAll}
        triggerRef={removedButtonRef}
        sheet={sheet}
      />
    </>
  )
}
