import { useCallback, type RefObject } from 'react'
import type { MapViewHandle } from '../components/MapView'
import type { AnalyzeResponse, DestinationResult } from '../types'
import { useChartCompare, type ChartCompareInputs } from './useChartCompare'
import { useResultsLayout } from './useResultsLayout'
import { useTableView, type TableViewInputs } from './useTableView'

export interface ResultsViewInputs {
  /** Whether a report is on screen. */
  showResults: boolean
  /** The committed response, null before the first analysis. */
  response: AnalyzeResponse | null
  /** The displayed rows. */
  results: DestinationResult[]
  /** The named destinations no analysis has covered yet. */
  pending: TableViewInputs['pending']
  /** The table header's sort. */
  detailSort: TableViewInputs['detailSort']
  /** Every stored view preference, read once at mount. */
  storedView: TableViewInputs['storedView']
  /** Docked under the map at a desktop width, a sheet over it on a phone. */
  isDesktop: boolean
  /** Height of the preview banner above the map, which a resize leaves alone. */
  bannerPx: number
  /** Moves once per committed report. */
  analysisSeq: number
  /** The displayed ranking. */
  sortBy: TableViewInputs['sortBy']
  /** Whether the analyzed report is one hour. */
  pointSample: boolean
  /** The snapshot the held field was fetched under, null before the first analysis. */
  analyzed: TableViewInputs['analyzed']
  /** The published forecast models. */
  models: TableViewInputs['models']
  /** The panel's model. */
  forecastModel: string
  /** The models ticked for the chart's comparison. */
  comparedModels: ChartCompareInputs['comparedModels']
  /** The forecast's hourly stamps. */
  times: ChartCompareInputs['times']
  /** The deployment's window bounds. */
  windowLimits: ChartCompareInputs['windowLimits']
  /** Which destinations stand near an active wildfire. */
  fire: TableViewInputs['fire']
  /** The map, which the table's focus callbacks fly to a row. */
  mapRef: RefObject<MapViewHandle | null>
  /** Removes a searched place or pasted row by its coordinate. */
  removePlace: (latitude: number, longitude: number) => void
}

/**
 * The results sheet's view: whether it shows, its layout, the comparison
 * chart, the table's shape and its file, and the table's callbacks that reach
 * the map. One call so the sheet takes one object, and so the three hooks keep
 * the order they had in `App.tsx`: the chart reads the layout's
 * `chartShowing`, and the table reads the chart's comparison.
 */
export function useResultsView({
  showResults,
  response,
  results,
  pending,
  detailSort,
  storedView,
  isDesktop,
  bannerPx,
  analysisSeq,
  sortBy,
  pointSample,
  analyzed,
  models,
  forecastModel,
  comparedModels,
  times,
  windowLimits,
  fire,
  mapRef,
  removePlace,
}: ResultsViewInputs) {
  // A report stays on screen even when the knobs admit none of it. Collapsing
  // the panels would answer "why is nothing listed?" by removing the place the
  // answer goes, and the table's own empty row says which of the three reasons
  // it is.
  const showTable = showResults && (response !== null || pending.length > 0)

  const layout = useResultsLayout({
    modeChosen: storedView.modeChosen,
    isDesktop,
    bannerPx,
    showTable,
    response,
    analysisSeq,
  })

  // ── The comparison chart (#232) ───────────────────────────────────────────
  const charts = useChartCompare({
    results,
    pending,
    sortBy,
    analyzed,
    analysisSeq,
    models,
    forecastModel,
    comparedModels,
    times,
    windowLimits,
    chartShowing: layout.chartShowing,
  })
  const { compare, pendingRows, comparingRows } = charts

  // ── The table's shape and its file ──────────────────────────────────────────
  const tableView = useTableView({
    storedView,
    results,
    detailSort,
    sortBy,
    pointSample,
    analyzed,
    models,
    forecastModel,
    comparingRows,
    shownModels: compare.shown,
    compareResults: compare.results,
    compareReachEnds: compare.reachEnds,
    pending,
    pendingRows,
    fire,
  })

  // Stable identities for the table's callbacks, for the reason `NO_TIMES`
  // exists: an inline arrow is a new prop on every render.
  const onRemovePending = useCallback(
    (d: { latitude: number; longitude: number }) => removePlace(d.latitude, d.longitude),
    [removePlace],
  )
  const onFocusResult = useCallback(
    (row: DestinationResult) => mapRef.current?.focusResult(row),
    [mapRef],
  )
  const onFocusPending = useCallback(
    (at: { latitude: number; longitude: number }) => mapRef.current?.focusPoint(at),
    [mapRef],
  )

  return { showTable, layout, charts, tableView, onRemovePending, onFocusResult, onFocusPending }
}
