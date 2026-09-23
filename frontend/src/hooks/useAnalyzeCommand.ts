import { type RefObject, useRef } from 'react'
import type { MapViewHandle } from '../components/MapView'
import type { AnalyzeRequest, GeoPolygon } from '../types'
import type { AnalyzeOptions } from './analyzeTypes'
import { type AnalyzeInputs, planAnalysis } from '../utils/analyzeRequest'
import { type ForecastSelection, type SelectionKind, selectionLocalWindow } from '../utils/calendarSelection'
import type { DiscoveryRecord } from '../utils/clientAnalyze'

export type AnalyzeCommandInputs = Omit<AnalyzeInputs, 'kind' | 'window' | 'polygon' | 'previous'> & {
  selection: ForecastSelection
  /** The ring as the app holds it: what a click falls back to before the map loads. */
  polygon: GeoPolygon | null
  drawPointCount: number
  mapRef: RefObject<MapViewHandle | null>
  analyze: (request: AnalyzeRequest, kind: SelectionKind, options: AnalyzeOptions) => Promise<void>
  /** Drops the report on screen without fetching. */
  reset: () => void
  finishDrawing: () => void
  forgetPreClamp: () => void
  clearRemovalsForScope: (scope: string) => void
  setShowResults: (show: boolean) => void
}

/**
 * The Analyze button: the side effects of one click, in the order they must
 * run. Which request goes out is `planAnalysis`'s decision; this hook owns the
 * one piece of state that outlives a click, the discovery record a later
 * Analyze reads to decide whether it is a refresh.
 *
 * `handleAnalyze` is a plain function rather than a callback: `analyze` is a
 * new function on every render, so a memo keyed on it would never hold, and
 * the panel that takes it is not memoized.
 */
export function useAnalyzeCommand(inputs: AnalyzeCommandInputs) {
  // The discovery inputs behind the results currently on screen, as
  // `isDiscoveryRefresh` reads them: `base` covers the user-authored inputs
  // (polygon + types + unnamed peaks + CSV rows) and `searchedKeys` the
  // searched places that competed.
  const discoveryRef = useRef<DiscoveryRecord | null>(null)

  async function handleAnalyze() {
    const {
      selection,
      drawPointCount,
      mapRef,
      analyze,
      reset,
      finishDrawing,
      forgetPreClamp,
      clearRemovalsForScope,
      setShowResults,
    } = inputs
    // Analyzing is the end of drawing. Leaving the mode on would put the map
    // back in the state #118 describes: reading a result and panning around
    // it while every click still adds a vertex.
    finishDrawing()
    forgetPreClamp()

    // The one conversion from a local selection to the UTC instants the API
    // takes. Equal timestamps are how a point sample travels (the current
    // hour, or a day narrowed to a single hour), and the backend normalizes
    // them to the hour containing the moment.
    const local = selectionLocalWindow(selection, new Date())
    // Unreachable through the UI (the dates blocker disables Analyze), kept as
    // the honest backstop: a dateless selection has nothing to fetch.
    if (local === null) return

    // An incomplete ring is ignored so a mid-draw Analyze doesn't fire a bogus
    // discovery. The map's finishDrawing snapshots its always-editable ring
    // synchronously (and closes it), falling back to the app's polygon before
    // the map has loaded.
    const polygon = drawPointCount >= 3 ? mapRef.current?.finishDrawing() ?? inputs.polygon : null
    // Every field named, never the input bag spread: a spread skips the
    // excess-property check, and the planner must not receive the refs and
    // setters it has no business with. `satisfies` keeps the literal exact.
    const planned = {
      kind: selection.kind,
      window: { start: new Date(local.start).toISOString(), end: new Date(local.end).toISOString() },
      polygon,
      destinationTypes: inputs.destinationTypes,
      includeUnnamedPeaks: inputs.includeUnnamedPeaks,
      csvRows: inputs.csvRows,
      places: inputs.places,
      destinationScope: inputs.destinationScope,
      forecastModel: inputs.forecastModel,
      comparedModels: inputs.comparedModels,
      limit: inputs.limit,
      sortBy: inputs.sortBy,
      sortDesc: inputs.sortDesc,
      constraints: inputs.constraints,
      universe: inputs.universe,
      results: inputs.results,
      removedKeys: inputs.removedKeys,
      hasResults: inputs.hasResults,
      previous: discoveryRef.current,
    } satisfies AnalyzeInputs
    const plan = planAnalysis(planned)

    clearRemovalsForScope(plan.removalScope)

    // Before the await, not after it. The analysis publishes ranked rows as
    // each batch lands (#337, finding 2), and a results area that opens only
    // once the whole run returns would hide every one of them until the end.
    const { willRank, run, record } = plan
    if (willRank) setShowResults(true)

    if (record?.when === 'before') discoveryRef.current = record.value
    if (run) await analyze(run.request, run.kind, run.options)
    if (record?.when === 'after') discoveryRef.current = record.value

    // Nothing to rank (unreachable through the gate, which requires an input,
    // but kept as a safety net): drop any stale report.
    if (!willRank) reset()

    setShowResults(true)
  }

  return { handleAnalyze }
}
