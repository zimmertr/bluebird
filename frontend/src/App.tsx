import {
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
import { useResultsLayout } from './hooks/useResultsLayout'
import { useChartCompare } from './hooks/useChartCompare'
import { useTableView } from './hooks/useTableView'
import { useUrlSync } from './hooks/useUrlSync'
import { useFireProximity } from './hooks/useFireProximity'
import { useGridLayer } from './hooks/useGridLayer'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import {
  DestinationResult,
} from './types'
import {
  LAYER,
  SURFACE_PAGE,
} from './styles'
import {
  decodeState,
  decodeAutoAnalyze,
} from './utils/urlState'
import { isPointSample } from './utils/forecastWindow'
import {
  panelCommitCues,
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

  // A link that asks to run its analysis on open (`analyze=1`, #511). Read once
  // at mount like the rest of the link, and cleared the moment it fires, so
  // nothing but this first load can act on it. The URL writer below is what
  // takes it out of the address bar, and it can never put it back:
  // `encodeState` cannot write it.
  const [autoAnalyze, setAutoAnalyze] = useState(() => decodeAutoAnalyze(window.location.search))
  // One commit behind `caps.settled` on purpose. The render where the live
  // limits land is the render where the hooks above re-clamp the restored
  // model and results cap, in effects whose state reaches the NEXT render. A
  // run fired in that first commit would read the pre-clamp values; this flag
  // is set by an effect in the same commit, so it rises in the render that
  // holds the clamped ones.
  const [capsApplied, setCapsApplied] = useState(false)
  useEffect(() => {
    if (caps.settled) setCapsApplied(true)
  }, [caps.settled])

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

  // ── The map timeline (#121) ───────────────────────────────────────────────
  const timeline = useTimeline({ times: response?.times, analysisSeq, playerShown, showRadar })
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

  // What the displayed report is rendered under: markers, legend, results
  // header, and table column order all read from here.
  //
  // With a field held, the panel's ranking IS the displayed ranking — the rows
  // below are re-derived from it on every change, so reading the snapshot here
  // would show a legend that disagreed with the table. The window stays
  // from the snapshot either way: it is a data knob, and a point sample cannot
  // become a range without a new analysis. Before the first analysis there is
  // no field and nothing to disagree with.
  const view =
    analyzed !== null
      ? { sortBy, sortDesc, kind: analyzed.kind, window: analyzed.window }
      : {
          sortBy,
          sortDesc,
          kind: selection.kind,
          window: panelWindowMs,
        }
  // Whether the displayed report's aggregates are one value three times, which
  // is what collapses the table's columns and drops the aggregate from the
  // ranking's name. Counted off the analyzed window rather than read off a mode
  // name, so "a day narrowed to one hour" is recognized as the point sample it
  // is (#166).
  const pointSample = isPointSample(view.window.startMs, view.window.endMs)
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

  const report = usePresentedReport({
    universe,
    response,
    analyzed,
    analysisSeq,
    arriving,
    liveKnobs,
    view,
    pointSample,
    removedKeys,
    activeRemovedKeys,
    places,
    csvRows,
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
  const fire = useFireProximity(fireField ?? universe ?? results, fireSeq)

  // Stable identities for the table's callbacks, for the reason `NO_TIMES`
  // exists: an inline arrow is a new prop on every render.
  const handleRemovePending = useCallback(
    (d: { latitude: number; longitude: number }) => removePlace(d.latitude, d.longitude),
    [removePlace],
  )
  const handleFocusResult = useCallback(
    (row: DestinationResult) => mapRef.current?.focusResult(row),
    [],
  )
  const handleFocusPending = useCallback(
    (at: { latitude: number; longitude: number }) => mapRef.current?.focusPoint(at),
    [],
  )

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

  // The link's run on open: the click, plus making sure the address bar no
  // longer carries the flag, so a reload is an ordinary restore rather than a
  // second spend. The flush is the whole strip. `encodeState` never writes the
  // param, so while the address bar still carries it the URL sync effect above
  // can never find it current: a write without it is either already done or
  // still queued, and flushing lands a queued one now instead of up to a
  // debounce later. Going through the
  // writer rather than a history call of its own also keeps any edit already
  // queued, which a direct write of the stripped address would overwrite.
  function runAutoAnalyze() {
    setAutoAnalyze(false)
    writeUrl.flush()
    void handleAnalyze()
  }

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

  // A report stays on screen even when the knobs admit none of it. Collapsing
  // the panels would answer "why is nothing listed?" by removing the place the
  // answer goes, and the table's own empty row says which of the three reasons
  // it is.
  const showTable = showResults && (response !== null || pending.length > 0)

  // Space below the map that a resize must leave alone: the preview banner (when
  // present) sits above the map, so the map + chart + table share the rest.
  const bannerPx = preview.enabled ? 32 : 0
  const layout = useResultsLayout({
    modeChosen: storedView.modeChosen,
    isDesktop,
    bannerPx,
    showTable,
    response,
    analysisSeq,
  })
  const {
    isDragging,
    chartShowing,
  } = layout

  // ── The comparison chart (#232) ───────────────────────────────────────────
  const charts = useChartCompare({
    results,
    pending,
    sortBy: view.sortBy,
    analyzed,
    analysisSeq,
    models: caps.forecastModels,
    forecastModel,
    comparedModels,
    times: forecastTimes,
    windowLimits: caps.windowLimits,
    chartShowing,
  })
  const {
    compare,
    pendingRows,
    comparingRows,
  } = charts

  // ── The table's shape and its file ──────────────────────────────────────────
  const tableView = useTableView({
    storedView,
    results,
    detailSort,
    sortBy: view.sortBy,
    pointSample,
    analyzed,
    models: caps.forecastModels,
    forecastModel,
    comparingRows,
    shownModels: compare.shown,
    compareResults: compare.results,
    compareReachEnds: compare.reachEnds,
    pending,
    pendingRows,
    fire,
  })

  return (
    <div className={`flex flex-col h-dvh w-screen overflow-hidden ${SURFACE_PAGE}`}>
      {preview.enabled && <PreviewBanner pr={preview.pr} commit={preview.commit} />}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
      {showWelcome && <WelcomeModal onDismiss={dismissWelcome} />}
      {isDragging && (
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
        response={response}
        results={results}
        fireStatus={fire.status}
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
          modelId={analyzed?.forecastModel ?? forecastModel}
          showResults={showResults}
          sidebarOpen={sidebarOpen}
          onOpenControls={openDrawer}
          searchPointed={searchPointed}
          poisPointed={poisPointed}
        />

        <ResultsSheet
          showTable={showTable}
          showResults={showResults}
          isDesktop={isDesktop}
          layout={layout}
          report={report}
          charts={charts}
          tableView={tableView}
          removals={removals}
          sortBy={view.sortBy}
          sortDesc={view.sortDesc}
          pointSample={pointSample}
          forecastTimes={forecastTimes}
          playbackIndex={playbackIndex}
          timelineAxes={timelineAxes}
          movePlayheadTo={movePlayheadTo}
          fire={fire}
          modelId={analyzed?.forecastModel ?? forecastModel}
          onRemovePending={handleRemovePending}
          onFocusResult={handleFocusResult}
          onFocusPending={handleFocusPending}
        />
      </div>
      </div>
    </div>
  )
}
