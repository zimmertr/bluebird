import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Constraints } from './utils/constraints'
import type { MapViewHandle } from './components/MapView'
import AppDrawer from './components/AppDrawer'
import type { ScoreColouring } from './utils/resultFeatures'
import MapDrawBar from './components/MapDrawBar'
import SentenceBar from './components/SentenceBar'
import SearchBox from './components/SearchBox'
import DocLinks from './components/DocLinks'
import ThemeMenu from './components/ThemeMenu'
import type { PanelSection } from './components/ControlPanel'
import { useSearchArea } from './hooks/useSearchArea'
import { forecastLabel, whenLabel, whenWord, wherePhrases } from './utils/sentenceBar'
import { discoveryNoun } from './utils/clientAnalyze'
import { deckPoints } from './utils/cloudSea'
import { geoKey } from './utils/points'
import type { CameraView } from './utils/mapView'
import SkipLink from './components/SkipLink'
import MapStage from './components/MapStage'
import ResultsSheet, { ResultsExpand } from './components/ResultsSheet'
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
import { presetListIn } from './utils/presetLists'
import { customCsvTooLong } from './utils/urlParams'
import { TUTORIAL_PATH } from './utils/tourSteps'
import PreviewBanner from './components/PreviewBanner'
import { useAnalyze } from './hooks/useAnalyze'
import { useElevationLookup } from './hooks/useElevationLookup'
import { useDestinationCount } from './hooks/useDestinationCount'
import { useCapabilities } from './hooks/useCapabilities'
import { useForecastSelection } from './hooks/useForecastSelection'
import { useRankingKnobs } from './hooks/useRankingKnobs'
import { DEFAULT_LENS } from './utils/score/lenses'
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
import { useLinkDrops } from './hooks/useLinkDrops'
import { useLinkedList } from './hooks/useLinkedList'
import { useUrlSync } from './hooks/useUrlSync'
import { useChartMetrics } from './hooks/useChartMetrics'
import { useFireProximity } from './hooks/useFireProximity'
import { useClosureProximity } from './hooks/useClosureProximity'
import { useGridLayer } from './hooks/useGridLayer'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useTheme } from './hooks/useTheme'
import { useDrawer } from './hooks/useDrawer'
import { useSafeAreaBottom } from './hooks/useSafeAreaBottom'
import { controlsSheetPx } from './utils/results/resultsSheet'
import { useHeldSheetPx } from './hooks/useHeldSheetPx'
import {
  LAYER,
  SURFACE_PAGE,
  TEXT,
} from './styles'
import {
  decodeLink,
} from './utils/urlState'
import { removalScopeFor } from './utils/analyzeRequest'
import { controlsSummary } from './utils/controlsSummary'
import { buildCustomList, customListSize, pendingDestinations } from './utils/customList'
import { analysisPoints } from './utils/model/modelDomain'
import { actionWord, retryStands } from './utils/analyzeGate'
import { usePanelMessages } from './hooks/usePanelMessages'
import { glacierRowCount } from './utils/snowCeiling'
import { useDemoMessages } from './tour/demoMessages'
import { useHeldYoung } from './hooks/useHeldYoung'
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
  // `dropped` is what the link carried and could not restore (#803, M6),
  // which the panel says beside the rest of its messages.
  const restoredRef = useRef(
    decodeLink(window.location.search, {
      maxDestinations: caps.maxDestinations,
      maxPolygonPoints: caps.maxPolygonPoints,
    }),
  )
  const restored = restoredRef.current.state
  const linkDropped = restoredRef.current.dropped
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
  const forecastSelection = useForecastSelection(restored, caps, linkDropped.includes('model'))
  const {
    selection,
    forecastModel,
    comparedModels,
    panelWindowMs,
    forgetPreClamp,
  } = forecastSelection
  const isDesktop = useIsDesktop()
  // A desk opens on the default lens; a phone keeps today's metric ranking
  // in this PR, its sheet having no room budgeted for the lens row (record
  // 0307), unless a link brings a lens.
  const rankingKnobs = useRankingKnobs(restored, caps.maxLimit, isDesktop ? DEFAULT_LENS : null)
  const {
    sortBy,
    sortDesc,
    lens,
    rowKeys,
    constraints,
    limit,
    liveKnobs,
  } = rankingKnobs

  const [showResults, setShowResults] = useState(false)
  // Every stored view preference comes out of one read, held for the mount:
  // several initializers each parsing the same stored string is what
  // `viewPrefs.ts` exists to stop. The results layout takes the mode, the
  // map's overlays the player and the opacity levels, the chart its panel
  // layout, and the table the rest.
  const storedView = useMemo(readViewPrefs, [])
  // A page opened at /tutorial starts the tour once the panel is up, in
  // place of the welcome dialog (#536): the path is a link that opens the
  // tour, and the tour's own start and end keep it and clear it.
  const openedAtTutorial = useRef(window.location.pathname === TUTORIAL_PATH)
  const [showWelcome, setShowWelcome] = useState(() => !hasWelcomed() && !openedAtTutorial.current)
  const { choice: themeChoice, theme, setChoice: setThemeChoice } = useTheme()
  // The controls panel is docked on desktop and the Controls sheet on phones
  // (record 0141). It starts open on a desktop and closed on a phone
  // (`useDrawer`, #696); a close button collapses it to widen the map.
  // Shut at a desk too: the sentence bar and its cards stand where the
  // docked panel stood (record 0309), so a desk has no panel to open.
  const { sidebarOpen, setSidebarOpen, closeDrawer, openDrawer } = useDrawer(false)
  // A phone's Controls sheet under a drag on its grip (record 0146): the height
  // the drag left it at, or null for its own share of the map.
  const [controlsHeld, setControlsHeld] = useHeldSheetPx(sidebarOpen)
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
  // The preset list last picked beside List search did not arrive (#838).
  const [presetListFailed, setPresetListFailed] = useState(false)
  // A ready-made list the link named (`list=`, #864), fetched now and put in
  // the box. The map frames it the way it frames a picked one, unless the
  // link names its own camera, which wins over every fit the app makes on
  // open (`initialCamera`).
  const linkedList = useLinkedList({
    id: restored?.presetList ?? null,
    customCsv,
    setCustomCsv: destinationInputs.setCustomCsv,
    onArrived: (points) => {
      if (!restoredView) mapRef.current?.fitToPoints(points)
    },
    onFailed: setPresetListFailed,
  })
  // The list a link carries by name: one still on its way, or the one the box
  // holds exactly. Read each render rather than kept, because whether the box
  // holds a list is the lists module's to say and no state here changes when
  // a list arrives.
  const presetList = linkedList.awaited ?? presetListIn(customCsv)?.id ?? null
  const listTooLong = customCsvTooLong({ customCsv, presetList })
  const overlays = useMapOverlays(restored, isDesktop, storedView)
  const {
    showWildfires,
    showAreaClosures,
    showTrailClosures,
    showRadar,
    showSmoke,
    showSnow,
    showCloud,
    showGrid,
    showContours,
    showRelief,
    showSlope,
    showSatellite,
    showFireActivity,
    showTerrain,
    playerShown,
  } = overlays
  // The card a sentence-bar chip has open at a desk, or null.
  const [barCard, setBarCard] = useState<PanelSection | null>(null)
  // A ring is drawn on an uncovered map: the phone's drawer shuts, and so
  // does a desk's Where card, whose Done and Cancel the draw bar carries.
  const uncoverMap = useCallback(() => (isDesktop ? setBarCard(null) : closeDrawer()), [isDesktop, closeDrawer])
  const drawMode = useDrawMode({
    mapRef,
    polygon,
    restoredPolygon: restored?.polygon,
    uncoverMap,
  })
  const {
    drawing,
    drawPointCount,
    finishDrawing,
  } = drawMode
  // What a Forecast searches (record 0309): the drawn ring, or the map's view
  // while none is drawn, and no ring at all with no kind to find. Handed to
  // the gate, the count and the command where the drawn ring went; the link
  // and the commit cues keep the drawn ring, so a pan writes no ring into a
  // link and raises no cue.
  const searchArea = useSearchArea({
    mapRef,
    drawn: polygon,
    drawPointCount,
    listOnly: destinationTypes.length === 0,
  })
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
    deskCard: setBarCard,
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
    caps.openMeteoHourlyCalls,
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
    failureSeq,
    response,
    universe,
  } = analysis
  // The elevation lookup for the coordinates box, run as soon as the box
  // holds rows (#673): usually done before Analyze is pressed, and an answer
  // that lands after a report is placed on it.
  const elevations = useElevationLookup({ csvRows, places, cap: caps.maxDestinations, onPlaced: placeHeld })
  // The ring's count ahead of Analyze (#803, D1, M7). Where the pod answers
  // from its places table, the ring is counted once it and its kinds are
  // still, so a ring over the cap greys Analyze before any press and the run
  // forecasts the counted field without asking again. A cleared ring or no
  // kind left releases a failed run's found field.
  const destinationCount = useDestinationCount({
    polygon: searchArea.polygon,
    drawPointCount: searchArea.pointCount,
    drawing,
    polygonAreaKm2: searchArea.areaKm2,
    maxAreaKm2: caps.maxPolygonAreaKm2,
    destinationTypes,
    includeUnnamedPeaks,
    discoverySource: caps.discoverySource,
    onRingGone: analysis.dropFound,
  })
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

  // ── The cloud sea (record 0310) ──────────────────────────────────────────
  // The deck every destination in the held field carries, at the hour the
  // player stands on, or the window's middle hour while it is off: the
  // report's own numbers, so drawing it asks nothing of Open-Meteo. A desk's
  // alone until the phone's shell, whose sheets have no room for its row yet.
  const cloudHour = playbackIndex ?? (forecastTimes.length > 0 ? Math.floor(forecastTimes.length / 2) : null)
  const cloudDeck = useMemo(
    () =>
      !isDesktop || !showCloud || cloudHour === null || shownUniverse === null || shownUniverse.length === 0
        ? null
        : deckPoints(shownUniverse, cloudHour),
    [isDesktop, showCloud, cloudHour, shownUniverse],
  )

  // ── The forecast grid (#246) ──────────────────────────────────────────────
  const gridLayer = useGridLayer({
    restored,
    showGrid,
    analyzed,
    universe,
    sortBy,
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
  // Over the demonstration its own ranking (#850): its rows are ranked by
  // temperature, so the results bar, the table's ranked column, the markers'
  // legend and the chart read that rather than the panel's. The panel, the
  // chart's own slots and the address bar keep the reader's.
  const { view, pointSample } = reportView(
    shownAnalyzed,
    demo?.analyzed.sortBy ?? sortBy,
    demo?.analyzed.sortDesc ?? sortDesc,
    selection.kind,
    panelWindowMs,
  )
  const readerRanking = useMemo(() => ({ sortBy, sortDesc }), [sortBy, sortDesc])
  const preview = usePreview()
  // The chart's metric slots (#499), here rather than in the results view
  // because the address bar's sync below carries them. The reader's ranking,
  // never the demonstration's, so the tour moves none of the reader's slots.
  const chartMetrics = useChartMetrics(restored?.chart, sortBy, storedView.chartLayout)

  const report = usePresentedReport({
    universe: shownUniverse,
    response: shownResponse,
    analyzed: shownAnalyzed,
    coverage: analyzed,
    analysisSeq,
    arriving,
    liveKnobs,
    // The panel's ranking for the header sort, and the demonstration's own
    // knobs for its rows while it stands in (#850).
    view: readerRanking,
    demoKnobs: demo?.analyzed ?? null,
    pointSample,
    removedKeys,
    activeRemovedKeys,
    places,
    csvRows,
    identity: elevations.identity,
    found: pendingField,
    restoredTableSort: restored?.tableSort ?? null,
  })
  // The markers' colouring while a lens ranks the field: the score's ramp
  // stretched over the range the Score cells read (record 0307), memoized for
  // the memoized map's sake.
  const scoreRangeNow = report.scoreRange
  const scoreColouring = useMemo<ScoreColouring | null>(
    () => (lens !== null ? { range: scoreRangeNow } : null),
    [lens, scoreRangeNow],
  )
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
    // A phone writes no lens: it ranks by the metric its link already names,
    // and a desk opens such a link on that metric too.
    lens: isDesktop ? lens : undefined,
    rowKeys,
    constraints,
    limit,
    customCsv,
    presetList,
    showWildfires,
    showAreaClosures,
    showTrailClosures,
    showRadar,
    showSmoke,
    showSnow,
    showCloud,
    showGrid,
    showContours,
    showRelief,
    showSlope,
    showSatellite,
    showFireActivity,
    showTerrain,
    gridStyle,
    gridReachFrac,
    places,
    defaultForecastModel: caps.defaultForecastModel,
    removedKeys,
    tableSort,
    chart: chartMetrics.metrics,
    restoredView,
    cameraHeld: tour.index !== null,
  })
  const { writeUrl } = urlSync
  // Every settled move of the map: the link's camera, and the view the search
  // area stands in for (record 0309).
  const reportCamera = urlSync.reportView
  const reportArea = searchArea.reportView
  const onCameraMove = useCallback(
    (view: CameraView, readerMove: boolean) => {
      reportCamera(view, readerMove)
      reportArea()
    },
    [reportCamera, reportArea],
  )

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
  // describes a different question. The list's size rides along for the
  // refusal, which a shorter list lifts (`refusalStands`, #803).
  const customCount = useMemo(() => customListSize(csvRows, places), [csvRows, places])
  // Every point the analysis would forecast, which a regional model's
  // published grid is held against before Analyze (#803, W8).
  const domainPoints = useMemo(
    () => analysisPoints(searchArea.polygon, destinationTypes.length > 0, buildCustomList(csvRows, places)),
    [searchArea.polygon, destinationTypes, csvRows, places],
  )
  const panelForRetry = {
    selectionKind: selection.kind,
    windowMs: panelWindowMs,
    forecastModel,
    comparedModels,
    polygon: searchArea.polygon,
    destinationTypes,
    includeUnnamedPeaks,
    pendingCount: failedView
      ? pendingDestinations(csvRows, places, failedView.customKeys, activeRemovedKeys, elevations.identity).length
      : 0,
    sortBy,
    constraints,
    customCount,
  }
  const word = actionWord(loading, retryStands(error, failedView, panelForRetry))

  const { handleAnalyze } = useAnalyzeCommand({
    selection,
    polygon: searchArea.polygon,
    drawPointCount: searchArea.pointCount,
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
    counted: destinationCount.counted,
  })

  // What the link lost, until the reader supplies it (#803, M6).
  const linkLost = useLinkDrops({
    dropped: linkDropped,
    ring: polygon !== null,
    list: csvRows.length > 0,
    modelLost: forecastSelection.modelLost,
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
    polygonAreaKm2: searchArea.areaKm2,
    maxAreaKm2: caps.maxPolygonAreaKm2,
    drawPointCount: searchArea.pointCount,
    drawing,
    destinationTypes,
    hasCustom: csvRows.length > 0,
    hasPins: places.length > 0,
    sortBy,
    loading,
    error,
    refusal,
    failedView,
    failedPanel: panelForRetry,
    customCount,
    maxDestinations: caps.maxDestinations,
    // The ring's count, what the spend is priced on, and whether the
    // report's air quality failed for part of its field (#803, D1, D2, D5).
    ringCount: destinationCount.ringCount,
    limit,
    hourlyCalls: caps.openMeteoHourlyCalls,
    aqiPartial: analysis.aqiPartial,
    glacierRows: glacierRowCount(sortBy, results),
    failureSeq,
    commitReasons,
    hasReport: response !== null,
    aqiAllNull: response !== null && results.length > 0 && results.every((r) => r.aqi_avg == null),
    wildfireCheckFailed: checkNoticeDue(fire.status, showWildfires, results.length),
    closureCheckFailed: checkNoticeDue(closure.status, showAreaClosures, results.length),
    basemapFailed,
    presetListFailed,
    listTooLong,
    archiveDays: caps.archiveDays,
    aqiForecastDays: caps.aqiForecastDays,
    windowLimits: caps.windowLimits,
    linkLost,
    dismissEvent,
    // What the gate holds the bounds and the models' grids to (#803, W6 to W8).
    constraints,
    points: domainPoints,
  })

  // What the panel and the phone's map show: the reader's messages, or the
  // tutorial's demonstration while its Messages card holds the list (#786).
  const shownMessages = useDemoMessages(tour.messagesHeld, messages, {
    aqiForecastDays: caps.aqiForecastDays,
    archiveDays: caps.archiveDays,
    maxAreaKm2: caps.maxPolygonAreaKm2,
    windowLimits: caps.windowLimits,
  })

  // A link that asks to run its analysis on open (`analyze=1`, #511).
  // It waits for a list the link named as well as for the limits: the gate
  // is shut over a box the list has not reached yet (#864).
  const { autoAnalyze, capsApplied, runAutoAnalyze } = useRunOnOpen({
    settled: caps.settled && !linkedList.arriving,
    flushUrl: writeUrl.flush,
    analyze: handleAnalyze,
  })

  // A desk's messages are the sentence bar's, which is always on the map, so
  // a failure has no shut panel to open (record 0309): the bar's own list
  // opens itself (`PanelFooter`), as the panel's did.

  // On mobile the controls are an off-canvas drawer, and it closes when an
  // analysis SUCCEEDS rather than when the button is pressed. Closing on press
  // meant a failure was invisible: the drawer slid away, the overlay finished,
  // and the reader was left looking at an empty map while the error sat in a
  // panel they had to think to reopen. Keyed on `analysisSeq`, which only moves
  // when a report commits, so a refusal or an upstream error leaves the drawer
  // where it is, and the message list opens over the map's Analyze, where the
  // phone's badge is (`useOpenOnFailure` in `PhoneFoot`, #803).
  //
  // Desktop is unaffected: the panel is docked there and closes only when the
  // reader closes it.
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
    // The tour's demonstration ranks by its own metric, so its table carries no score.
    scored: demo === null && lens !== null,
    showResults: showResults || demo !== null,
    collapsedOverride: tour.sheetCollapsed,
    restView: tour.sheetView,
    fullOverride: tour.sheetFull,
    response: shownResponse,
    // The Both widening reads the reader's own report, never the tour's (#850).
    ownResponse: response,
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
    chartMetrics,
    forecastModel,
    comparedModels,
    times: forecastTimes,
    windowLimits: caps.windowLimits,
    fire,
    closure,
    mapRef,
    removeResult: removals.removeResult,
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


  // One set of props for the results' two halves at a desk: the column and
  // the chart under the map read the same report.
  // The bounds as chips in the results header, and the pill that opens the
  // Limits card there (record 0319), which no longer stands in the sentence.
  // A phone has no cards: the pill opens the Controls sheet, where the
  // Limits section stands with the rest.
  // A desk's column widened over the map by its expand button (record 0321),
  // and held wide while the tour's chart cards point at the chart in it.
  const [resultsWide, setResultsWide] = useState(false)
  // The desk column's foot, where the map's legend stands while the column
  // does (record 0322).
  const [legendHost, setLegendHost] = useState<HTMLDivElement | null>(null)
  const toggleWide = useCallback(() => setResultsWide((w) => !w), [])
  const deskWide = isDesktop && (resultsWide || tour.sheetView === 'chart')
  const { setConstraints } = rankingKnobs
  const removeLimit = useCallback((key: keyof Constraints) => setConstraints((c) => ({ ...c, [key]: null })), [setConstraints])
  // The Limits card hangs under the sentence bar, which the widened column
  // stands over, so the pill narrows it first.
  const openLimits = useCallback(() => {
    if (!isDesktop) return openDrawer()
    setResultsWide(false)
    setBarCard('metrics')
  }, [isDesktop, openDrawer])
  const limits = useMemo(() => ({ constraints, onRemove: removeLimit, onAdd: openLimits }), [constraints, removeLimit, openLimits])

  const resultsSheetProps = {
    resultsView,
    showResults: showResults || demo !== null,
    chartTooltipIndex: tour.chartTooltipIndex,
    chartTour: tour.chartTour,
    isDesktop,
    report,
    removals,
    analysisSeq,
    onLens: isDesktop || lens !== null ? rankingKnobs.setLens : undefined,
    // A desk's for now: the phone's sheet gets its scrolling row of lenses
    // and limits with its own layout (task 17 of the from-scratch PR).
    limits: isDesktop ? limits : undefined,
    wide: deskWide,
    onWide: toggleWide,
    legendFootRef: setLegendHost,
    sortBy: view.sortBy,
    sortDesc: view.sortDesc,
    forecastTimes,
    playbackIndex,
    timelineAxes,
    movePlayheadTo,
    fire,
    closure,
    pendingHeights: waitingHeights,
    modelId: analyzed?.forecastModel ?? forecastModel,
    layoutMotion,
  }

  const renderDrawer = (bar?: { card: PanelSection | null; onCardClose: () => void; search?: ReactNode }) => (
    <AppDrawer
      open={sidebarOpen}
      isDesktop={isDesktop}
      moving={layoutMotion === 'opening' || layoutMotion === 'closing'}
      sheetHeld={controlsHeld}
      sheetRestPx={controlsSheetPx(layout.mapPx)}
      onSheetHeld={setControlsHeld}
      onClose={closeDrawer}
      tourRuns={tour.index !== null}
      themeChoice={themeChoice}
      onThemeChoice={setThemeChoice}
      drawMode={drawMode}
      destinationInputs={destinationInputs}
      forecastSelection={forecastSelection}
      rankingKnobs={rankingKnobs}
      chartMetrics={chartMetrics}
      caps={caps}
      mapRef={mapRef}
      onPointAtSearch={setSearchPointed}
      onPointAtMapPois={setPoisPointed}
      onPresetListFailed={setPresetListFailed}
      messages={shownMessages}
      onAnalyze={handleAnalyze}
      autoAnalyze={autoAnalyze}
      capabilitiesSettled={capsApplied}
      onAutoAnalyze={runAutoAnalyze}
      actionWord={word}
      onTutorial={tour.start}
      tutorialWaits={tourWaits}
      viewIsArea={searchArea.source === 'view'}
      card={bar?.card}
      onCardClose={bar?.onCardClose}
      search={bar?.search}
    />
  )

  // The sentence bar at a desk (record 0309), and what its Forecast button says:
  // the count ahead of a first run, and once a report holds forecasts for the
  // same window and model, only what it does not hold yet.
  const universeKeys = useMemo(
    () => new Set((universe ?? []).map((r) => geoKey(r.latitude, r.longitude))),
    [universe],
  )
  const ringField = destinationCount.counted()
  // A run reuses the held forecasts only for the same window and model, and
  // only while they are young (`forecastReuse.ts`); past either, it buys the
  // whole field again, and the button counts it so.
  const heldYoung = useHeldYoung(analysis.heldSinceMs)
  const heldStillAnswers =
    heldYoung && !commitReasons.includes('window-changed') && !commitReasons.includes('model-changed')
  const freshInRing = ringField
    ? ringField.found.candidates.filter((c) => !universeKeys.has(geoKey(c.latitude, c.longitude))).length
    : null
  const barLabel = forecastLabel({
    count:
      destinationCount.ringCount !== null
        ? destinationCount.ringCount + customCount
        : searchArea.source === 'list' && customCount > 0
          ? customCount
          : null,
    fresh: response !== null && heldStillAnswers && freshInRing !== null ? freshInRing + customPendingCount : null,
    noun: discoveryNoun(destinationTypes, customCount > 0),
  })
  const closeBarCard = () => setBarCard(null)
  // A phone's phrases raise the Controls sheet, and the same phrase lowers it
  // (record 0328); which one was pressed is held only to light it.
  const phoneCard = useCallback(
    (card: PanelSection | null) => {
      setBarCard(card)
      if (card === null) closeDrawer()
      else openDrawer()
    },
    [closeDrawer, openDrawer],
  )
  const phoneBarNode = (
    <SentenceBar
      {...wherePhrases(destinationTypes, searchArea.source, customCount)}
      when={whenLabel(selection, new Date())}
      whenWord={whenWord(selection)}
      card={sidebarOpen ? barCard : null}
      onCard={phoneCard}
      label={barLabel}
      footer={{
        analyzeEnabled: shownMessages.analyzeEnabled,
        word,
        onAnalyze: handleAnalyze,
        onTutorial: tour.start,
        tutorialWaits: tourWaits,
        messages: shownMessages,
      }}
      autoAnalyze={false}
      capabilitiesSettled={capsApplied}
      onAutoAnalyze={runAutoAnalyze}
      phone
    />
  )
  // A phone's place search, at the head of the Controls sheet now that the
  // bar stands where its pill stood (record 0328). A pick lowers the sheet so
  // the camera's move is seen.
  const phoneSearch = (
    <SearchBox
      onSelect={(place) => {
        mapRef.current?.flyToPlace(place, layout.sheetPadBottomPx)
        removals.registerPlace(place)
        closeDrawer()
      }}
      pointed={searchPointed}
    />
  )
  const barNode = isDesktop ? (
    <SentenceBar
      {...wherePhrases(destinationTypes, searchArea.source, customCount)}
      when={whenLabel(selection, new Date())}
      whenWord={whenWord(selection)}
      card={barCard}
      onCard={setBarCard}
      label={barLabel}
      footer={{
        analyzeEnabled: shownMessages.analyzeEnabled,
        word,
        onAnalyze: handleAnalyze,
        onTutorial: tour.start,
        tutorialWaits: tourWaits,
        messages: shownMessages,
      }}
      autoAnalyze={autoAnalyze}
      capabilitiesSettled={capsApplied}
      onAutoAnalyze={runAutoAnalyze}
      trail={<ThemeMenu choice={themeChoice} onChoice={setThemeChoice} />}
    />
  ) : (
    phoneBarNode
  )
  const cornerLinks = isDesktop ? (
    <DocLinks onTutorial={tour.start} tutorialWaits={tourWaits} className={TEXT.caption} />
  ) : null
  // While a ring is drawn at a desk the draw bar hangs where the cards do,
  // until a chip opens a card again: the Where card carries Clear as well.
  const barCardNode = (search: ReactNode) =>
    !isDesktop ? null : drawing && barCard === null ? (
      <MapDrawBar
        inline
        drawPointCount={drawPointCount}
        onDone={finishDrawing}
        onCancel={drawMode.handleCancelDrawing}
      />
    ) : (
      renderDrawer({ card: barCard, onCardClose: closeBarCard, search })
    )
  const openWhere = useCallback(() => setBarCard('destinations'), [])
  const openWhen = useCallback(() => setBarCard('forecast'), [])

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
            cut={!isDesktop}
          />
        </Suspense>
      )}
      {layout.isDragging && (
        <div className={`fixed inset-0 ${LAYER.modal} cursor-ns-resize touch-none`} />
      )}

      {!isDesktop && renderDrawer({ card: null, onCardClose: closeDrawer, search: phoneSearch })}

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
        // A desk is a row: the map and its chart down the left, the results'
        // column down the right (record 0312).
        className={`relative flex-1 flex overflow-hidden min-w-0 focus:outline-none ${isDesktop ? 'flex-row' : 'flex-col'}`}
      >
        <div className={isDesktop ? 'relative flex min-w-0 flex-1 flex-col' : 'contents'}>
        <MapStage
          mapRef={mapRef}
          theme={theme}
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
          messages={shownMessages}
          actionWord={word}
          actionLabel={barLabel}
          onAnalyze={handleAnalyze}
          layersForcedOpen={tour.layersOpen}
          searchPointed={searchPointed}
          poisPointed={poisPointed}
          urlSync={urlSync}
          restoredView={restoredView}
          onBasemapFailed={setBasemapFailed}
          maxPolygonPoints={caps.maxPolygonPoints}
          lowerSheetFirst={resultsView.lowerSheetFirst}
          bar={barNode}
          barCard={barCardNode}
          onOpenWhere={openWhere}
          cornerLinks={cornerLinks}
          legendHost={legendHost}
          cloudDeck={cloudDeck}
          scoreColouring={scoreColouring}
          // The strip's days are the panel's, which the tour's demonstration
          // does not use, so the tour plays its hours on the player alone.
          dayStrip={
            demo === null
              ? {
                  selection,
                  onSelection: forecastSelection.changeSelection,
                  band: forecastSelection.band,
                  fresh: analyzed !== null && !commitReasons.includes('window-changed'),
                  onModel: openWhen,
                }
              : null
          }
          onCameraMove={onCameraMove}
        />

        <ResultsExpand isDesktop={isDesktop} layout={layout} />
        </div>

        <ResultsSheet {...resultsSheetProps} pointSample={pointSample} />
      </main>
      </div>
    </div>
  )
}
