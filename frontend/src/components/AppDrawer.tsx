import { useId, useRef, type RefObject } from 'react'
import { SheetTop } from './BottomSheet'
import ControlPanel from './ControlPanel'
import type { MapViewHandle } from './MapView'
import { IconClose } from './icons'
import ThemeButton from './ThemeButton'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useSheetDrag } from '../hooks/useSheetDrag'
import type { Refusal, RunError } from '../hooks/useAnalyze'
import type { LiveCapabilities } from '../hooks/useCapabilities'
import type { DestinationInputs } from '../hooks/useDestinationInputs'
import type { DrawMode } from '../hooks/useDrawMode'
import type { ForecastSelectionState } from '../hooks/useForecastSelection'
import type { RankingKnobs } from '../hooks/useRankingKnobs'
import type { AnalyzeResponse, DestinationResult } from '../types'
import { type FireProximityStatus, checkNoticeDue } from '../utils/fireProximity'
import type { ClosureProximityStatus } from '../utils/closureProximity'
import type { ActionWord } from '../utils/analyzeGate'
import type { EventNoticeKind } from '../utils/notices'
import type { CommitReason } from '../utils/present'
import { CONTROLS_SHEET, HEADER_BUTTON, LAYER, MOTION, PANEL_EDGE, PANEL_HEADER } from '../styles'
import type { Theme } from '../utils/viewPrefs'

interface AppDrawerProps {
  /** Whether the panel is open: docked on a desktop, the Controls sheet on a phone. */
  open: boolean
  /** A desk, where the panel docks beside the map; a phone raises it as a sheet. */
  isDesktop: boolean
  /** The Controls sheet's height on a phone: its own share (`controlsSheetPx`), or where a drag left it. */
  sheetPx: number
  /** Its own share, which a release near it or a double press on the grip gives back (record 0146). */
  sheetRestPx: number
  /** The most a drag raises it (`controlsFullPx`). */
  sheetFullPx: number
  /** Holds it at a dragged height, or null for its own share. */
  onSheetPx: (px: number | null) => void
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
  error: RunError | null
  refusal: Refusal | null
  /** What the Analyze button reads (#736), and the dismissal of an event line. */
  actionWord: ActionWord
  onDismissEvent: (kind: EventNoticeKind) => void
  /** Open the guided tutorial from the panel footer (#536). */
  onTutorial: () => void
  /** The tour cannot start now (a draw or a run is under way), so the footer's link is inert. */
  tutorialWaits?: boolean
  /** The committed report, and the rows on display. */
  response: AnalyzeResponse | null
  results: DestinationResult[]
  /** Where the wildfire check stands, for the panel's note when it failed. */
  fireStatus: FireProximityStatus
  /** Where the closure check stands, for the same note about closures. */
  closureStatus: ClosureProximityStatus
  /** The Wildfires and area closures layers, which each check's note follows (`checkNoticeDue`). */
  showWildfires: boolean
  showAreaClosures: boolean
  // The basemap style is failing to load (#580).
  basemapFailed: boolean
  /** Where a phone's notices stand (record 0140), or null at a desk. */
  noticeHome?: HTMLElement | null
  /** The theme, and the switch the header carries (`useTheme`, #706). */
  theme: Theme
  onToggleTheme: () => void
}

/**
 * The controls panel around `ControlPanel` (#409 cut it out of `App.tsx`):
 * docked beside the map at a desk, and on a phone the Controls sheet (#696;
 * record 0141), which the summary chip raises from the map's foot with the
 * Analyze button riding its edge. Closing on a committed report is App's,
 * because the report is App's: this only draws the panel it is told is open.
 */
export default function AppDrawer({
  open,
  isDesktop,
  sheetPx,
  sheetRestPx,
  sheetFullPx,
  onSheetPx,
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
  actionWord,
  onDismissEvent,
  onTutorial,
  tutorialWaits,
  response,
  results,
  fireStatus,
  closureStatus,
  showWildfires,
  showAreaClosures,
  basemapFailed,
  noticeHome = null,
  theme,
  onToggleTheme,
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
  // Opened from the map's Controls button, which unmounts as the drawer opens,
  // the keyboard lands on this drawer's own way back out (#576). On a phone
  // that is the sheet's Done.
  const closeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(closeRef, open)
  const headingId = useId()
  // The grip and the title drag the sheet the way a menu's are dragged
  // (record 0146), with the heights App holds, since the Analyze button and
  // the notice band ride its edge.
  const onGripDown = useSheetDrag({
    measure: () => ({ startPx: sheetPx, restPx: sheetRestPx, fullPx: sheetFullPx }),
    onHeight: onSheetPx,
    onClose,
  })
  const panel = (
    <ControlPanel
      phone={!isDesktop}
      drawing={drawing}
      onStartDrawing={startDrawing}
      onFinishDrawing={finishDrawing}
      drawPointCount={drawPointCount}
      polygonAreaKm2={polygonAreaKm2}
      onCancelDrawing={handleCancelDrawing}
      onClearDrawing={handleClearDrawing}
      onPointAtSearch={onPointAtSearch}
      wildfireCheckFailed={checkNoticeDue(fireStatus, showWildfires, results.length)}
      closureCheckFailed={checkNoticeDue(closureStatus, showAreaClosures, results.length)}
      basemapFailed={basemapFailed}
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
      actionWord={actionWord}
      onDismissEvent={onDismissEvent}
      onTutorial={onTutorial}
      tutorialWaits={tutorialWaits}
      noticeHome={noticeHome}
      resultCount={response ? results.length : undefined}
      // What the current bounds admit, not what the analysis fetched:
      // a bound applies live, so it has to move the "of M" or the count
      // describes a field the table no longer shows.
    />
  )

  if (!isDesktop) {
    return (
      // Not a dialog: nothing outside it goes inert or dim, and the map's
      // Analyze stands on its edge. A labelled region, so a screen reader
      // can name what opened. Inert while shut for the reason the desk's
      // panel is (#576), and Escape closes it as Done does.
      <section
        inert={!open}
        aria-labelledby={headingId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        className={`${CONTROLS_SHEET.card} ${open ? '' : CONTROLS_SHEET.shut}`}
        style={{ height: sheetPx }}
      >
        <SheetTop
          heading="Controls"
          headingId={headingId}
          onClose={onClose}
          onGripDown={onGripDown}
          doneRef={closeRef}
          actions={<ThemeButton theme={theme} onToggle={onToggleTheme} />}
        />
        <div className={CONTROLS_SHEET.panel}>{panel}</div>
      </section>
    )
  }
  return (
    <>
      {/* Controls panel — docked on desktop when open, off-canvas otherwise.
          When closed it stays absolute + translated off-screen so it leaves the
          layout and the map fills the full width on every breakpoint.

          Inert while closed: off screen is not out of the Tab order, and the
          closed drawer kept some 45 stops a keyboard walked through blind
          before reaching the map (#576). */}
      <aside
        inert={!open}
        className={`absolute inset-y-0 left-0 ${LAYER.drawer} w-[calc(100vw-2rem)] max-w-90 ${MOTION.slide} flex-shrink-0 bg-panel flex flex-col overflow-hidden border-r ${PANEL_EDGE} ${
          open
            ? 'translate-x-0 lg:static lg:z-10 lg:w-90 lg:max-w-none lg:transition-none'
            : '-translate-x-full'
        }`}
      >
        {/* The header's buttons: the theme switch, then the close button,
            which collapses the panel. */}
        <div className={PANEL_HEADER.actions}>
          <ThemeButton theme={theme} onToggle={onToggleTheme} />
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close controls"
            // Flex centres the drawn cross in the circle; why the cross is
            // drawn rather than typed is `IconClose`'s own comment.
            className={HEADER_BUTTON}
          >
            <IconClose />
          </button>
        </div>
        {panel}
      </aside>
    </>
  )
}
