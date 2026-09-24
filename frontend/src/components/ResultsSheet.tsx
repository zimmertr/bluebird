import { useRef, useState } from 'react'
import type { ChartCompare } from '../hooks/useChartCompare'
import type { PresentedReport } from '../hooks/usePresentedReport'
import type { Removals } from '../hooks/useRemovals'
import type { ResultsLayout } from '../hooks/useResultsLayout'
import type { TableView } from '../hooks/useTableView'
import ColumnsPicker from './ColumnsPicker'
import ModelsPicker from './ModelsPicker'
import RemovedPicker from './RemovedPicker'
import ResultsBar from './ResultsBar'
import ResultsPanels, { type ResultsPanelsProps } from './ResultsPanels'
import { LAYER, SURFACE_SHEET } from '../styles'

interface ResultsSheetProps
  extends Omit<ResultsPanelsProps, 'layout' | 'charts' | 'tableView' | 'report' | 'pending' | 'removeResult'> {
  /** Whether the results area shows at all. */
  showTable: boolean
  /** Whether a report is on screen. */
  showResults: boolean
  /** Docked under the map at a desktop width, a sheet over it on a phone. */
  isDesktop: boolean
  /** The ranking's direction, which the bar's title names. */
  sortDesc: boolean
  /** The sheet's element, its fold, its mode and its panel sizes (`useResultsLayout`). */
  layout: Pick<
    ResultsLayout,
    | 'sheetRef'
    | 'resultsCollapsed'
    | 'toggleCollapsed'
    | 'resultsMode'
    | 'chooseResultsMode'
    | 'bothHasRoom'
    | 'chartGrip'
    | 'chartPanelPx'
    | 'tableGrip'
    | 'tablePanelPx'
  >
  /** The displayed rows, the title's parts and the header sort (`usePresentedReport`). */
  report: Pick<
    PresentedReport,
    'results' | 'windowTitle' | 'detailSort' | 'sortDetail' | 'pending' | 'rowCount' | 'emptyReason'
  >
  /** The chart and the comparison, and the Models popover's list (`useChartCompare`). */
  charts: Pick<
    ChartCompare,
    'chart' | 'compare' | 'rowChartColor' | 'selectedModelRows' | 'hiddenModels' | 'toggleHiddenModel' | 'compareWait'
  >
  /** The table's shape and its file (`useTableView`). */
  tableView: TableView
  /** The removed rows and the ways back (`useRemovals`). */
  removals: Pick<Removals, 'removed' | 'removeResult' | 'restoreRemoved' | 'restoreAllRemoved'>
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
export default function ResultsSheet({
  showTable,
  showResults,
  isDesktop,
  sortDesc,
  layout,
  report,
  charts,
  tableView,
  removals,
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
}: ResultsSheetProps) {
  const { sheetRef, resultsCollapsed, toggleCollapsed, resultsMode, chooseResultsMode, bothHasRoom } = layout
  const { results, windowTitle, pending, rowCount } = report
  const { selectedModelRows, hiddenModels, toggleHiddenModel, compareWait } = charts
  const { allColumns, pickerVisibleKeys, handleVisibilityChange, handleColumnMove, handleDownloadCsv } = tableView
  const { removed, removeResult, restoreRemoved, restoreAllRemoved } = removals

  // Each popover's open flag and its trigger. Nothing outside the sheet opens
  // one, so nothing outside it holds them.
  const columnsButtonRef = useRef<HTMLButtonElement>(null)
  const modelsButtonRef = useRef<HTMLButtonElement>(null)
  const removedButtonRef = useRef<HTMLButtonElement>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [removedOpen, setRemovedOpen] = useState(false)

  return (
    <>
      {showTable && (
        <div
          ref={sheetRef}
          className={
            isDesktop
              ? 'flex flex-shrink-0 flex-col bg-slate-800'
              : `absolute inset-x-0 bottom-0 flex flex-col ${SURFACE_SHEET} ${LAYER.sheet}`
          }
        >
          <ResultsBar
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
            columnsButtonRef={columnsButtonRef}
            onToggleColumns={() => setColumnsOpen(!columnsOpen)}
            modelsButtonRef={modelsButtonRef}
            onToggleModels={() => setModelsOpen(!modelsOpen)}
            removedButtonRef={removedButtonRef}
            onToggleRemoved={() => setRemovedOpen(!removedOpen)}
            removedCount={removed.size}
            canDownload={results.length > 0 || pending.length > 0}
            onDownloadCsv={handleDownloadCsv}
            compareWait={compareWait}
          />
          {!resultsCollapsed && (
            <ResultsPanels
              layout={layout}
              charts={charts}
              tableView={tableView}
              report={report}
              pending={pending}
              removeResult={removeResult}
              sortBy={sortBy}
              pointSample={pointSample}
              forecastTimes={forecastTimes}
              playbackIndex={playbackIndex}
              timelineAxes={timelineAxes}
              movePlayheadTo={movePlayheadTo}
              fire={fire}
              modelId={modelId}
              onRemovePending={onRemovePending}
              onFocusResult={onFocusResult}
              onFocusPending={onFocusPending}
            />
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
        triggerRef={columnsButtonRef}
      />

      {/* Model visibility popover */}
      <ModelsPicker
        open={modelsOpen}
        onOpenChange={setModelsOpen}
        models={selectedModelRows}
        hidden={hiddenModels}
        onToggle={toggleHiddenModel}
        triggerRef={modelsButtonRef}
      />

      {/* Removed rows popover */}
      <RemovedPicker
        open={removedOpen}
        onOpenChange={setRemovedOpen}
        entries={[...removed.entries()]}
        onRestore={restoreRemoved}
        onRestoreAll={restoreAllRemoved}
        triggerRef={removedButtonRef}
      />
    </>
  )
}
