import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { MapViewHandle } from './components/MapView'
import AppDrawer from './components/AppDrawer'
import SkipLink from './components/SkipLink'
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
// The same for the rows waiting on an elevation: one empty set, so the
// memoized table sees no change between renders where nothing waits.
const NO_WAITING: ReadonlySet<string> = new Set()
import { useTour } from './tour/useTour'
import { TUTORIAL_PATH } from './utils/tourSteps'
import PreviewBanner from './components/PreviewBanner'
import { useAnalyze } from './hooks/useAnalyze'
import { useElevationLookup } from './hooks/useElevationLookup'
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
import { useLayoutMotion } from './hooks/useLayoutMotion'
import { useClosePopupsOnCommit } from './hooks/useClosePopupsOnCommit'
import { useRunOnOpen } from './hooks/useRunOnOpen'
import { useUrlSync } from './hooks/useUrlSync'
import { useFireProximity } from './hooks/useFireProximity'
import { useClosureProximity } from './hooks/useClosureProximity'
import { useGridLayer } from './hooks/useGridLayer'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useTheme } from './hooks/useTheme'
import { useDrawer } from './hooks/useDrawer'
import { useSafeAreaBottom } from './hooks/useSafeAreaBottom'
import { controlsFullPx, controlsSheetPx } from './utils/resultsSheet'
import { useHeldSheetPx } from './hooks/useHeldSheetPx'
import {
  LAYER,
  SURFACE_PAGE,
} from './styles'
import {
  decodeState,
} from './utils/urlState'
import { removalScopeFor } from './utils/analyzeRequest'
import { controlsSummary } from './utils/controlsSummary'
import { pendingDestinations } from './utils/customList'
import { actionWord, retryStands } from './utils/analyzeGate'
import { usePanelMessages } from './hooks/usePanelMessages'
import { checkNoticeDue } from './utils/fireProximity'
import {
  panelCommitCues,
  reportView,
} from './utils/present'
import {
  hasWelcomed,
  readViewPrefs,
  setWelcomed,
} from './utils/viewPrefs'

// The main landmark's id, which the skip link moves the keyboard to.
const MAIN_ID = 'main'

export default function App() {
  const mapRef = useRef<MapViewHandle>(null)

  // Live limits from /api/capabilities: the analysis cap gates the client-side
  // paths and the results knob's ceiling, so a server recalibration reaches
  // the UI without a frontend release. Read before the state block below
  // because the restored limit is clamped against it on the way in.
  const caps = useCapabilities()

  // Restore any prior session encoded in the URL once, at mount. Feeding each
  // useState a lazy initializer avoids a redraw flash — the restored values are
  // the initial render, not a post-mount setState. The caps a pasted list and
  // a ring are read against are the hook's values at mount, which are its
  // fallbacks until /api/capabilities answers: both have to be bounded before
  // they enter state, and each fallback is the backend's own cap, held in
  // lockstep by `mirrored_constants.json`.
  const restoredRef = useRef(
    decodeState(window.location.search, {
      maxDestinations: caps.maxDestinations,
      maxPolygonPoints: caps.maxPolygonPoints,
    }),
  )
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
  const isDesktop = useIsDesktop()
  const { theme, toggleTheme } = useTheme()
  // The controls panel is docked on desktop and the Controls sheet on phones
  // (record 0141). It starts open on a desktop and closed on a phone
  // (`useDrawer`, #696); a close button collapses it to widen the map.
  const { sidebarOpen, setSidebarOpen, closeDrawer, openDrawer } = useDrawer(isDesktop)
  // A phone's Controls sheet under a drag on its grip (record 0146): the height
  // the drag left it at, or null for its own share of the map.
  const [controlsHeldPx, setControlsHeldPx] = useHeldSheetPx(sidebarOpen)
  // A phone's home indicator band, which the chrome on the map's foot stands
  // above (record 0145); 0 on a desk.
  const safeBottomPx = useSafeAreaBottom()
  // The panel's Map group is hovered, so the map's search box — a control
  // the panel names but does not contain — wears a ring.
  const [searchPointed, setSearchPointed] = useState(false)
  // The same hover glows every clickable feature on the map: the Map group
  // covers both map-borne methods, so its cue lights both controls at once.
  const [poisPointed, setPoisPointed] = useState(false)
  // The basemap style is failing to load: the map reports it and the panel's
  // messages say so (#580).
  const [basemapFailed, setBasemapFailed] = useState(false)
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
  const tour = useTour({
    isDesktop,
    sidebarOpen,
    setSidebarOpen,
    mapRef,
    tourLayer: { shown: overlays.showWildfires, show: overlays.setShowWildfires },
  })
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
    dismissEvent,
    reset,
    analyzed,
    failedView,
    analysisSeq,
    discardSeq,
    fireField,
    fireSeq,
    pendingHeights,
    pendingField,
    placeHeld,
    loading,
    arriving,
    error,
    refusal,
    response,
    universe,
  } = analysis
  // The elevation lookup for the coordinates box, run as soon as the box
  // holds rows (#673): usually done before Analyze is pressed, and an answer
  // that lands after a report is placed on it.
  const elevations = useElevationLookup({ csvRows, places, cap: caps.maxDestinations, onPlaced: placeHeld })
  // The committed rows whose height-read cells tick: waiting on an elevation
  // the lookup still means to answer. A row the lookup has given up on stops
  // ticking and reads blank, and a row placed is no longer waiting.
  const waitingHeights = useMemo(() => {
    if (!pendingHeights.size || !elevations.inquiring.size) return NO_WAITING
    const both = new Set<string>()
    pendingHeights.forEach((k) => {
      if (elevations.inquiring.has(k)) both.add(k)
    })
    return both.size ? both : NO_WAITING
  }, [pendingHeights, elevations.inquiring])

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
    arriving,
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
    identity: elevations.identity,
    found: pendingField,
    restoredTableSort: restored?.tableSort ?? null,
  })
  const {
    results,
    detailSort,
    tableSort,
    pending,
    customPendingCount,
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
  // map overlay toggle, which it reads only to ask a failed check again when
  // the layer comes on. Empty (no ⚠️) when best-effort NIFC data is unavailable.
  // Fed the candidate field useAnalyze publishes at discovery, so the NIFC
  // lookup overlaps the weather fetch instead of following it; the committed
  // universe answers when no candidate field exists (a failed run, the server
  // path), and the displayed rows when there is no universe either. Live
  // knobs re-present rows without re-querying NIFC. (Called here, above the
  // table view, because the wildfire column sorts and renders out of its
  // maps.)
  const checkField = fireField ?? universe ?? (demo ? NO_ROWS : results)
  const fire = useFireProximity(checkField, fireSeq, showWildfires)
  // Flags destinations inside an active Forest Service area closure (#550):
  // the Closure column's check, on the fire check's field and sequence,
  // because both are one lookup per analysis over the same candidates.
  const closure = useClosureProximity(checkField, fireSeq, showAreaClosures)

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
    // The reader's own rows only: a ring's found rows are pending too, but
    // they are what the last run found rather than an input it never saw.
    pendingCount: customPendingCount,
    sortBy,
    constraints,
  })

  // What the Analyze button reads (#736), on the panel and on a phone's map
  // alike: `Try again` while the last run's failure stands and the panel still
  // describes the request that failed, read against that run's snapshot the
  // way the cues above read against the report's. Destinations are counted
  // against the failed run's own list, since the committed report's `pending`
  // describes a different question.
  const panelForRetry = {
    selectionKind: selection.kind,
    windowMs: panelWindowMs,
    forecastModel,
    comparedModels,
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    pendingCount: failedView
      ? pendingDestinations(csvRows, places, failedView.customKeys, activeRemovedKeys, elevations.identity).length
      : 0,
    sortBy,
    constraints,
  }
  const word = actionWord(loading, retryStands(error, failedView, panelForRetry))

  const { handleAnalyze } = useAnalyzeCommand({
    selection,
    polygon,
    drawPointCount,
    mapRef,
    destinationTypes,
    includeUnnamedPeaks,
    csvRows,
    places,
    identity: elevations,
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

  // The panel's messages and the Analyze gate, derived once for both widths
  // (record 0208): the panel's Analyze and the phone's read one gate from
  // one set of inputs, and the badge on either counts the same list.
  const messages = usePanelMessages({
    selection,
    windowWarning: forecastSelection.windowWarning,
    modelClamped: forecastSelection.modelClamped,
    forecastModel,
    comparedModels,
    forecastModels: caps.forecastModels,
    polygonAreaKm2: destinationInputs.polygonAreaKm2,
    maxAreaKm2: caps.maxPolygonAreaKm2,
    drawPointCount,
    drawing,
    destinationTypes,
    hasCustom: csvRows.length > 0,
    hasPins: places.length > 0,
    sortBy,
    loading,
    error,
    refusal,
    commitReasons,
    hasReport: response !== null,
    aqiAllNull: response !== null && results.length > 0 && results.every((r) => r.aqi_avg == null),
    wildfireCheckFailed: checkNoticeDue(fire.status, showWildfires, results.length),
    closureCheckFailed: checkNoticeDue(closure.status, showAreaClosures, results.length),
    basemapFailed,
    archiveDays: caps.archiveDays,
    aqiForecastDays: caps.aqiForecastDays,
    windowLimits: caps.windowLimits,
    dismissEvent,
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

  // A committed report closes every popup the last one left open (#577), and
  // so does a run put back after its partial rows showed (#560).
  useClosePopupsOnCommit(analysisSeq, mapRef, discardSeq)

  // Space below the map that a resize must leave alone: the preview banner (when
  // present) sits above the map, so the map + chart + table share the rest.
  const bannerPx = preview.enabled ? 32 : 0
  // The results sheet's view: its layout, the comparison chart, the table's
  // shape and file, and the table's callbacks (useResultsView).
  const resultsView = useResultsView({
    showResults: showResults || demo !== null,
    collapsedOverride: tour.sheetCollapsed,
    restView: tour.sheetView,
    fullOverride: tour.sheetFull,
    response: shownResponse,
    results,
    pending,
    detailSort,
    storedView,
    isDesktop,
    bannerPx,
    playerOn: playerShown,
    safeBottomPx,
    analysisSeq,
    arriving,
    sortBy: view.sortBy,
    sortDesc: view.sortDesc,
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
  // Which edge of a desk's layout is moving, so the map and the results
  // hold one size while it moves (record 0202).
  const { motion: layoutMotion, onTransitionEnd: onLayoutMoved } = useLayoutMotion({
    isDesktop,
    open: sidebarOpen,
    mode: layout.resultsMode,
    collapsed: layout.resultsCollapsed,
  })

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
      <SkipLink targetId={MAIN_ID} />
      {preview.enabled && <PreviewBanner pr={preview.pr} commit={preview.commit} />}
      <div className="flex flex-1 overflow-hidden min-h-0 relative" onTransitionEnd={onLayoutMoved}>
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
        isDesktop={isDesktop}
        sheetPx={controlsHeldPx ?? controlsSheetPx(layout.mapPx)}
        sheetRestPx={controlsSheetPx(layout.mapPx)}
        sheetFullPx={controlsFullPx(layout.mapPx)}
        onSheetPx={setControlsHeldPx}
        onClose={closeDrawer}
        tourRuns={tour.index !== null}
        theme={theme}
        onToggleTheme={toggleTheme}
        drawMode={drawMode}
        destinationInputs={destinationInputs}
        forecastSelection={forecastSelection}
        rankingKnobs={rankingKnobs}
        caps={caps}
        mapRef={mapRef}
        onPointAtSearch={setSearchPointed}
        onPointAtMapPois={setPoisPointed}
        messages={messages}
        onAnalyze={handleAnalyze}
        autoAnalyze={autoAnalyze}
        capabilitiesSettled={capsApplied}
        onAutoAnalyze={runAutoAnalyze}
        actionWord={word}
        onTutorial={tour.start}
        tutorialWaits={tourWaits}
      />

      {/* Map + results column. On a phone the results leave the flow and stand
          on the map as a sheet, so the column is what positions them; on
          desktop nothing is positioned and the class list is the one it was. */}
      {/* The page's main landmark (#576): the map and the report are what the
          page is for, and a screen reader's landmark list had nothing to jump
          to past the panel. */}
      <main
        id={MAIN_ID}
        // Focusable by script alone, for the skip link, and drawing no ring:
        // the landmark is where the keyboard lands, not a control.
        tabIndex={-1}
        className={`flex-1 flex flex-col overflow-hidden min-w-0 focus:outline-none${isDesktop ? '' : ' relative'}`}
      >
        <MapStage
          mapRef={mapRef}
          drawMode={drawMode}
          isDesktop={isDesktop}
          destinationInputs={destinationInputs}
          removals={removals}
          overlays={overlays}
          coverage={caps.coverage}
          grid={gridLayer}
          timeline={timeline}
          report={report}
          tableView={tableView}
          fire={fire}
          closure={closure}
          layout={layout}
          analysis={analysis}
          sortBy={view.sortBy}
          pointSample={pointSample}
          modelId={analyzed?.forecastModel ?? forecastModel}
          showResults={showResults}
          sidebarOpen={sidebarOpen}
          layoutMotion={layoutMotion}
          legendInitiallyOpen={storedView.legendOpen ?? true}
          onOpenControls={openDrawer}
          onCloseControls={closeDrawer}
          controlsSummary={controlsSummary(selection.kind, caps.forecastModels, forecastModel)}
          messages={messages}
          actionWord={word}
          onAnalyze={handleAnalyze}
          layersForcedOpen={tour.layersOpen}
          searchPointed={searchPointed}
          poisPointed={poisPointed}
          urlSync={urlSync}
          restoredView={restoredView}
          onBasemapFailed={setBasemapFailed}
          maxPolygonPoints={caps.maxPolygonPoints}
        />

        <ResultsSheet
          resultsView={resultsView}
          showResults={showResults || demo !== null}
          chartTooltipIndex={tour.chartTooltipIndex}
          isDesktop={isDesktop}
          report={report}
          removals={removals}
          analysisSeq={analysisSeq}
          sortBy={view.sortBy}
          sortDesc={view.sortDesc}
          pointSample={pointSample}
          forecastTimes={forecastTimes}
          playbackIndex={playbackIndex}
          timelineAxes={timelineAxes}
          movePlayheadTo={movePlayheadTo}
          fire={fire}
          closure={closure}
          pendingHeights={waitingHeights}
          modelId={analyzed?.forecastModel ?? forecastModel}
          layoutMotion={layoutMotion}
        />
      </main>
      </div>
    </div>
  )
}
