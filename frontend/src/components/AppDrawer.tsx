import type { RefObject } from 'react'
import ControlPanel from './ControlPanel'
import type { MapViewHandle } from './MapView'
import { IconClose } from './icons'
import type { Refusal } from '../hooks/useAnalyze'
import type { LiveCapabilities } from '../hooks/useCapabilities'
import type { DestinationInputs } from '../hooks/useDestinationInputs'
import type { DrawMode } from '../hooks/useDrawMode'
import type { ForecastSelectionState } from '../hooks/useForecastSelection'
import type { RankingKnobs } from '../hooks/useRankingKnobs'
import type { AnalyzeResponse, DestinationResult } from '../types'
import type { FireProximityStatus } from '../utils/fireProximity'
import type { CommitReason } from '../utils/present'
import { LAYER, RADIUS, SURFACE_DIVIDER, TAP, TEXT } from '../styles'

interface AppDrawerProps {
  /** Whether the panel is open: docked on a desktop, over the map on a phone. */
  open: boolean
  /** Closes it, from its own button or from the backdrop behind it. */
  onClose: () => void
  /** Draw mode and its buttons (`useDrawMode`). */
  drawMode: Pick<
    DrawMode,
    'drawing' | 'startDrawing' | 'finishDrawing' | 'drawPointCount' | 'handleCancelDrawing' | 'handleClearDrawing'
  >
  /** The discovery inputs: types, the coordinates box, pins (`useDestinationInputs`). */
  destinationInputs: Pick<
    DestinationInputs,
    | 'polygonAreaKm2'
    | 'destinationTypes'
    | 'setDestinationTypes'
    | 'customCsv'
    | 'setCustomCsv'
    | 'includeUnnamedPeaks'
    | 'setIncludeUnnamedPeaks'
    | 'places'
  >
  /** The window, the model and its comparisons (`useForecastSelection`). */
  forecastSelection: Pick<
    ForecastSelectionState,
    | 'selection'
    | 'changeSelection'
    | 'windowWarning'
    | 'forecastModel'
    | 'changeForecastModel'
    | 'comparedModels'
    | 'setComparedModels'
    | 'modelClamped'
    | 'panelPointSample'
  >
  /** The ranking, the cap and the bounds (`useRankingKnobs`). */
  rankingKnobs: Pick<
    RankingKnobs,
    | 'sortBy'
    | 'setSortBy'
    | 'sortDesc'
    | 'setSortDesc'
    | 'rowKeys'
    | 'constraints'
    | 'setConstraints'
    | 'limit'
    | 'setLimit'
    | 'clearFilters'
  >
  /** The deployment's published limits and models (`useCapabilities`). */
  caps: LiveCapabilities
  /** The map, which a pasted list of coordinates fits to. */
  mapRef: RefObject<MapViewHandle | null>
  /** The panel's Map group is hovered: the search box and the map's features wear a cue. */
  onPointAtSearch: (on: boolean) => void
  onPointAtMapPois: (on: boolean) => void
  /** Why the report no longer answers what the panel asks. */
  commitReasons: CommitReason[]
  /** Analyze, and the one run a link may ask for on open. */
  onAnalyze: () => void
  autoAnalyze: boolean
  capabilitiesSettled: boolean
  onAutoAnalyze: () => void
  /** The run in flight and how it ended (`useAnalyze`). */
  loading: boolean
  error: string | null
  refusal: Refusal | null
  onRetry: () => void
  /** The committed report, and the rows on display. */
  response: AnalyzeResponse | null
  results: DestinationResult[]
  /** Where the wildfire check stands, for the panel's note when it failed. */
  fireStatus: FireProximityStatus
  /** The footer's Tutorial link (#536). */
  onStartTour: () => void
}

/**
 * The controls drawer and the backdrop behind it on a phone, around
 * `ControlPanel` (#409 cut it out of `App.tsx`). Closing on a committed report
 * is App's, because the report is App's: this only draws the drawer it is told
 * is open.
 */
export default function AppDrawer({
  open,
  onClose,
  drawMode,
  destinationInputs,
  forecastSelection,
  rankingKnobs,
  caps,
  mapRef,
  onPointAtSearch,
  onPointAtMapPois,
  commitReasons,
  onAnalyze,
  autoAnalyze,
  capabilitiesSettled,
  onAutoAnalyze,
  loading,
  error,
  refusal,
  onRetry,
  response,
  results,
  fireStatus,
  onStartTour,
}: AppDrawerProps) {
  const { drawing, startDrawing, finishDrawing, drawPointCount, handleCancelDrawing, handleClearDrawing } = drawMode
  const {
    polygonAreaKm2,
    destinationTypes,
    setDestinationTypes,
    customCsv,
    setCustomCsv,
    includeUnnamedPeaks,
    setIncludeUnnamedPeaks,
    places,
  } = destinationInputs
  const {
    selection,
    changeSelection,
    windowWarning,
    forecastModel,
    changeForecastModel,
    comparedModels,
    setComparedModels,
    modelClamped,
    panelPointSample,
  } = forecastSelection
  const {
    sortBy,
    setSortBy,
    sortDesc,
    setSortDesc,
    rowKeys,
    constraints,
    setConstraints,
    limit,
    setLimit,
    clearFilters,
  } = rankingKnobs
  return (
    <>
      {/* Mobile: dim backdrop behind the open drawer */}
      {open && (
        <div
          onClick={onClose}
          className={`lg:hidden absolute inset-0 ${LAYER.scrim} bg-black/50`}
        />
      )}

      {/* Controls panel — docked on desktop when open, off-canvas otherwise.
          When closed it stays absolute + translated off-screen so it leaves the
          layout and the map fills the full width on every breakpoint. */}
      {/* `data-drawer` is how the tutorial finds this to wait out its slide. */}
      <aside
        data-drawer
        className={`absolute inset-y-0 left-0 ${LAYER.drawer} w-[calc(100vw-2rem)] max-w-90 transform transition-transform duration-300 ease-in-out flex-shrink-0 bg-slate-800 flex flex-col overflow-hidden border-r ${SURFACE_DIVIDER} ${
          open
            ? 'translate-x-0 lg:static lg:z-10 lg:w-90 lg:max-w-none lg:transition-none'
            : '-translate-x-full'
        }`}
      >
        {/* Close button — collapses the panel on both mobile and desktop */}
        <button
          onClick={onClose}
          aria-label="Close controls"
          // Flex centres the drawn cross in the circle; why the cross is drawn
          // rather than typed is `IconClose`'s own comment.
          className={`${TAP.action} absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center ${TEXT.control} ${RADIUS.pill} bg-slate-700/80 transition-colors hover:bg-slate-600 active:bg-slate-600`}
        >
          <IconClose />
        </button>
        <ControlPanel
          drawing={drawing}
          onStartDrawing={startDrawing}
          onFinishDrawing={finishDrawing}
          drawPointCount={drawPointCount}
          polygonAreaKm2={polygonAreaKm2}
          onCancelDrawing={handleCancelDrawing}
          onClearDrawing={handleClearDrawing}
          onPointAtSearch={onPointAtSearch}
          wildfireCheckFailed={fireStatus === 'unavailable' && results.length > 0}
          onPointAtMapPois={onPointAtMapPois}
          destinationTypes={destinationTypes}
          setDestinationTypes={setDestinationTypes}
          selection={selection}
          setSelection={changeSelection}
          limit={limit}
          setLimit={setLimit}
          customCsv={customCsv}
          setCustomCsv={setCustomCsv}
          onCsvPasted={(points) => mapRef.current?.fitToPoints(points)}
          commitReasons={commitReasons}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortDesc={sortDesc}
          setSortDesc={setSortDesc}
          rowKeys={rowKeys}
          pointSample={panelPointSample}
          constraints={constraints}
          setConstraints={setConstraints}
          onClearFilters={clearFilters}
          includeUnnamedPeaks={includeUnnamedPeaks}
          setIncludeUnnamedPeaks={setIncludeUnnamedPeaks}
          windowWarning={windowWarning}
          hasPins={places.length > 0}
          // A pins-only Analyze refresh keeps useAnalyze.loading false, so fold
          // in the pin-refresh flag to disable the button (and show "Analyzing…")
          // while it runs. Searches don't announce, so this stays false for them.
          loading={loading}
          error={error}
          refusal={refusal}
          forecastModel={forecastModel}
          comparedModels={comparedModels}
          setComparedModels={setComparedModels}
          setForecastModel={changeForecastModel}
          forecastModels={caps.forecastModels}
          defaultForecastModel={caps.defaultForecastModel}
          modelClamped={modelClamped}
          maxLimit={caps.maxLimit}
          maxAreaKm2={caps.maxPolygonAreaKm2}
          archiveDays={caps.archiveDays}
          aqiForecastDays={caps.aqiForecastDays}
          windowLimits={caps.windowLimits}
          aqiAllNull={
            response !== null &&
            results.length > 0 &&
            results.every((r) => r.aqi_avg == null)
          }
          onAnalyze={onAnalyze}
          autoAnalyze={autoAnalyze}
          capabilitiesSettled={capabilitiesSettled}
          onAutoAnalyze={onAutoAnalyze}
          onRetry={onRetry}
          onStartTour={onStartTour}
          resultCount={response ? results.length : undefined}
          // What the current bounds admit, not what the analysis fetched:
          // a bound applies live, so it has to move the "of M" or the count
          // describes a field the table no longer shows.
        />
      </aside>
    </>
  )
}
