import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { MapViewHandle } from './components/MapView'
import AppDrawer from './components/AppDrawer'
import MapStage from './components/MapStage'
import ResultsSheet from './components/ResultsSheet'
import WelcomeModal from './components/WelcomeModal'
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
import { useGridLayer } from './hooks/useGridLayer'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useTour } from './hooks/useTour'
import {
  LAYER,
  SURFACE_PAGE,
} from './styles'
import {
  DEFAULT_LIMIT,
  decodeState,
} from './utils/urlState'
import { NO_CONSTRAINTS } from './utils/constraints'
import type { PresentationKnobs } from './utils/present'
import {
  panelCommitCues,
  reportView,
} from './utils/present'
import {
  hasWelcomed,
  readViewPrefs,
  setWelcomed,
} from './utils/viewPrefs'

// Hoisted, so the tutorial's demo hands the memoized surfaces the same empty
// value on every render rather than a fresh one.
const NO_KEYS: ReadonlySet<string> = new Set()
const NO_ROWS: never[] = []
const NO_REMOVED = new Map<string, never>()
const NO_MODELS: readonly string[] = []
const NO_REASONS: ReturnType<typeof panelCommitCues> = []
// The demo's own report counter. Negative, so it can never equal one of the
// reader's, and constant, so the surfaces that reset per report reset once as
// the demo arrives and once as it leaves.
const TOUR_SEQ = -1

export default function App() {
  const mapRef = useRef<MapViewHandle>(null)

  // Live limits from /api/capabilities: the analysis cap gates the client-side
  // paths and the results knob's ceiling, so a server recalibration reaches
  // the UI without a frontend release. Read before the state block below
  // because the restored limit is clamped against it on the way in.
  const caps = useCapabilities()

  // The tutorial (#536). While its demo analysis is on screen, `scene` is what
  // the table, the chart, the markers and the timeline read in place of the
  // reader's own report; nothing of the reader's is written, so ending it
  // puts every one of them back.
  const tour = useTour({ mapRef, windowLimits: caps.windowLimits })
  const { scene } = tour

  // Restore any prior session encoded in the URL once, at mount. Feeding each
  // useState a lazy initializer avoids a redraw flash — the restored values are
  // the initial render, not a post-mount setState.
  const restoredRef = useRef(decodeState(window.location.search))
  const restored = restoredRef.current

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
  const [showWelcome, setShowWelcome] = useState(() => !hasWelcomed())
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
    drawPointCount,
    finishDrawing,
  } = drawMode

  function dismissWelcome() {
    setWelcomed()
    setShowWelcome(false)
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

  // What the report's display surfaces read: the tutorial's demo while it is
  // on screen, the reader's own report otherwise. The grid, the wildfire check,
  // the removals, the Analyze command and the address bar keep the reader's,
  // so the tutorial fetches nothing and writes nothing.
  const shownResponse = scene ? scene.response : response
  const shownUniverse = scene ? scene.universe : universe
  const shownAnalyzed = scene ? scene.analyzed : analyzed
  const shownSeq = scene ? TOUR_SEQ : analysisSeq
  const shownArriving = scene ? false : arriving

  // ── The map timeline (#121) ───────────────────────────────────────────────
  // The demo shows the player whatever the reader's Layers switch says, and
  // says so here rather than through the switch, which is a stored choice.
  const timeline = useTimeline({
    times: shownResponse?.times,
    analysisSeq: shownSeq,
    playerShown: scene !== null || playerShown,
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

  const removals = useRemovals({ places, addPlace, removePlace, destinationScope, csvRows, universe, response })
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

  // The address bar mirrors the panel and the map's layers (useUrlSync).
  const writeUrl = useUrlSync({
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
    showRadar,
    showSmoke,
    showSnow,
    showGrid,
    showPlayer,
    gridStyle,
    gridReachFrac,
    places,
    defaultForecastModel: caps.defaultForecastModel,
  })

  // The demo ranks by the reader's own sort, but under no bound and at the
  // default cap, since a bound the reader set for their own field could empty
  // the demo's table before it is explained.
  const tourKnobs: PresentationKnobs = useMemo(
    () => ({ sortBy, sortDesc, limit: DEFAULT_LIMIT, constraints: NO_CONSTRAINTS }),
    [sortBy, sortDesc],
  )
  const report = usePresentedReport({
    universe: shownUniverse,
    response: shownResponse,
    analyzed: shownAnalyzed,
    analysisSeq: shownSeq,
    arriving: shownArriving,
    liveKnobs: scene ? tourKnobs : liveKnobs,
    view,
    pointSample,
    removedKeys: scene ? NO_KEYS : removedKeys,
    activeRemovedKeys: scene ? NO_KEYS : activeRemovedKeys,
    places: scene ? NO_ROWS : places,
    csvRows: scene ? NO_ROWS : csvRows,
  })
  const {
    results,
    detailSort,
    pending,
  } = report

  // Flags destinations within 10 mi of an active US wildfire; independent of the
  // map overlay toggle. Empty (no ⚠️) when best-effort NIFC data is unavailable.
  // Fed the candidate field useAnalyze publishes at discovery, so the NIFC
  // lookup overlaps the weather fetch instead of following it; the committed
  // universe answers when no candidate field exists (a failed run, the server
  // path), and the displayed rows when there is no universe either. Live
  // knobs re-present rows without re-querying NIFC. (Called here, above the
  // table view, because the wildfire column sorts and renders out of its
  // maps.)
  // The demo's rows are never the fallback: checking them would be a NIFC
  // lookup the reader did not ask for.
  const fireFallback: { latitude: number; longitude: number }[] = scene ? NO_ROWS : results
  const fire = useFireProximity(fireField ?? universe ?? fireFallback, fireSeq)

  // Every knob that has stopped being live, and why. Empty while everything
  // applies instantly, which is the normal case: the cues exist so the
  // controls never feel dead.
  const commitReasons = scene ? NO_REASONS : panelCommitCues(analyzed, {
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

  // Space below the map that a resize must leave alone: the preview banner (when
  // present) sits above the map, so the map + chart + table share the rest.
  const bannerPx = preview.enabled ? 32 : 0
  // The results sheet's view: its layout, the comparison chart, the table's
  // shape and file, and the table's callbacks (useResultsView).
  const resultsView = useResultsView({
    showResults,
    response: shownResponse,
    results,
    pending,
    detailSort,
    storedView,
    isDesktop,
    bannerPx,
    analysisSeq: shownSeq,
    sortBy: view.sortBy,
    pointSample,
    analyzed: shownAnalyzed,
    models: caps.forecastModels,
    forecastModel: scene ? scene.analyzed.forecastModel : forecastModel,
    comparedModels: scene ? NO_MODELS : comparedModels,
    times: forecastTimes,
    windowLimits: caps.windowLimits,
    fire,
    mapRef,
    removePlace,
  })
  const { layout, tableView } = resultsView
  // The screen state the tutorial moves and puts back, read when a step moves.
  // Kept current in a layout effect rather than written during the render.
  const { uiRef: tourUi } = tour
  const { resultsCollapsed, toggleCollapsed } = layout
  useLayoutEffect(() => {
    tourUi.current = { isDesktop, sidebarOpen, setSidebarOpen, showResults, setShowResults, resultsCollapsed, toggleCollapsed }
  }, [tourUi, isDesktop, sidebarOpen, showResults, resultsCollapsed, toggleCollapsed])
  // The Removed picker lists the reader's removals, which have no row in the
  // demo.
  const shownRemovals = useMemo(() => (scene ? { ...removals, removed: NO_REMOVED } : removals), [scene, removals])
  const modelId = shownAnalyzed?.forecastModel ?? forecastModel
  // Started from the welcome dialog or the panel's footer, never by itself.
  // The welcome dialog closes first: it sits inside the app root, which the
  // tutorial makes inert.
  const { start: startTour } = tour
  const startTutorial = useCallback(() => {
    if (showWelcome) {
      setWelcomed()
      setShowWelcome(false)
    }
    void startTour()
  }, [showWelcome, startTour])

  return (
    <div inert={tour.active} className={`flex flex-col h-dvh w-screen overflow-hidden ${SURFACE_PAGE}`}>
      {preview.enabled && <PreviewBanner pr={preview.pr} commit={preview.commit} />}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
      {showWelcome && <WelcomeModal onDismiss={dismissWelcome} onStartTour={startTutorial} />}
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
        response={shownResponse}
        results={results}
        fireStatus={fire.status}
        onStartTour={startTutorial}
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
          layout={layout}
          analysis={analysis}
          sortBy={view.sortBy}
          modelId={modelId}
          showResults={showResults}
          sidebarOpen={sidebarOpen}
          onOpenControls={openDrawer}
          searchPointed={searchPointed}
          poisPointed={poisPointed}
        />

        <ResultsSheet
          resultsView={resultsView}
          showResults={showResults}
          isDesktop={isDesktop}
          report={report}
          removals={shownRemovals}
          sortBy={view.sortBy}
          sortDesc={view.sortDesc}
          pointSample={pointSample}
          forecastTimes={forecastTimes}
          playbackIndex={playbackIndex}
          timelineAxes={timelineAxes}
          movePlayheadTo={movePlayheadTo}
          fire={fire}
          modelId={modelId}
        />
      </div>
      </div>
    </div>
  )
}
