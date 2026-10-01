import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { MapViewHandle } from './components/MapView'
import AppDrawer from './components/AppDrawer'
import MapStage from './components/MapStage'
import ResultsSheet from './components/ResultsSheet'
import WelcomeModal from './components/WelcomeModal'

// The tutorial's overlay is a chunk of its own, fetched on the first press
// (#536): most readers never open it, and with it in the main bundle the cold
// load carried 5.4 KB of gzip for a card nobody had asked for. The state hook
// stays in the main bundle, because the footer link and the welcome dialog
// need `start` before any chunk is asked for; its demonstration report is
// loaded the same way, when its step opens.
const Tour = lazy(() => import('./tour/Tour'))
import type { DestinationResult } from './types'

// Hoisted, so the fire and closure checks read one empty list while the
// tutorial's demonstration report is on screen rather than a fresh one per
// render.
const NO_ROWS: DestinationResult[] = []
import { useTour } from './tour/useTour'
import { TUTORIAL_PATH } from './utils/tourSteps'
import PreviewBanner from './components/PreviewBanner'
import { useAnalyze } from './hooks/useAnalyze'
import { useCapabilities } from './hooks/useCapabilities'
import { useForecastSelection } from './hooks/useForecastSelection'
import { useRankingKnobs } from './hooks/useRankingKnobs'
import { useDestinationInputs } from './hooks/useDestinationInputs'
import { useAnalyzeCommand } from './hooks/useAnalyzeCommand'
import { useDrawMode } from './hooks/useDrawMode'
import { useMapOverlays } from './hooks/useMapOverlays'
import { useTimeline } from './hooks/useTimeline'
import { usePresentedReport } from './hooks/usePresentedReport'
import { useRemovals } from './hooks/useRemovals'
import { useResultsView } from './hooks/useResultsView'
import { useRunOnOpen } from './hooks/useRunOnOpen'
import { useUrlSync } from './hooks/useUrlSync'
import { useFireProximity } from './hooks/useFireProximity'
import { useClosureProximity } from './hooks/useClosureProximity'
import { useGridLayer } from './hooks/useGridLayer'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import {
  LAYER,
  SURFACE_PAGE,
} from './styles'
import {
  decodeState,
} from './utils/urlState'
import { removalScopeFor } from './utils/analyzeRequest'
import {
  panelCommitCues,
  reportView,
} from './utils/present'
import {
  hasWelcomed,
  readViewPrefs,
  setWelcomed,
} from './utils/viewPrefs'

export default function App() {
  const mapRef = useRef<MapViewHandle>(null)

  // Live limits from /api/capabilities: the analysis cap gates the client-side
  // paths and the results knob's ceiling, so a server recalibration reaches
  // the UI without a frontend release. Read before the state block below
  // because the restored limit is clamped against it on the way in.
  const caps = useCapabilities()

  // Restore any prior session encoded in the URL once, at mount. Feeding each
  // useState a lazy initializer avoids a redraw flash — the restored values are
  // the initial render, not a post-mount setState.
  const restoredRef = useRef(decodeState(window.location.search))
  const restored = restoredRef.current
  // The camera a link names: stable for the session, like `restored`.
  const restoredView = restored?.view ?? null

  const destinationInputs = useDestinationInputs(restored)
  const {
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    customCsv,
    csvRows,
    destinationScope,
    places,
    addPlace,
    removePlace,
    destinationNamed,
  } = destinationInputs
  // The removal scope of the link's own ring and list, so the removals it
  // carried survive its first Analyze (`useRemovals`). Measured once: the
  // scope is the link's, not whatever the panel holds later.
  const [restoredRemovalScope] = useState(() => removalScopeFor(polygon, destinationScope))
  const forecastSelection = useForecastSelection(restored, caps)
  const {
    selection,
    forecastModel,
    comparedModels,
    panelWindowMs,
    forgetPreClamp,
  } = forecastSelection
  const rankingKnobs = useRankingKnobs(restored, caps.maxLimit)
  const {
    sortBy,
    sortDesc,
    rowKeys,
    constraints,
    limit,
    liveKnobs,
  } = rankingKnobs

  const [showResults, setShowResults] = useState(false)
  // Every stored view preference comes out of one read, held for the mount:
  // several initializers each parsing the same stored string is what
  // `viewPrefs.ts` exists to stop. The results layout takes the mode; the
  // table takes the rest.
  const storedView = useMemo(readViewPrefs, [])
  // A page opened at /tutorial starts the tour once the panel is up, in
  // place of the welcome dialog (#536): the path is a link that opens the
  // tour, and the tour's own start and end keep it and clear it.
  const openedAtTutorial = useRef(window.location.pathname === TUTORIAL_PATH)
  const [showWelcome, setShowWelcome] = useState(() => !hasWelcomed() && !openedAtTutorial.current)
  // The controls panel is docked on desktop and an off-canvas drawer on phones.
  // It starts open on both; a close button collapses it to widen the map.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // The panel's Map group is hovered, so the map's search box — a control
  // the panel names but does not contain — wears a ring.
  const [searchPointed, setSearchPointed] = useState(false)
  // The same hover glows every clickable feature on the map: the Map group
  // covers both map-borne methods, so its cue lights both controls at once.
  const [poisPointed, setPoisPointed] = useState(false)
  const isDesktop = useIsDesktop()
  const overlays = useMapOverlays(restored, isDesktop)
  const {
    showWildfires,
    showAreaClosures,
    showTrailClosures,
    showRadar,
    showSmoke,
    showSnow,
    showGrid,
    showPlayer,
    playerShown,
  } = overlays
  const closeDrawer = useCallback(() => setSidebarOpen(false), [])
  const openDrawer = useCallback(() => setSidebarOpen(true), [])
  const drawMode = useDrawMode({
    mapRef,
    polygon,
    restoredPolygon: restored?.polygon,
    isDesktop,
    closeDrawer,
  })
  const {
    drawing,
    drawPointCount,
    finishDrawing,
  } = drawMode

  function dismissWelcome() {
    setWelcomed()
    setShowWelcome(false)
  }

  // The guided tutorial (#536). Starting it from the welcome dialog counts as
  // welcomed, so a reader who ends it early is not shown the dialog again.
  const tour = useTour({ isDesktop, sidebarOpen, setSidebarOpen, mapRef })
  function startTourFromWelcome() {
    dismissWelcome()
    tour.start()
  }

  const analysis = useAnalyze(
    caps.maxDestinations,
    caps.forecastModels,
    caps.windowLimits,
    caps.aqiForecastDays,
  )
  const {
    analyze,
    retry,
    reset,
    analyzed,
    analysisSeq,
    fireField,
    fireSeq,
    loading,
    arriving,
    error,
    refusal,
    response,
    universe,
  } = analysis

  // ── The map timeline (#121) ───────────────────────────────────────────────
  // While the tutorial's last step is open, the results sheet, the chart and
  // the markers read a demonstration report instead of the real one (#536).
  // Everything else — the grid, removals, the URL, the commit cues and the
  // pending set they count — keeps reading the real analysis, so ending the
  // tour leaves nothing behind.
  const demo = tour.demo
  const shownResponse = demo?.response ?? response
  const shownAnalyzed = demo?.analyzed ?? analyzed
  const shownUniverse = demo?.universe ?? universe
  // No forecast player over the demonstration: its bar stands along the
  // map's bottom edge, where the marker step's popup ends on a short window.
  const timeline = useTimeline({
    times: shownResponse?.times,
    analysisSeq,
    playerShown: playerShown && demo === null,
    showRadar,
  })
  const {
    forecastTimes,
    timelineAxes,
    playbackIndex,
    movePlayheadTo,
  } = timeline

  // ── The forecast grid (#246) ──────────────────────────────────────────────
  const gridLayer = useGridLayer({
    restored,
    showGrid,
    analyzed,
    universe,
    forecastModel,
    forecastModels: caps.forecastModels,
    forecastTimes,
    analysisSeq,
    windowLimits: caps.windowLimits,
    aqiForecastDays: caps.aqiForecastDays,
  })
  const {
    gridStyle,
    gridReachFrac,
  } = gridLayer

  const removals = useRemovals({
    places,
    addPlace,
    removePlace,
    destinationScope,
    csvRows,
    universe,
    response,
    restoredRemoved: restored?.removed,
    restoredScope: restoredRemovalScope,
  })
  const {
    removedKeys,
    activeRemovedKeys,
    clearForScope: clearRemovalsForScope,
  } = removals

  // Naming a destination — by search or by pasting CSV — opens the results
  // panel immediately: it appears as an un-forecasted row, so there's feedback
  // before any analysis runs. Keyed on the fact, never on the lists behind it,
  // for the reason `destinationNamed` states in useDestinationInputs.
  useEffect(() => {
    if (destinationNamed) setShowResults(true)
  }, [destinationNamed])

  // What the displayed report is rendered under, and whether it is one hour.
  const { view, pointSample } = reportView(shownAnalyzed, sortBy, sortDesc, selection.kind, panelWindowMs)
  const preview = usePreview()

  const report = usePresentedReport({
    universe: shownUniverse,
    response: shownResponse,
    analyzed: shownAnalyzed,
    coverage: analyzed,
    analysisSeq,
    arriving,
    liveKnobs,
    view,
    pointSample,
    removedKeys,
    activeRemovedKeys,
    places,
    csvRows,
    restoredTableSort: restored?.tableSort ?? null,
  })
  const {
    results,
    detailSort,
    tableSort,
    pending,
  } = report

  // The address bar mirrors the panel and the map's layers (useUrlSync).
  const urlSync = useUrlSync({
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    selection,
    forecastModel,
    comparedModels,
    sortBy,
    sortDesc,
    rowKeys,
    constraints,
    limit,
    customCsv,
    showWildfires,
    showAreaClosures,
    showTrailClosures,
    showRadar,
    showSmoke,
    showSnow,
    showGrid,
    showPlayer,
    gridStyle,
    gridReachFrac,
    places,
    defaultForecastModel: caps.defaultForecastModel,
    removedKeys,
    tableSort,
    restoredView,
    cameraHeld: tour.index !== null,
  })
  const { writeUrl } = urlSync

  // Flags destinations within 10 mi of an active US wildfire; independent of the
  // map overlay toggle. Empty (no ⚠️) when best-effort NIFC data is unavailable.
  // Fed the candidate field useAnalyze publishes at discovery, so the NIFC
  // lookup overlaps the weather fetch instead of following it; the committed
  // universe answers when no candidate field exists (a failed run, the server
  // path), and the displayed rows when there is no universe either. Live
  // knobs re-present rows without re-querying NIFC. (Called here, above the
  // table view, because the wildfire column sorts and renders out of its
  // maps.)
  const checkField = fireField ?? universe ?? (demo ? NO_ROWS : results)
  const fire = useFireProximity(checkField, fireSeq)
  // Flags destinations inside an active Forest Service area closure (#550):
  // the Closure column's check, on the fire check's field and sequence,
  // because both are one lookup per analysis over the same candidates.
  const closure = useClosureProximity(checkField, fireSeq)

  // Every knob that has stopped being live, and why. Empty while everything
  // applies instantly, which is the normal case: the cues exist so the
  // controls never feel dead.
  const commitReasons = panelCommitCues(analyzed, {
    settled: !loading && response !== null,
    selectionKind: selection.kind,
    windowMs: panelWindowMs,
    forecastModel,
    comparedModels,
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    pendingCount: pending.length,
    sortBy,
    constraints,
  })

  const { handleAnalyze } = useAnalyzeCommand({
    selection,
    polygon,
    drawPointCount,
    mapRef,
    destinationTypes,
    includeUnnamedPeaks,
    csvRows,
    places,
    destinationScope,
    forecastModel,
    comparedModels,
    limit,
    sortBy,
    sortDesc,
    constraints,
    universe,
    results,
    removedKeys,
    hasResults: response !== null && response.results.length > 0,
    analyze,
    reset,
    finishDrawing,
    forgetPreClamp,
    clearRemovalsForScope,
    setShowResults,
  })

  // A link that asks to run its analysis on open (`analyze=1`, #511).
  const { autoAnalyze, capsApplied, runAutoAnalyze } = useRunOnOpen({
    settled: caps.settled,
    flushUrl: writeUrl.flush,
    analyze: handleAnalyze,
  })

  // On mobile the controls are an off-canvas drawer, and it closes when an
  // analysis SUCCEEDS rather than when the button is pressed. Closing on press
  // meant a failure was invisible: the drawer slid away, the overlay finished,
  // and the reader was left looking at an empty map while the error sat in a
  // panel they had to think to reopen. Keyed on `analysisSeq`, which only moves
  // when a report commits, so a refusal or an upstream error simply leaves the
  // drawer where it is with the message already in it — including the refusal
  // remedies, which are buttons and could not live anywhere else.
  //
  // Desktop is unaffected: the panel is docked there and never closes.
  useEffect(() => {
    if (analysisSeq > 0 && !isDesktop) setSidebarOpen(false)
    // Kept: listing `isDesktop` would close the drawer when a window crossed
    // the breakpoint, which is a resize rather than a committed report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisSeq])

  // A committed report whose rows all stand outside the view moves the map to
  // them; a view that shows one of them is the reader's and stays (the
  // maintainer, 2026-10-01, #579). An app move, so it makes no link by itself.
  // Keyed on the commit alone: a live knob re-presents the same field and must
  // not pull the camera, and the tutorial's demonstration commits nothing.
  useEffect(() => {
    if (analysisSeq > 0) mapRef.current?.frameRowsIfNoneInView(results)
    // Kept: listing `results` would move the map on every live knob.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisSeq])

  // Space below the map that a resize must leave alone: the preview banner (when
  // present) sits above the map, so the map + chart + table share the rest.
  const bannerPx = preview.enabled ? 32 : 0
  // The results sheet's view: its layout, the comparison chart, the table's
  // shape and file, and the table's callbacks (useResultsView).
  const resultsView = useResultsView({
    showResults: showResults || demo !== null,
    collapsedOverride: tour.sheetCollapsed,
    response: shownResponse,
    results,
    pending,
    detailSort,
    storedView,
    isDesktop,
    bannerPx,
    analysisSeq,
    sortBy: view.sortBy,
    pointSample,
    analyzed: shownAnalyzed,
    models: caps.forecastModels,
    forecastModel,
    comparedModels,
    times: forecastTimes,
    windowLimits: caps.windowLimits,
    fire,
    closure,
    mapRef,
    removePlace,
  })
  const { layout, tableView } = resultsView

  // The tour waits while a polygon is being drawn or a run is in flight: its
  // first card frames the Destinations section, which mid-draw shows Cancel
  // and Clear in place of its controls, and a run that lands under the tour
  // would redraw the report the demonstration stands in for. Both ways in
  // are inert meanwhile; a page opened at /tutorial with `analyze=1` starts
  // once its run has settled.
  const tourWaits = drawing || loading
  const startTour = tour.start
  useEffect(() => {
    if (!openedAtTutorial.current || tourWaits) return
    openedAtTutorial.current = false
    setWelcomed()
    startTour()
  }, [startTour, tourWaits])

  return (
    <div className={`flex flex-col h-dvh w-screen overflow-hidden ${SURFACE_PAGE}`}>
      {preview.enabled && <PreviewBanner pr={preview.pr} commit={preview.commit} />}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
      {showWelcome && (
        <WelcomeModal onDismiss={dismissWelcome} onTutorial={startTourFromWelcome} tutorialWaits={tourWaits} />
      )}
      {tour.index !== null && (
        <Suspense fallback={null}>
          <Tour
            steps={tour.steps}
            index={tour.index}
            onNext={tour.next}
            onPrev={tour.prev}
            onEnd={tour.end}
          />
        </Suspense>
      )}
      {layout.isDragging && (
        <div className={`fixed inset-0 ${LAYER.modal} cursor-ns-resize touch-none`} />
      )}

      <AppDrawer
        open={sidebarOpen}
        onClose={closeDrawer}
        drawMode={drawMode}
        destinationInputs={destinationInputs}
        forecastSelection={forecastSelection}
        rankingKnobs={rankingKnobs}
        caps={caps}
        mapRef={mapRef}
        onPointAtSearch={setSearchPointed}
        onPointAtMapPois={setPoisPointed}
        commitReasons={commitReasons}
        onAnalyze={handleAnalyze}
        autoAnalyze={autoAnalyze}
        capabilitiesSettled={capsApplied}
        onAutoAnalyze={runAutoAnalyze}
        loading={loading}
        error={error}
        refusal={refusal}
        onRetry={retry}
        onTutorial={tour.start}
        tutorialWaits={tourWaits}
        response={response}
        results={results}
        fireStatus={fire.status}
        closureStatus={closure.status}
      />

      {/* Map + results column. On a phone the results leave the flow and stand
          on the map as a sheet, so the column is what positions them; on
          desktop nothing is positioned and the class list is the one it was. */}
      <div className={`flex-1 flex flex-col overflow-hidden min-w-0${isDesktop ? '' : ' relative'}`}>
        <MapStage
          mapRef={mapRef}
          drawMode={drawMode}
          destinationInputs={destinationInputs}
          removals={removals}
          overlays={overlays}
          grid={gridLayer}
          timeline={timeline}
          report={report}
          tableView={tableView}
          fire={fire}
          closure={closure}
          layout={layout}
          analysis={analysis}
          sortBy={view.sortBy}
          modelId={analyzed?.forecastModel ?? forecastModel}
          showResults={showResults}
          sidebarOpen={sidebarOpen}
          onOpenControls={openDrawer}
          layersForcedOpen={tour.layersOpen}
          searchPointed={searchPointed}
          poisPointed={poisPointed}
          urlSync={urlSync}
          restoredView={restoredView}
        />

        <ResultsSheet
          resultsView={resultsView}
          showResults={showResults || demo !== null}
          chartTooltipIndex={tour.chartTooltipIndex}
          isDesktop={isDesktop}
          report={report}
          removals={removals}
          sortBy={view.sortBy}
          sortDesc={view.sortDesc}
          pointSample={pointSample}
          forecastTimes={forecastTimes}
          playbackIndex={playbackIndex}
          timelineAxes={timelineAxes}
          movePlayheadTo={movePlayheadTo}
          fire={fire}
          closure={closure}
          modelId={analyzed?.forecastModel ?? forecastModel}
        />
      </div>
      </div>
    </div>
  )
}
