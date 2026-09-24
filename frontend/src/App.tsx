import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import MapView, { MapViewHandle } from './components/MapView'
import ControlPanel from './components/ControlPanel'
import type { SearchBoxHandle } from './components/SearchBox'
import ResultsTable from './components/ResultsTable'
import ColumnsPicker from './components/ColumnsPicker'
import ModelsPicker from './components/ModelsPicker'
import RemovedPicker from './components/RemovedPicker'
import ResizeGrip from './components/ResizeGrip'
import WelcomeModal from './components/WelcomeModal'
import PreviewBanner from './components/PreviewBanner'
import TimelineTransport from './components/TimelineTransport'
import AnalysisOverlay from './components/AnalysisOverlay'
import LayersPopover from './components/LayersPopover'
import MapButtonColumn from './components/MapButtonColumn'
import MapLegend from './components/MapLegend'
import ModelCompare from './components/ModelCompare'
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
import { useFireProximity } from './hooks/useFireProximity'
import { useGridLayer } from './hooks/useGridLayer'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import {
  DestinationResult,
} from './types'
import {
  IconChart,
  IconChartTable,
  IconChevron,
  IconClose,
  IconTable,
} from './components/icons'
import {
  ACCENT,
  CAPTION_LIFTED,
  DISABLED,
  FOCUS_RING,
  ICON_ACTION,
  ICON_BUTTON,
  LAYER,
  LINK,
  MAP_EDGE,
  MUTED,
  RADIUS,
  SEGMENT_FLUID,
  CONTROL_SIZE,
  STATUS,
  SEGMENT_DIVIDER,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SURFACE_DIVIDER,
  SURFACE_PAGE,
  SURFACE_SHEET,
  TAP,
  TEXT,
} from './styles'
import {
  NOUN,
  familyOf,
  rankedNoun,
} from './metrics'
import { hourlyScale, rankedScale } from './utils/colors'
import {
  TRANSPORT_GAP_PX,
} from './utils/resultsSheet'
import { composeOverlay } from './utils/analyzeOverlay'
import { Place } from './utils/geocode'
import {
  encodeState,
  decodeState,
  decodeAutoAnalyze,
} from './utils/urlState'
import { UrlWriter, debounceUrlWrite, urlNeedsSync } from './utils/urlSync'
import { isPointSample } from './utils/forecastWindow'
import {
  fieldHasValue,
  panelCommitCues,
} from './utils/present'
import {
  hasWelcomed,
  readViewPrefs,
  setWelcomed,
} from './utils/viewPrefs'

// Lazy, because `recharts` is the one large library the first screen does not
// need: the map mounts before any chart exists, and a reader who never opens
// one paid for it anyway. The fallback is `null` on purpose — the chart panel
// already reserves its height, so an empty box is what the reader would see
// during the fetch either way, and a word there would be a new string for a
// wait measured in a hundred milliseconds off an already warm connection.
const TimeSeriesChart = lazy(() => import('./components/TimeSeriesChart'))

// What the chart draws for its rows while a model comparison is up: nothing,
// because the comparison composes every line itself. A module constant so the
// chart's line memo is not rebuilt by a fresh empty array on every render.
const NO_CHART_ROWS: DestinationResult[] = []

export default function App() {
  const mapRef = useRef<MapViewHandle>(null)
  const searchBoxRef = useRef<SearchBoxHandle>(null)
  const columnsButtonRef = useRef<HTMLButtonElement>(null)
  const modelsButtonRef = useRef<HTMLButtonElement>(null)
  const removedButtonRef = useRef<HTMLButtonElement>(null)

  // One debouncer for the whole component lifetime. It has to outlive the URL
  // sync effect below: a timer owned by that effect would be torn down on every
  // dependency change, which is every keystroke, so the burst it exists to
  // collapse would write anyway.
  const urlWriterRef = useRef<UrlWriter | null>(null)
  if (urlWriterRef.current === null) {
    urlWriterRef.current = debounceUrlWrite((url) => window.history.replaceState(null, '', url))
  }
  const writeUrl = urlWriterRef.current

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

  const {
    restoredPoints,
    polygon,
    setPolygon,
    polygonAreaKm2,
    destinationTypes,
    setDestinationTypes,
    includeUnnamedPeaks,
    setIncludeUnnamedPeaks,
    customCsv,
    setCustomCsv,
    csvRows,
    destinationScope,
    places,
    addPlace,
    removePlace,
    destinationNamed,
  } = useDestinationInputs(restored)
  const {
    selection,
    changeSelection,
    forecastModel,
    changeForecastModel,
    comparedModels,
    setComparedModels,
    modelClamped,
    panelWindowMs,
    panelPointSample,
    windowWarning,
    forgetPreClamp,
  } = useForecastSelection(restored, caps)
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
    liveKnobs,
  } = useRankingKnobs(restored, caps.maxLimit)

  const [showResults, setShowResults] = useState(false)
  // Every stored view preference comes out of one read, held for the mount:
  // several initializers each parsing the same stored string is what
  // `viewPrefs.ts` exists to stop. The results layout takes the mode; the
  // table takes the rest.
  const storedView = useMemo(readViewPrefs, [])
  // Column picker popover open/closed
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [removedOpen, setRemovedOpen] = useState(false)
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
  const {
    drawing,
    drawPointCount,
    handleDrawUpdate,
    startDrawing,
    finishDrawing,
    handleCancelDrawing,
    handleClearDrawing,
  } = useDrawMode({
    mapRef,
    polygon,
    restoredPolygon: restored?.polygon,
    isDesktop,
    closeDrawer,
  })

  function dismissWelcome() {
    setWelcomed()
    setShowWelcome(false)
  }

  const {
    analyze,
    cancel,
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
    statusMessage,
    progress,
    paceRemainingS,
  } = useAnalyze(
    caps.maxDestinations,
    caps.forecastModels,
    caps.windowLimits,
    caps.aqiForecastDays,
  )

  // ── The map timeline (#121) ───────────────────────────────────────────────
  const {
    forecastTimes,
    timelineAxes,
    timelineAxis,
    setChosenAxis,
    playerOffered,
    radarIndex,
    frameIndex,
    frameCount,
    setFrameIndex,
    playing,
    setPlaying,
    playbackIndex,
    timelineReadout,
    timelineScale,
    movePlayheadTo,
  } = useTimeline({ times: response?.times, analysisSeq, playerShown, showRadar })

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
    grid,
  } = gridLayer

  const {
    removed,
    removedKeys,
    activeRemovedKeys,
    clearForScope: clearRemovalsForScope,
    registerPlace,
    removeResult: handleRemoveResult,
    restoreRemoved: handleRestoreRemoved,
    restoreAllRemoved: handleRestoreAllRemoved,
  } = useRemovals({ places, addPlace, removePlace, destinationScope, csvRows, universe, response })

  function handleSearchSelect(place: Place) {
    mapRef.current?.flyToPlace(place)
    registerPlace(place)
  }

  // A clicked basemap feature registers without a camera move: you are already
  // looking straight at it, and flying to it would answer a question nobody
  // asked.
  const handleAddPoi = useCallback(
    (place: Place) => {
      registerPlace(place)
    },
    [registerPlace],
  )
  const handleRemovePoi = useCallback(
    (latitude: number, longitude: number) => removePlace(latitude, longitude),
    [removePlace],
  )

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

  // Elapsed-time counter for phases with no countable progress (the OSM search,
  // and the pins-only refresh). Declared before the overlay composition, which
  // reads it to stage the "Still searching…" reassurance line.
  const [elapsed, setElapsed] = useState(0)

  // The loading overlay for the one ranked analysis — searched places ride
  // inside it as custom destinations, so there is no separate pin refresh to
  // fold in anymore.
  const overlay = composeOverlay({
    analyzeLoading: loading,
    statusMessage,
    elapsedS: elapsed,
    rankedProgress: progress ? { processed: progress.processed, total: progress.total } : null,
    // Live countdown while the client pacer sleeps off a quota deficit;
    // `usePacedFetch` ticks it, and the 250ms elapsed ticker below re-reads it.
    paceRemainingS,
  })

  useEffect(() => {
    if (!overlay.visible) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250)
    return () => clearInterval(id)
  }, [overlay.visible])

  // Live-sync all analysis inputs into the address bar so the URL is always
  // copy-pasteable. replaceState (not pushState) keeps the back button clean;
  // the map commits polygon edits only at discrete events (point add, drag
  // end, insert, delete — never mid-drag), so this can't thrash replaceState
  // past Safari's rate limit.
  //
  // A trailing debounce (~400ms) collapses bursts of edits (e.g. per-keystroke
  // customCsv changes) into a single write. The no-op guard skips replaceState
  // entirely when the URL is already current. On cleanup (unmount or re-run),
  // any pending write is flushed so the last state reaches the URL before the
  // component exits.
  useEffect(() => {
    const qs = encodeState({
      polygon,
      destinationTypes,
      includeUnnamedPeaks,
      selection,
      forecastModel,
      compareModels: comparedModels,
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
      pins: places,
    }, caps.defaultForecastModel)

    // Nothing to write, and just as importantly, drop anything already queued.
    // An edit that lands back on the state the address bar already shows must
    // not be followed a moment later by a write of a state it merely passed
    // through on the way.
    if (!urlNeedsSync(qs, window.location.pathname, window.location.search)) {
      writeUrl.cancel()
      return
    }

    writeUrl(qs ? `?${qs}` : window.location.pathname)
    // No cleanup here on purpose: flushing once per effect run would write on
    // every keystroke and collapse nothing, which is the trap debounceUrlWrite
    // documents. Unmount is handled by its own effect below.
    // Suppressed rather than fixed: the rule is right that `forecastModel` and
    // `caps.defaultForecastModel` are missing, and the bug that causes is
    // issue #292's to fix, not this file's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    selection,
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
    writeUrl,
  ])

  // Unmount is the one moment a queued write cannot wait out its delay, so it
  // is the one moment worth flushing. Empty deps keep it to unmount only: the
  // sync effect above must not flush, or the debounce collapses nothing.
  useEffect(() => () => writeUrl.flush(), [writeUrl])

  const {
    results,
    windowTitle,
    detailSort,
    sortDetail: handleDetailSort,
    pending,
    rowCount,
    emptyReason,
  } = usePresentedReport({
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


  // The bands the markers are actually colored on, which playback moves.
  // Precipitation is the reason it has to: the ranking bins a window total and
  // one hour of it is a rate, so a legend still reading in inches beside
  // markers scored in inches per hour would be quietly wrong. The metric's NAME
  // does not change, so the legend's title does not either.
  // Every metric has bands now, so this is null only if a ranking key ever
  // arrives without a scale. The key below has its own reason to stay away
  // (`fieldHasValue`): a box of bands over a field of N/A explains
  // nothing.
  const markerScale = playbackIndex !== null ? hourlyScale(view.sortBy) : rankedScale(view.sortBy)

  const hasColoredMarkers = showResults && results.length > 0
  // Whether the ranked metric has anything to colour AT ALL on the rows shown.
  // False for a freezing-level ranking under one of the five models that
  // publish no freezing level: every marker is then the neutral no-value fill,
  // every cell reads N/A, and a key of six height bands beside them would be
  // the only thing on screen claiming the field was measured.
  const rankedFieldHasValue = fieldHasValue(results, view.sortBy)
  // A report stays on screen even when the knobs admit none of it. Collapsing
  // the panels would answer "why is nothing listed?" by removing the place the
  // answer goes, and the table's own empty row says which of the three reasons
  // it is.
  const showTable = showResults && (response !== null || pending.length > 0)

  // Space below the map that a resize must leave alone: the preview banner (when
  // present) sits above the map, so the map + chart + table share the rest.
  const bannerPx = preview.enabled ? 32 : 0
  const {
    sheetRef,
    isDragging,
    resultsCollapsed,
    toggleCollapsed,
    resultsMode,
    chooseResultsMode,
    bothHasRoom,
    chartShowing,
    chartPanelPx,
    tablePanelPx,
    sheetLiftPx,
    mapCornerLift,
    cameraPadBottomPx,
    chartGrip,
    tableGrip,
  } = useResultsLayout({
    modeChosen: storedView.modeChosen,
    isDesktop,
    bannerPx,
    showTable,
    response,
    analysisSeq,
  })

  // ── The comparison chart (#232) ───────────────────────────────────────────
  const {
    chart,
    compare,
    pendingRows,
    selectedModelRows,
    hiddenModels,
    toggleHiddenModel,
    rowChartColor,
    comparingRows,
    compareWait,
  } = useChartCompare({
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

  // ── The table's shape and its file ──────────────────────────────────────────
  const {
    tableRows,
    tableColumns,
    allColumns,
    pickerVisibleKeys,
    tableColWidths,
    setTableColWidths,
    analysisModelLabel,
    partialNote,
    legend,
    handleColumnMove,
    handleVisibilityChange,
    handleDownloadCsv,
  } = useTableView({
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

      {/* Mobile: dim backdrop behind the open drawer */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className={`lg:hidden absolute inset-0 ${LAYER.scrim} bg-black/50`}
        />
      )}

      {/* Controls panel — docked on desktop when open, off-canvas otherwise.
          When closed it stays absolute + translated off-screen so it leaves the
          layout and the map fills the full width on every breakpoint. */}
      <aside
        className={`absolute inset-y-0 left-0 ${LAYER.drawer} w-[calc(100vw-2rem)] max-w-90 transform transition-transform duration-300 ease-in-out flex-shrink-0 bg-slate-800 flex flex-col overflow-hidden border-r ${SURFACE_DIVIDER} ${
          sidebarOpen
            ? 'translate-x-0 lg:static lg:z-10 lg:w-90 lg:max-w-none lg:transition-none'
            : '-translate-x-full'
        }`}
      >
        {/* Close button — collapses the panel on both mobile and desktop */}
        <button
          onClick={() => setSidebarOpen(false)}
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
          onPointAtSearch={setSearchPointed}
          wildfireCheckFailed={fire.status === 'unavailable' && results.length > 0}
          onPointAtMapPois={setPoisPointed}
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
          onAnalyze={handleAnalyze}
          autoAnalyze={autoAnalyze}
          capabilitiesSettled={capsApplied}
          onAutoAnalyze={runAutoAnalyze}
          onRetry={retry}
          resultCount={response ? results.length : undefined}
          // What the current bounds admit, not what the analysis fetched:
          // a bound applies live, so it has to move the "of M" or the count
          // describes a field the table no longer shows.
        />
      </aside>

      {/* Map + results column. On a phone the results leave the flow and stand
          on the map as a sheet, so the column is what positions them; on
          desktop nothing is positioned and the class list is the one it was. */}
      <div className={`flex-1 flex flex-col overflow-hidden min-w-0${isDesktop ? '' : ' relative'}`}>
        {/* `--map-corner-lift` and `--map-corner-band` are read by map.css:
            how far MapLibre's own bottom controls rise off the container's
            bottom edge, and the height of the band they are centred in. Both
            controls have a reason to rise: the attribution is a licence term
            that cannot be covered by the phone sheet, and the scale bar reads
            against the map rather than against the forecast player centred over
            the same edge. One number for the corner rather than an offset per
            control, derived beside every other anchor in `resultsSheet.ts`. The
            map area keeps the whole column, so the canvas runs on behind the
            sheet and its ResizeObserver sees no change on a drag. */}
        <div
          className={`flex-1 relative ${MAP_EDGE.publish}`}
          style={
            {
              '--map-corner-lift': `${mapCornerLift}px`,
              '--map-corner-band': `${TRANSPORT_GAP_PX}px`,
            } as React.CSSProperties
          }
        >
          <AnalysisOverlay overlay={overlay} elapsed={elapsed} onCancel={cancel} />
          <MapView
            ref={mapRef}
            drawing={drawing}
            pointedPois={poisPointed}
            polygon={polygon}
            restoredPoints={restoredPoints}
            onPolygonChange={setPolygon}
            onDrawUpdate={handleDrawUpdate}
            results={results}
            sortBy={view.sortBy}
            modelId={analyzed?.forecastModel ?? forecastModel}
            times={forecastTimes}
            popupColumns={tableColumns}
            modelFallbackLabel={analysisModelLabel}
            fireWarnings={fire.warnings}
            showWildfires={showWildfires}
            showRadar={showRadar}
            showSmoke={showSmoke}
            showSnow={showSnow}
            radarIndex={radarIndex}
            gridSpec={grid.spec}
            gridCells={grid.cells}
            gridStyle={gridStyle}
            playbackIndex={playbackIndex}
            pending={pending}
            searchedPlaces={places}
            onAddPoi={handleAddPoi}
            onRemovePoi={handleRemovePoi}
            cameraPadBottomPx={cameraPadBottomPx}
          />
      {/* The legends render BEFORE the button column below on purpose.
          Both are map chrome at the same layer, so paint order is DOM
          order, and the one that has to win is the one you can click:
          the Layers popover opens downward into exactly this space, and
          with the legends last it opened underneath them. Pushing the
          legends further down instead only moved the collision, since a
          popover is as tall as its contents. */}
          <MapLegend
            sortBy={view.sortBy}
            markerScale={markerScale}
            hasColoredMarkers={hasColoredMarkers}
            rankedFieldHasValue={rankedFieldHasValue}
            overlays={overlays}
            grid={gridLayer}
            sidebarOpen={sidebarOpen}
            sheetLiftPx={sheetLiftPx}
            timelineShown={timelineAxis !== null}
          />
          <MapButtonColumn
            searchBoxRef={searchBoxRef}
            onSearchSelect={handleSearchSelect}
            searchPointed={searchPointed}
            sidebarOpen={sidebarOpen}
            onOpenControls={() => setSidebarOpen(true)}
          >
            <LayersPopover overlays={overlays} grid={gridLayer} playerOffered={playerOffered} />
          </MapButtonColumn>
          {/* The timeline, present exactly while something spans time: radar
              contributes a past axis, a multi-hour report a forecast one, and
              a smoke analysis contributes neither (two passes a day is not an
              animation). */}
          {timelineAxis !== null && (
            <TimelineTransport
              axis={timelineAxis}
              axes={timelineAxes}
              onAxisChange={setChosenAxis}
              index={frameIndex}
              frameCount={frameCount}
              onIndexChange={(i) => setFrameIndex(i)}
              playing={playing}
              onPlayingChange={setPlaying}
              readout={timelineReadout}
              scale={timelineScale}
              forecastLabel={NOUN[familyOf(view.sortBy)]}
              liftPx={sheetLiftPx}
            />
          )}
        </div>

        {showTable && (
          // Docked below the map on desktop; on a phone the same results stand
          // on the map's bottom edge as a sheet, so the map keeps its full
          // height and its legends keep their room (#249). One surface either
          // way — only where it sits changes.
          <div
            ref={sheetRef}
            className={
              isDesktop
                ? 'flex flex-shrink-0 flex-col bg-slate-800'
                : `absolute inset-x-0 bottom-0 flex flex-col ${SURFACE_SHEET} ${LAYER.sheet}`
            }
          >
            {/* Shared header bar for all results views. A container query, not
                a viewport one: the bar's width is the viewport minus the docked
                sidebar, so a viewport breakpoint would fold it on a window that
                never changed size. Wide, everything sits on one line; narrow,
                it folds to exactly two — the title row (which keeps the
                collapse chevron) and the actions row — never a vertical stack
                (#242 review). The fold sits at the 896px container step;
                re-measure if a member joins or leaves. */}
            <div className={`@container flex-shrink-0 px-3 py-1.5 bg-slate-700 border-b border-slate-600`}>
              <div className="flex flex-col gap-1 @4xl:flex-row @4xl:items-center @4xl:gap-2">
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  {/* Before the first analysis the title is the same ranked
                      phrase the sidebar has selected, with a zero count —
                      "Lowest Total Precipitation (0 of 2)" — so the bar reads
                      the same before and after and the zero says nothing has
                      been ranked yet. The window timestamp joins once a
                      report exists (windowTitle below). */}
                  <span className={`${TEXT.subheading} min-w-0 truncate`}>
                    {`${view.sortDesc ? 'Highest' : 'Lowest'} ${rankedNoun(view.sortBy, pointSample)} (${
                      rowCount ?? `0 of ${pending.length}`
                    })`}
                  </span>
                  {windowTitle !== null && (
                    <span className={`${CAPTION_LIFTED} truncate`}>
                      {windowTitle}
                    </span>
                  )}
                  {/* The chevron rides the title row when the bar is folded so
                      collapsing never needs the second row; its wide twin sits
                      at the end of the actions row below. */}
                  <button
                    onClick={toggleCollapsed}
                    aria-label={resultsCollapsed ? 'Expand results' : 'Collapse results'}
                    className={`${ICON_BUTTON} ml-auto @4xl:hidden`}
                  >
                    <IconChevron up={resultsCollapsed} />
                  </button>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {/* Mode switch: table, chart, or both — fluid width, since
                      three icon-plus-label halves cannot fit the panel's
                      144px column (SEGMENT_FLUID exists because this shipped
                      clipped). */}
                  {showResults && (
                    <div className={SEGMENT_FLUID}>
                      <button
                        onClick={() => chooseResultsMode('table')}
                        className={`${SEGMENT_ITEM} ${resultsMode === 'table' ? ACCENT.fill : SEGMENT_IDLE}`}
                        aria-pressed={resultsMode === 'table'}
                        aria-label="Show table only"
                      >
                        <IconTable className="flex-shrink-0" />
                        <span className="hidden sm:inline">Table</span>
                      </button>
                      <div className={SEGMENT_DIVIDER} />
                      <button
                        onClick={() => chooseResultsMode('chart')}
                        className={`${SEGMENT_ITEM} ${resultsMode === 'chart' ? ACCENT.fill : SEGMENT_IDLE}`}
                        aria-pressed={resultsMode === 'chart'}
                        aria-label="Show chart only"
                      >
                        <IconChart className="flex-shrink-0" />
                        <span className="hidden sm:inline">Chart</span>
                      </button>
                      <div className={SEGMENT_DIVIDER} />
                      {/* Disabled rather than removed where the viewport
                          cannot hold two panels (#430): a member that comes
                          and goes moves the two beside it and has to be found
                          again, which is the same call Clear filters made. */}
                      <button
                        onClick={() => chooseResultsMode('both')}
                        disabled={!bothHasRoom}
                        className={`${SEGMENT_ITEM} ${DISABLED} ${resultsMode === 'both' ? ACCENT.fill : SEGMENT_IDLE}`}
                        aria-pressed={resultsMode === 'both'}
                        aria-label="Show chart and table"
                      >
                        <IconChartTable className="flex-shrink-0" />
                        <span className="hidden sm:inline">Both</span>
                      </button>
                    </div>
                  )}
                  {/* Columns button opens picker popover. Present from the
                      first pending row, not only once a report exists: the
                      bar keeping its full membership is what makes it read
                      as one control surface (#242 review).

                      This and the three beside it read at `TEXT.control`, the
                      size of every other control in the app. The micro step is
                      for text that is present but never first — a credit, a
                      timestamp, an overflow count — and these are buttons the
                      reader is meant to press. */}
                  {showTable && (
                    <button
                      ref={columnsButtonRef}
                      onClick={() => setColumnsOpen(!columnsOpen)}
                      aria-label="Choose which columns to display"
                      className={`${TEXT.control} ${LINK} cursor-pointer whitespace-nowrap`}
                    >
                      Columns
                    </button>
                  )}
                  {/* Which of the selected models the chart draws (#232). A
                      bar member rather than a control on the chart, for the
                      reason every other comparison control is in one place:
                      the chart is read, not operated. Standing, under exactly
                      the condition Columns stands under, because a bar that
                      gains and loses members is a bar a reader has to look for
                      (#242 review) — and the question it asks is about the
                      panel's selection, which does not wait on a fetch. */}
                  {showTable && (
                    <button
                      ref={modelsButtonRef}
                      onClick={() => setModelsOpen(!modelsOpen)}
                      className={`${TEXT.control} ${LINK} cursor-pointer whitespace-nowrap`}
                    >
                      Models
                    </button>
                  )}
                  {/* Removed rows (#241): a removal's only undo, so it is a
                      standing bar member rather than a transient toast —
                      removals persist across live knobs and refreshes, and so
                      does the way back. Hidden at zero: nothing to restore. */}
                  {removed.size > 0 && (
                    <button
                      ref={removedButtonRef}
                      onClick={() => setRemovedOpen(!removedOpen)}
                      aria-label={`Restore removed rows (${removed.size} removed)`}
                      className={`${TEXT.control} ${LINK} cursor-pointer whitespace-nowrap`}
                    >
                      Removed ({removed.size})
                    </button>
                  )}
                  {(results.length > 0 || pending.length > 0) && (
                    <button
                      onClick={handleDownloadCsv}
                      aria-label="Download these results as a CSV file"
                      className={`${TEXT.control} ${LINK} cursor-pointer whitespace-nowrap`}
                    >
                      Download CSV
                    </button>
                  )}
                  <a
                    href="https://open-meteo.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${TEXT.control} ${LINK} whitespace-nowrap`}
                  >
                    Open-Meteo.com
                  </a>
                  <button
                    onClick={toggleCollapsed}
                    aria-label={resultsCollapsed ? 'Expand results' : 'Collapse results'}
                    className={`${ICON_BUTTON} hidden @4xl:flex`}
                  >
                    <IconChevron up={resultsCollapsed} />
                  </button>
                </div>
              </div>
              {/* One line under the bar, never beside a control in it: the
                  wait is about the whole comparison, where every member of the
                  row above is about one thing the reader can press. */}
              {compareWait !== null && (
                <div className={`mt-1 ${CONTROL_SIZE} ${STATUS.warn}`}>{compareWait}</div>
              )}
            </div>
            {!resultsCollapsed && (
              <>
                {resultsMode !== 'table' && (
                  <>
                    <ResizeGrip
                      onReset={chartGrip.onReset}
                      onDragStart={chartGrip.onDragStart}
                      onDrag={chartGrip.onDrag}
                      onDragEnd={chartGrip.onDragEnd}
                    />
                    <div
                      className="flex min-h-0 flex-shrink-0 flex-col"
                      style={{ height: `${chartPanelPx}px` }}
                    >
                      <div className="min-h-0 flex-1">
                        <Suspense fallback={null}>
                          <TimeSeriesChart
                            times={forecastTimes}
                            // While a comparison is up every line on the chart is
                            // a (destination, model) pair, composed once by the
                            // hook so each one is named and coloured the same
                            // way; the chart has no plain destination rows to
                            // draw. With nothing compared it is the row list it
                            // has always been.
                            rows={compare.active ? NO_CHART_ROWS : chart.selectedRows}
                            metric={chart.metric}
                            onMetricChange={chart.setMetric}
                            colorFor={chart.colorFor}
                            playheadMs={playbackIndex !== null ? forecastTimes[playbackIndex] ?? null : null}
                            onPlayheadChange={
                              timelineAxes.includes('forecast') ? movePlayheadTo : undefined
                            }
                            extraLines={compare.lines}
                            modelEnds={compare.endLines}
                            controls={
                              compare.active ? (
                                <ModelCompare
                                  compared={compare.shown}
                                  paceRemainingS={compare.paceRemainingS}
                                />
                              ) : undefined
                            }
                          />
                        </Suspense>
                      </div>
                      {/* Chart-only legend. In Both mode the table's checkbox
                          column is the series picker and this would be a
                          second copy of it, so it exists exactly where that
                          column does not, and lists the rows that column
                          would. Each chip toggles its destination; the ×
                          is the same removal as the table row's and obeys the
                          same rules (searched places deregister, removals
                          survive live knobs). The NAME keeps a fixed budget
                          (max-w-44) and truncates; the model suffix beside it
                          never truncates, so a compared chip is wider by its
                          suffix. max-w-full keeps a chip inside the legend
                          row, so on a phone a wide chip wraps to its own row
                          and shrinks its name rather than overflowing. Two
                          chip rows at most — 26px chips + the 6px gap =
                          58px — then it scrolls. */}
                      {resultsMode === 'chart' && legend.length > 0 && (
                        <div className="flex-shrink-0 border-t border-slate-600 bg-slate-900/50 px-3 py-1.5">
                          <div className="results-scrollbars flex max-h-[58px] flex-wrap gap-1.5 overflow-y-auto">
                            {legend.map(({ key, row, suffix }) => {
                              const plotted = chart.isSelected(row)
                              return (
                                <span
                                  key={key}
                                  className={`inline-flex max-w-full items-center ${RADIUS.control} ${
                                    plotted ? 'bg-slate-700' : 'bg-slate-800/50'
                                  }`}
                                >
                                  <button
                                    onClick={() => chart.toggle(row)}
                                    aria-pressed={plotted}
                                    aria-label={`${plotted ? 'Hide' : 'Show'} ${row.name} on the chart`}
                                    className={`${TEXT.control} ${FOCUS_RING} inline-flex min-w-0 cursor-pointer items-center gap-1.5 py-1 pl-2 pr-1`}
                                  >
                                    <span
                                      className={`h-2 w-2 flex-shrink-0 ${RADIUS.pill} ${plotted ? '' : MUTED}`}
                                      style={{ backgroundColor: rowChartColor(row) }}
                                    />
                                    <span className={`flex min-w-0 ${plotted ? '' : MUTED}`}>
                                      <span className="min-w-0 max-w-44 truncate">{row.name}</span>
                                      {suffix && (
                                        <span className="flex-shrink-0 whitespace-pre">{suffix}</span>
                                      )}
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => handleRemoveResult(row)}
                                    aria-label={`Remove ${row.name}`}
                                    className={`${ICON_ACTION} ${FOCUS_RING} cursor-pointer py-1 pl-1 pr-2 leading-none`}
                                  >
                                    <IconClose size="chip" />
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {resultsMode !== 'chart' && (
                  <>
                    <ResizeGrip
                      onReset={tableGrip.onReset}
                      onDragStart={tableGrip.onDragStart}
                      onDrag={tableGrip.onDrag}
                      onDragEnd={tableGrip.onDragEnd}
                    />
                    <div className="@container overflow-auto min-h-0 results-scrollbars flex-shrink-0" style={{ height: `${tablePanelPx}px` }}>
                      <ResultsTable
                        emptyReason={emptyReason}
                        results={tableRows}
                        sortBy={view.sortBy}
                        detailSortKey={detailSort.key}
                        detailSortDir={detailSort.dir}
                        onDetailSort={handleDetailSort}
                        pointSample={pointSample}
                        columns={tableColumns}
                        columnWidths={tableColWidths}
                        onColumnWidthsChange={setTableColWidths}
                        modelFallbackLabel={analysisModelLabel}
                        onColumnMove={handleColumnMove}
                        fireWarnings={fire.warnings}
                        fireUncovered={fire.uncovered}
                        fireStatus={fire.status}
                        pending={pending}
                        onRemove={handleRemoveResult}
                        onRemovePending={handleRemovePending}
                        onFocusResult={handleFocusResult}
                        onFocusPending={handleFocusPending}
                        modelId={analyzed?.forecastModel ?? forecastModel}
                        times={forecastTimes}
                        onToggleChart={chart.toggle}
                        isCharted={chart.isSelected}
                        chartColor={rowChartColor}
                        onChartRange={chart.setRange}
                        partialNote={partialNote}
                      />
                    </div>
                  </>
                )}
              </>
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
          sortBy={view.sortBy}
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
          onRestore={handleRestoreRemoved}
          onRestoreAll={handleRestoreAllRemoved}
          triggerRef={removedButtonRef}
        />
      </div>
      </div>
    </div>
  )
}
