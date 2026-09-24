import {
  Fragment,
  type ReactNode,
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
import SearchBox, { type SearchBoxHandle } from './components/SearchBox'
import ResultsTable from './components/ResultsTable'
import ColumnsPicker from './components/ColumnsPicker'
import ModelsPicker from './components/ModelsPicker'
import RemovedPicker from './components/RemovedPicker'
import ResizeGrip from './components/ResizeGrip'
import WelcomeModal from './components/WelcomeModal'
import PreviewBanner from './components/PreviewBanner'
import TimelineTransport from './components/TimelineTransport'
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
import {
  ModelRow,
  legendEntries,
  modelRowsFor,
  PARTIAL_COVERAGE_NOTE,
  partialModels,
  type ModelEnd,
} from './utils/modelCompare'
import { useFireProximity } from './hooks/useFireProximity'
import { useGridLayer } from './hooks/useGridLayer'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import {
  DestinationResult,
} from './types'
import { chartKey } from './utils/chartData'
import { logoUrl } from './logo'
import {
  IconChart,
  IconChartTable,
  IconChevron,
  IconClose,
  IconLayers,
  IconMenu,
  IconTable,
} from './components/icons'
import {
  ACCENT,
  BUTTON_FLOATING,
  CAPTION_LIFTED,
  CHOICE_INPUT,
  CHOICE_ROW,
  BUTTON_SECONDARY,
  DISABLED,
  FOCUS_RING,
  ICON_ACTION,
  ICON_BUTTON,
  LAYER,
  LEGEND_TOP,
  LINK,
  MAP_COL_GAP,
  MAP_COL_GAP_T,
  MAP_COL_W,
  MAP_EDGE,
  MAP_ROW_H,
  MUTED,
  PROSE,
  RADIUS,
  LIFTED_EDGE,
  RECESSED_FILL,
  SEGMENT_FLUID,
  SEGMENT_FLUID_LIFTED,
  CONTROL_SIZE,
  SLIDER_IDLE,
  STATUS,
  SLIDER_OVERLAY,
  SLIDER_VALUE,
  SLIDER_WORDMARK,
  SEGMENT_DIVIDER,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SR_ONLY,
  SURFACE_CARD,
  SURFACE_DIVIDER,
  SURFACE_FLOATING,
  SURFACE_PAGE,
  SURFACE_POPOVER,
  SURFACE_SHEET,
  SWATCH_CHIP,
  SWATCH_EDGE,
  SWATCH_RAMP,
  SWATCH_RAMP_SCRIM,
  SWATCH_RAMP_TICK,
  TAP,
  TEXT,
  YIELD_EMPTY,
} from './styles'
import {
  NOUN,
  familyOf,
  metricLabel,
  rankedNoun,
} from './metrics'
import { hourlyScale, rankedScale } from './utils/colors'
import {
  pitchLabel,
  reachKmFor,
  type GridStyle,
} from './utils/forecastGrid'
import { IEM_HREF } from './utils/radar'
import { HMS_HREF, SMOKE_DENSITIES, SMOKE_EDGE, smokeSwatch } from './utils/smoke'
import { NOHRSC_HREF, SNOW_LABEL, SNOW_RAMP, snowRampCss, snowTicks } from './utils/snowDepth'
import { NIFC_HREF } from './utils/wildfires'
import { RampTick, scaleRampCss, scaleTicks } from './utils/legendRamp'
import {
  pendingAsResult,
} from './utils/customList'
import { geoKey } from './utils/points'
import {
  legendBottomPx,
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
import { isPointSample, normalizeWindow } from './utils/forecastWindow'
import {
  fieldHasValue,
  panelCommitCues,
} from './utils/present'
import {
  MODEL_KEY,
  WILDFIRE_COL,
  WILDFIRE_KEY,
  applyColumnOrder,
  displayedColumns,
  keepUnlistedChoices,
  moveColumn,
  visibleColumns,
  withModelColumn,
} from './utils/tableColumns'
import {
  hasWelcomed,
  readViewPrefs,
  setWelcomed,
  writeViewPrefs,
} from './utils/viewPrefs'
import { NAME_DEFAULT_PX } from './utils/columnResize'
import { compareValues } from './utils/sortResults'
import { buildResultsCsv, csvFilename } from './utils/resultsCsv'

// Lazy, because `recharts` is the one large library the first screen does not
// need: the map mounts before any chart exists, and a reader who never opens
// one paid for it anyway. The fallback is `null` on purpose — the chart panel
// already reserves its height, so an empty box is what the reader would see
// during the fetch either way, and a word there would be a new string for a
// wait measured in a hundred milliseconds off an already warm connection.
const TimeSeriesChart = lazy(() => import('./components/TimeSeriesChart'))

// One row of the Layers popover: a checkbox and what it switches. The four
// overlays and the forecast player share it, because they are the same kind of
// choice — about what the map shows, never about what the analysis asks for.
function layerRow({
  key,
  label,
  checked,
  onChange,
  disabled,
  note,
}: {
  key: string
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  /** Out of play for this report; `note` says why, as the row's `title` and as
   *  the hidden text its checkbox points at, since a tooltip does not exist on
   *  touch or to a screen reader. */
  disabled?: boolean
  note?: string
}) {
  return (
    <label key={key} className={CHOICE_ROW} title={disabled && note ? note : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={disabled && note ? `layer-${key}-note` : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className={CHOICE_INPUT}
      />
      <span>{label}</span>
      {disabled && note && (
        <span id={`layer-${key}-note`} className={SR_ONLY}>
          {note}
        </span>
      )}
    </label>
  )
}

/**
 * One section of the map's legend box: what it keys, who it came from, and the
 * key itself (#454).
 *
 * Two shapes, and the difference is the DATA's rather than the section's. A key
 * on a single value is a ROW — its label on the left, its swatch on the right.
 * A key on a SCALE is the strip across the box with its numbers INSIDE it,
 * because six bands of temperature and eleven of depth are not things a 14px
 * chip can say, and a row per band is seven lines and eleven on a map that can
 * be 161px tall. Inside rather than under, so the whole key is one line: a
 * scale section is 40px where two of them under their strips were 54 apiece
 * (TJ, 2026-09-17).
 *
 * One function for both, and one for the metric key and the layers alike,
 * because the sections are sorted by their labels at the call site: a shape
 * that could only be built inline could not take its place in that order. They
 * had already drifted into two shapes once, six swatch rows against a strip.
 *
 * `credit` is what the data licences ask for, and it is a section's own rather
 * than a list somewhere else so a credit stands beside the thing it describes.
 */
function legendSection({
  label,
  credit,
  swatch,
  ramp,
}: {
  label: string
  credit?: { href: string; name: string }
  /** What sits at the right of a single-value row. */
  swatch?: ReactNode
  /** The strip and its numbers, for a section keyed on a scale. */
  ramp?: { css: string; ticks: RampTick[]; bands: number }
}) {
  const name = (
    <span className={TEXT.control}>
      {label}
      {credit && (
        <>
          {' ('}
          <a href={credit.href} target="_blank" rel="noopener noreferrer" className={LINK}>
            {credit.name}
          </a>
          {')'}
        </>
      )}
    </span>
  )
  if (!ramp) {
    return (
      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
        {name}
        {swatch}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {name}
      {/* The strip IS the grid its numbers sit in, so the whole key is one
          line: a band per column, so a tick lands on the boundary it names
          however wide the box is. `minmax(0,1fr)` rather than `1fr` — the last
          label is wider than a band, and a plain fr track would grow to fit it
          and shift every tick left of it.

          A boundary is a column EDGE, not a column, so a centred tick spans
          the two columns that meet on it and centres across the pair — grid
          has no way to centre one item on a track's edge. The other two
          alignments sit in one column each and hang from the edge that is the
          boundary: `start` in the column that begins there, `end` in the one
          that ends at the strip's own right edge.

          Not `aria-hidden`, which the strip carried while its numbers were
          outside it: they are the strip's own children now, and hiding it
          would take the scale off a screen reader with them. */}
      <span
        className={SWATCH_RAMP}
        style={{
          backgroundImage: ramp.css,
          borderColor: SWATCH_EDGE,
          gridTemplateColumns: `repeat(${ramp.bands}, minmax(0, 1fr))`,
        }}
      >
        <span className={SWATCH_RAMP_SCRIM} aria-hidden="true" />
        {ramp.ticks.map((tick) => (
          <span
            key={tick.label}
            className={SWATCH_RAMP_TICK}
            style={{
              gridColumn:
                tick.align === 'center'
                  ? `${tick.at} / ${tick.at + 2}`
                  : `${tick.at + 1} / span 1`,
              justifySelf: tick.align,
            }}
          >
            {tick.label}
          </span>
        ))}
      </span>
    </div>
  )
}

// What the chart draws for its rows while a model comparison is up: nothing,
// because the comparison composes every line itself. A module constant so the
// chart's line memo is not rebuilt by a fresh empty array on every render.
const NO_CHART_ROWS: DestinationResult[] = []
// No compared model ends early: one identity, so the memo below hands the same
// empty list on every render where nothing is short.
const NO_PARTIAL_MODELS: readonly ModelEnd[] = []

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

  // The map's own Layers popover, closed on load. Not persisted: it is a
  // disclosure, not a setting, and a link that reopened it would be sharing a
  // gesture rather than a picture.
  const [layersOpen, setLayersOpen] = useState(false)
  const layersRef = useRef<HTMLDivElement>(null)
  // Both ways out of a popover a reader expects: click away, or press Escape.
  // `pointerdown` rather than `click` so a press that starts outside dismisses
  // even if the pointer travels before release, and so it lands before the
  // map's own handlers get a chance to treat the same press as a map gesture.
  useEffect(() => {
    if (!layersOpen) return
    function onDown(e: PointerEvent) {
      if (!layersRef.current?.contains(e.target as Node)) setLayersOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLayersOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [layersOpen])
  const [showResults, setShowResults] = useState(false)
  // Every stored view preference comes out of one read, held for the mount:
  // several initializers each parsing the same stored string is what
  // `viewPrefs.ts` exists to stop. The results layout takes the mode; the
  // table takes the rest.
  const storedView = useMemo(readViewPrefs, [])
  // Which columns the table displays (null = use default narrowed set, Set = user choice).
  // The CSV export always gets the full displayedColumns set regardless.
  const [columnVisibility, setColumnVisibility] = useState<Set<string> | null>(
    () => storedView.columns,
  )
  // The Model column's own switch, which is three-valued rather than two.
  //
  // It is in the Columns picker like every other column (TJ, 2026-09-14), but
  // unlike every other column its DEFAULT depends on the report: with one model
  // every row would carry the same name, and with several the column is what
  // tells a destination's rows apart. So `null` means "follow the model count"
  // and a boolean is the reader's own answer, which then stands whatever the
  // count does. Folding it into `columnVisibility` instead would freeze the
  // default the first time the reader touched ANY column, and a later
  // comparison would then come up without the column that explains it.
  const [modelColumn, setModelColumn] = useState<boolean | null>(() => storedView.modelColumn)

  // The order the reader dragged the columns into, or null for the automatic
  // one (#360). A list of keys rather than positions, so a column the list
  // predates keeps its place instead of vanishing; `applyColumnOrder` owns that
  // rule.
  //
  // It is discarded whenever the ranking changes (TJ, 2026-09-14): `Rank by`
  // pulls the ranked metric group to the front, and the maintainer chose to let
  // it win rather than have a stored order suppress the one thing the ranking
  // does to the columns.
  const [columnOrder, setColumnOrder] = useState<readonly string[] | null>(
    () => storedView.columnOrder,
  )

  // Persist the table's shape whenever it changes. One write for all three:
  // they are read back together, and `writeViewPrefs` drops a null rather than
  // storing one, so "the reader has not answered" survives a reload as the
  // absence it is and the report still decides.
  useEffect(() => {
    writeViewPrefs({ columns: columnVisibility, modelColumn, columnOrder })
  }, [columnVisibility, modelColumn, columnOrder])
  // Column picker popover open/closed
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [removedOpen, setRemovedOpen] = useState(false)
  // Column widths the user has set (px by key). Held here rather than in the
  // table so a mode switch or the collapse chevron — both of which unmount
  // the table — cannot reset them. Session-only by design: a width is a
  // reading posture, not a preference. Name opens at the measured
  // 25-character width and everything else natural.
  const [tableColWidths, setTableColWidths] = useState<Record<string, number>>({
    name: NAME_DEFAULT_PX,
  })
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
  const {
    showWildfires,
    setShowWildfires,
    showRadar,
    setShowRadar,
    showSmoke,
    setShowSmoke,
    showSnow,
    setShowSnow,
    showGrid,
    setShowGrid,
    showPlayer,
    setShowPlayer,
    playerShown,
  } = useMapOverlays(restored, isDesktop)
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
  const {
    gridStyle,
    setGridStyle,
    gridReachFrac,
    gridReachDraft,
    setGridReachDraft,
    commitGridReach,
    gridAvailable,
    gridOn,
    grid,
    gridReachPitchKm,
    gridPainted,
    gridCued,
    gridFailed,
    gridLegend,
  } = useGridLayer({
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
  // A point-sample flip relabels the metric columns under the SAME keys —
  // the collapsed bare-noun header and the windowed aggregate header both
  // live at one key — so a width fitted under one regime clips the other
  // regime's longer header. The metric columns re-open at their natural width
  // when the regime changes; the identity columns keep theirs, since their
  // labels never change.
  useEffect(() => {
    setTableColWidths((w) =>
      Object.fromEntries(
        Object.entries(w).filter(([k]) => k === 'name' || k === 'type' || k === 'elevation_ft'),
      ),
    )
  }, [pointSample])
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
    leavingRowKeys,
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
  // table derivations, because the wildfire column sorts and renders out of
  // its maps.)
  const fire = useFireProximity(fireField ?? universe ?? results, fireSeq)

  // Nulls sort last in both directions; string columns use numeric collation so
  // a pasted list numbered 1..100 reads in order. See compareValues. The
  // wildfire column's key is virtual: its value is the warning's mileage, so a
  // clear row and an uncovered row are both null and land last either way.
  // Whether the report carries the cloud column (#117). Before any report,
  // nothing does, which leaves the cloud columns out of an empty table too.
  const cloudHeld = analyzed?.cloudFetched ?? false
  const csvColumns = useMemo(
    () => displayedColumns(pointSample, view.sortBy, cloudHeld),
    [pointSample, view.sortBy, cloudHeld],
  )
  // Every column is on by default — the table scrolls sideways rather than
  // opening narrowed (TJ's call in the #242 review). A stored choice from the
  // Columns picker still wins; null means "all of them".
  const effectiveVisibleKeys = useMemo(() => {
    if (columnVisibility !== null) return columnVisibility
    return new Set([...csvColumns.map((c) => c.key as string), WILDFIRE_KEY])
  }, [columnVisibility, csvColumns])

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

  // Alphabetical by label, which is the only order a list of unrelated switches
  // can be scanned in: these five have no ranking between them — no cost, no
  // severity, no dependency — so any other order is one the reader has to
  // learn. The grid's own segment and slider still render under its row,
  // because they are that row's sub-choices rather than list members.
  //
  // The player is a list member like the other four even though it switches
  // something OFF the map rather than a picture onto it: it answers the same
  // question — what is on the map — and nothing about the report follows it,
  // so it is no more a knob than the overlays beside it.
  const MAP_LAYERS = [
    {
      key: 'grid',
      label: 'Forecast grid',
      checked: showGrid,
      onChange: setShowGrid,
      disabled: !gridAvailable,
      // Mounted twice, as the row's `title` and as the hidden text its checkbox
      // points at: a tooltip does not exist on touch or to a screen reader.
      note: 'The forecast grid is not available for archival data.',
    },
    // Always in the list, gray when nothing spans time (#460). It used to join
    // and leave the list on the radar toggle, which moved every row under it.
    // `CHOICE_ROW` fades the label with its checkbox, and there is no `note`:
    // the gray row is the whole message, where a sentence about a control
    // would be a tooltip by another name (TJ, 2026-09-22).
    {
      key: 'player',
      label: 'Forecast player',
      checked: playerShown,
      onChange: setShowPlayer,
      disabled: !playerOffered,
    },
    { key: 'radar', label: 'Rain radar', checked: showRadar, onChange: setShowRadar },
    { key: 'smoke', label: 'Smoke', checked: showSmoke, onChange: setShowSmoke },
    { key: 'snow', label: 'Snow depth (US only)', checked: showSnow, onChange: setShowSnow },
    { key: 'fires', label: 'Wildfires (US only)', checked: showWildfires, onChange: setShowWildfires },
  ]

  // Download the displayed report (#125). Everything that decides what the file
  // contains is already resolved above, so this only has to hand settled values
  // to the formatter and hang the result off an anchor.
  //
  // The warnings go over only when the lookup actually produced them. Anything
  // else is `null`, which drops the wildfire column from the file rather than
  // filling it with blanks that would read as "checked, nothing near".
  //
  // The object URL is revoked on the next frame rather than immediately:
  // click() only queues the download, and Safari has historically cancelled it
  // if the URL is released in the same task.
  function handleDownloadCsv() {
    const csv = buildResultsCsv(
      tableRows,
      // The same insertion the table makes. The file is given the same rows,
      // so without it a comparison writes each destination once per model with
      // nothing saying which model each line is.
      // The same columns the table shows, in the same order: the file leaves
      // in the order that is on screen (#125), and a reader's reorder is no
      // different from a sort in that respect.
      applyColumnOrder(withModelColumn(csvColumns, modelColumnOn), columnOrder),
      // Null also when the column is hidden: buildResultsCsv drops the
      // wildfire column on null, and a file must not carry a column the
      // screen does not show.
      fire.status === 'ready' && effectiveVisibleKeys.has(WILDFIRE_KEY) ? fire.warnings : null,
      {
        // The window the numbers in the file describe (#444), taken from the
        // analysis snapshot rather than from the panel: the calendar can have
        // moved on since the report committed, and the file must name the days
        // that were fetched. Resolved first, because the snapshot records the
        // request's raw timestamps and a Current analysis is `start === end`
        // there: the file writes the hour that was sampled, not a window of no
        // width at all.
        window: analyzed ? normalizeWindow(analyzed.window.startMs, analyzed.window.endMs) : null,
        // The table draws pending (un-analyzed) rows above the ranked ones, so
        // the file carries them too — identity columns filled, Rank and every
        // metric blank. Before the first analysis this is the whole file.
        pendingRows: pending.map(pendingAsResult),
        fireUncovered: fire.uncovered,
        modelLabel: analysisModelLabel,
        // The file states where each short model ends, where the screen marks
        // the cells: a spreadsheet can compute the covered hours from a date.
        modelEnds: partial,
      },
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = csvFilename(new Date())
    link.click()
    requestAnimationFrame(() => URL.revokeObjectURL(url))
  }


  // Whether the Model column is drawn: the reader's answer if they gave one,
  // and otherwise the model count. See `modelColumn` above for why the switch
  // has three values rather than two.
  const modelColumnOn = modelColumn ?? comparingRows
  // What the Columns picker shows ticked. The Model column rides beside the
  // visibility set rather than inside it, so it is added here, at the one place
  // that draws the picker.
  const pickerVisibleKeys = useMemo(() => {
    const keys = new Set(effectiveVisibleKeys)
    if (modelColumnOn) keys.add(MODEL_KEY)
    else keys.delete(MODEL_KEY)
    return keys
  }, [effectiveVisibleKeys, modelColumnOn])

  // The picker hands back one set for every column. The Model column's answer
  // is pulled out of it and kept separately; the rest is the ordinary set.
  function handleVisibilityChange(keys: Set<string>) {
    const wanted = keys.has(MODEL_KEY)
    if (wanted !== modelColumnOn) setModelColumn(wanted)
    const rest = new Set(keys)
    rest.delete(MODEL_KEY)
    setColumnVisibility(
      keepUnlistedChoices(rest, new Set(allColumns.map((c) => c.key as string)), columnVisibility),
    )
  }

  // The ranking pulls its own metric group to the front, and the maintainer
  // chose to let it win over an order the reader set (TJ, 2026-09-14). Keyed on
  // the ranking alone: a live sort, a limit or a bound re-presents the same
  // columns and must not throw the order away.
  //
  // Skipping the first run is what makes the order survive a reload: an effect
  // keyed on a value fires on mount as well as on change, so without the ref
  // the stored order was discarded by the very render that read it.
  const rankedOnce = useRef(false)
  useEffect(() => {
    if (!rankedOnce.current) {
      rankedOnce.current = true
      return
    }
    setColumnOrder(null)
  }, [view.sortBy])

  // The model every row came from when only one did, so the column says
  // something rather than a dash on a report with no comparison. The ANALYZED
  // model, not the panel's: the numbers are the analysis's, and the picker can
  // move after it.
  const analysisModelLabel =
    caps.forecastModels.find((m) => m.id === (analyzed?.forecastModel ?? forecastModel))?.label ??
    null

  // Every displayed row under every model that answered, grouped by
  // destination. `modelRowsFor` owns the rules; this only decides whether to
  // ask, and hands it the ranking model first so its row leads each group.
  const comparedTableRows = useMemo(() => {
    if (!comparingRows) return null
    return modelRowsFor(
      results,
      compare.shown.map((m) => ({ id: m.id, label: m.label })),
      forecastModel,
      compare.results,
      chartKey,
      compare.reachEnds,
    )
  }, [comparingRows, results, compare.shown, compare.results, compare.reachEnds, forecastModel])

  // The compared models whose rows on display cover fewer hours than the
  // window, in the picker's order. One derivation for the table's footnote and
  // the file's metadata rows, so the two cannot name different models.
  const partial = useMemo(
    () => (comparedTableRows ? partialModels(compare.shown, comparedTableRows) : NO_PARTIAL_MODELS),
    [comparedTableRows, compare.shown],
  )
  // A string rather than the list, so the memoized table compares it by value.
  const partialNote = partial.length > 0 ? PARTIAL_COVERAGE_NOTE : null

  // The chart-only legend's chips: the rows the table would show, so a chip is
  // a line whenever models are compared. `legendEntries` owns the rules.
  const legend = useMemo(
    () => legendEntries(comparedTableRows ?? results, pendingRows, comparingRows),
    [comparedTableRows, results, pendingRows, comparingRows],
  )

  const tableRows = useMemo(() => {
    const value = (r: DestinationResult) =>
      detailSort.key === WILDFIRE_KEY
        ? (fire.warnings.get(geoKey(r.latitude, r.longitude))?.miles ?? null)
        : detailSort.key === MODEL_KEY
          ? ((r as ModelRow).modelLabel ?? null)
          : r[detailSort.key]
    const base = comparedTableRows ?? results
    return [...base].sort((a, b) => compareValues(value(a), value(b), detailSort.dir))
  }, [results, comparedTableRows, detailSort, fire.warnings])
  // All columns for the CSV export (includes all columns, not filtered by visibility).
  // Columns displayed in the table (filtered by visibility). The wildfire
  // column is last, shown by default, and toggleable in the Columns picker
  // like everything else (TJ, 2026-08-21, reversing the #256-era always-on
  // rule). While shown, its cells — not the column — say where the check
  // stands (ticking while it runs, answered when it has; ResultsTable owns
  // that). The CSV keeps the stricter rule and carries the column only once
  // the check answered AND the column is shown, because a file's columns
  // must not disagree with the screen's.
  const tableColumns = useMemo(() => {
    const cols = visibleColumns(pointSample, view.sortBy, effectiveVisibleKeys, cloudHeld)
    const withFire = effectiveVisibleKeys.has(WILDFIRE_KEY) ? [...cols, WILDFIRE_COL] : cols
    return applyColumnOrder(withModelColumn(withFire, modelColumnOn), columnOrder)
  }, [
    pointSample,
    view.sortBy,
    effectiveVisibleKeys,
    cloudHeld,
    modelColumnOn,
    columnOrder,
  ])

  // Every column there is, in the reader's order: what the Columns picker
  // lists, and the list a move is made within.
  //
  // The baseline is this rather than the columns on screen, so a hidden column
  // keeps its place. Ordering only the visible ones would send every hidden
  // column to the end the moment it came back.
  const allColumns = useMemo(
    () => applyColumnOrder([...withModelColumn(csvColumns, true), WILDFIRE_COL], columnOrder),
    [csvColumns, columnOrder],
  )

  // Both surfaces move a column by naming the column and the one it lands on.
  // The key list is what is stored, so the move is made on that rather than on
  // a pair of indices each surface would have to derive the same way.
  const handleColumnMove = useCallback(
    (fromKey: string, toKey: string) => {
      const base = allColumns.map((c) => c.key as string)
      setColumnOrder((prev) => moveColumn(prev ?? base, fromKey, toKey))
    },
    [allColumns],
  )



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
          {/* Above the drawer, not under it. The drawer now stays open for the
              length of a run, and an analysis with no visible progress is the
              thing this overlay exists to prevent — so it takes the layer that
              clears the drawer rather than the one that sits under it. On
              desktop nothing moves: there is no drawer for it to clear. */}
          {overlay.visible && (
            <div className={`absolute inset-0 bg-slate-900/60 ${LAYER.popover} flex items-center justify-center`}>
              <div className={`${SURFACE_CARD} px-6 py-5 text-center w-[280px]`}>
                <img
                  src={logoUrl}
                  width={256}
                  height={256}
                  alt=""
                  className={`w-12 h-12 ${RADIUS.surface} object-cover mx-auto mb-3 animate-pulse`}
                />
                {/* role=status + aria-live: without it, the analysis phase is
                    the one moment the app goes completely silent for screen
                    readers — announce each status line as it changes. The
                    wrapper covers the detail line too, so failover news
                    ("Trying backup map server…") is announced as well. */}
                <div role="status" aria-live="polite">
                  <p className={`${PROSE.heading} leading-snug`}>{overlay.message}</p>
                  {overlay.detail && (
                    <p className={`${TEXT.caption} mt-1 leading-snug`}>{overlay.detail}</p>
                  )}
                </div>
                {overlay.progress ? (
                  // Weather phase — countable batch progress (the union count is
                  // already in the "(x/y)" headline, so the bar just visualizes it).
                  <div className="mt-3">
                    <div className={`h-2 w-full ${RADIUS.pill} bg-slate-700 overflow-hidden`}>
                      <div
                        className={`h-full ${ACCENT.mark} transition-all duration-300 ease-out`}
                        style={{ width: `${overlay.progress.percent}%` }}
                      />
                    </div>
                    <p className={`mt-1.5 ${TEXT.caption} font-mono`}>
                      {overlay.progress.percent}%
                    </p>
                  </div>
                ) : (
                  // Search / analyzing phase — no countable progress; show activity.
                  <div className="mt-3">
                    <div className={`h-2 w-full ${RADIUS.pill} bg-slate-700 overflow-hidden`}>
                      <div className={`h-full w-1/3 ${RADIUS.pill} ${ACCENT.mark} animate-indeterminate`} />
                    </div>
                    <p className={`mt-1.5 ${TEXT.caption} font-mono`}>
                      Elapsed {elapsed}s
                    </p>
                  </div>
                )}
                <button
                  onClick={cancel}
                  // `w-fit mx-auto` rather than leaning on the card's text
                  // alignment: TAP.action makes every button a flex container,
                  // which is block-level and fills its parent, so the label
                  // centres inside a full-width box and the box itself has no
                  // alignment left to inherit. Shrinking it to its content is
                  // what gives `mx-auto` something to centre.
                  className={`${BUTTON_SECONDARY} mt-4 w-fit mx-auto`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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
          {/* Top-anchored legends: they hang one gap under the Layers button
              (`LEGEND_TOP`) and grow downward, at EVERY width.

              A key belongs where the reader last looked for it. Anchored to
              the bottom instead, the stack rode up and down with every panel
              drag and every results mode, so a box that had said nothing new
              appeared to be moving on its own — and on a phone the last box
              ended up under the forecast player. Anchored here it is a fixed
              landmark under the button that switches the layers it explains,
              and what gives when the map runs short is the tail of the stack
              rather than its position.

              The inset is what clears the Controls/search/Layers column above,
              and it is two numbers rather than one because that column is two
              heights: `TAP` floors the search row and the Layers button at 44
              for a finger, so the column ends at 92 under a pointer and 108
              under a finger. The role holds both with the arithmetic; the rule
              is that the stack sits one of the column's own 8px gaps below
              whichever it is. Anything shorter collides — at 76 the first rows
              paint behind the Layers button, which is opaque and paints after
              the legends (see the ordering note above) — and anything taller is
              dead map.

              It used to lift at `lg`, on the reasoning that a desktop map has
              room to spare — but "top-auto" does not mean "as tall as it
              likes", it means the box starts wherever its content puts it,
              which on a wide map was 54px: straight through the Layers button
              at 54-92. Same collision, reached from the other side.

              The `bottom` offset is a ceiling on the scroll box, not an
              anchor: it stops the stack above the timeline's band while the
              bar is on screen, and above the sheet's top edge on a phone, so
              no box is ever half under a control. Overflow leaves through the
              bottom, which is the edge a scroll can follow — a stack that
              overflowed its START edge would put boxes at negative
              coordinates with `scrollTop` pinned at 0 and no way to reach
              them, which is measured and is why the bottom anchoring is not
              coming back. A sheet dragged tall closes the box to nothing, and
              a double press on its grip brings the legends back with the rest
              of the default. */}
          {(hasColoredMarkers || gridPainted || gridCued || gridFailed || showWildfires || showSmoke || showRadar || showSnow) && (
            <div
              // The inset clears the button column above, which is one row
              // taller while the panel is collapsed and the Controls button
              // stands in it. `LEGEND_TOP` carries both heights; picking
              // between them here is the only thing that knows which one is on
              // screen.
              className={`absolute ${MAP_EDGE.left} ${
                sidebarOpen ? LEGEND_TOP.compact : LEGEND_TOP.full
              } z-10 flex flex-col ${MAP_COL_GAP} overflow-y-auto [&>*]:flex-shrink-0 ${YIELD_EMPTY}`}
              // The floor of the scroll box, derived rather than chosen: the
              // transport's whole band while the bar is on screen and a plain
              // gap otherwise, measured from whatever stands on the map's
              // bottom edge — the edge itself where the results are docked, the
              // top of the sheet where they cover it (#249).
              style={{ bottom: legendBottomPx(sheetLiftPx, timelineAxis !== null) }}
            >
              {/* ONE box, gaining and losing sections as the report and the
                  layers change (#454). It was two — the layer rows in one, the
                  six-row metric key in another — which cost a border, a gap and
                  a second backdrop on a map that can be 161px tall on a phone.

                  **Alphabetical by the label each section READS**, the metric
                  key included (TJ, 2026-09-17). Nothing ranks these against
                  each other — no cost, no severity, no dependency — so any
                  other order is one the reader has to learn, and a key that is
                  a list member cannot be a headline above the list. It costs
                  the metric key a fixed position: a temperature ranking sorts
                  last and an AQI one first. That is the order working rather
                  than the key moving on its own, and it is the same rule that
                  moved `Active wildfire` off the bottom, where it had been
                  sorting under the Layers popover's own name for it.

                  Sorted here rather than written in order, because one of the
                  labels is the ranked metric's and changes under the reader.
                  Every label is spelled once, as the sort key AND as what the
                  section renders, so the two cannot disagree. */}
              <div className={`${SURFACE_FLOATING} ${MAP_COL_W} flex flex-col gap-1 px-2.5 py-2`}>
                {[
                  // Keyed to the markers OR to the grid, because either can be
                  // the only colored thing on screen: a live filter can empty
                  // the table while the field still paints, and colors without
                  // their key are noise. One section serves both — they are
                  // scored on the same scale by construction (#246), which is
                  // also why the grid has no swatch of its own in its row.
                  //
                  // The strip follows `markerScale`, so playback's swap to an
                  // hourly precipitation scale moves the bands and the numbers
                  // with the markers. The bare metric is all the label says:
                  // which hour or window the colors describe, how it was
                  // reduced, and — for wind — which datum produced it (#361)
                  // are all stated by the results header and the table's own
                  // column headers.
                  ...(markerScale !== null &&
                  rankedFieldHasValue &&
                  (hasColoredMarkers || gridPainted || gridCued)
                    ? [
                        {
                          // `Temperature (°F)`, by the same composer the table
                          // headers use, reading the SCALE's unit so playback's
                          // swap to the hourly rate relabels the strip with its
                          // bands. No aggregate and no qualifier: which hour or
                          // window the colours describe, how it was reduced,
                          // and — for the wind and the temperature — which
                          // datum produced it (#361, #443) are all stated by
                          // the results header and the table's own column
                          // headers. AQI reads as the bare noun, its index
                          // having no unit.
                          label: metricLabel(
                            familyOf(view.sortBy),
                            undefined,
                            markerScale.unit,
                          ),
                          ramp: {
                            css: scaleRampCss(markerScale),
                            ticks: scaleTicks(markerScale),
                            bands: markerScale.colors.length,
                          },
                        },
                      ]
                    : []),
                  // CC BY 3.0 wants the credit wherever the fire data is drawn,
                  // and section 4(b) lets it be "implemented in any reasonable
                  // manner" — so it is the section's own label. The licence URI
                  // section 4(a) asks for lives in DataSourceList, which both
                  // document pages render.
                  ...(showWildfires
                    ? [
                        {
                          label: 'Active wildfire',
                          credit: { href: NIFC_HREF, name: 'NIFC' },
                          swatch: (
                            <span
                              className={`inline-block h-3.5 w-3.5 flex-shrink-0 ${RADIUS.control} border`}
                              style={{
                                backgroundColor: 'rgba(220,38,38,0.35)',
                                borderColor: '#b91c1c',
                              }}
                            />
                          ),
                        },
                      ]
                    : []),
                  // No swatch: the grid's colours are the metric key's, which
                  // the markers share. What this row adds is the one thing that
                  // IS the grid's own — how far apart the samples are, or why
                  // it is not there yet. Every state right-justifies its value
                  // like every other row, statuses included: one row breaking
                  // the column reads as a fault rather than as a distinction.
                  ...(gridPainted || gridCued || gridFailed
                    ? [
                        {
                          label: gridLegend.label,
                          swatch: (
                            // Colored by state (TJ, 2026-08-21): amber while
                            // the grid is waiting or loading so a stall catches
                            // the eye, red when it failed, and the accent once
                            // the pitch is real. The size is the colorless
                            // CONTROL_SIZE because a color beside
                            // TEXT.control's own would resolve by stylesheet
                            // order.
                            <span
                              className={`${CONTROL_SIZE} ${
                                gridLegend.kind === 'pitch'
                                  ? ACCENT.text
                                  : gridLegend.kind === 'error'
                                    ? STATUS.error
                                    : STATUS.warn
                              } flex-shrink-0`}
                            >
                              {gridLegend.value}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  ...(showRadar
                    ? [
                        {
                          label: 'Rain radar',
                          credit: { href: IEM_HREF, name: 'IEM' },
                          // A gradient rather than banded swatches: NEXRAD's
                          // own reflectivity ramp is continuous, and a legend
                          // that invented boundaries would assert thresholds
                          // Bluebird Forecast does not know.
                          swatch: (
                            <span
                              className={`inline-block h-3.5 w-3.5 flex-shrink-0 ${RADIUS.control} border`}
                              style={{
                                backgroundImage:
                                  'linear-gradient(90deg,#1c8a3c,#40b450,#e7c000,#eb7814)',
                                borderColor: SWATCH_EDGE,
                              }}
                            />
                          ),
                        },
                      ]
                    : []),
                  ...(showSmoke
                    ? [
                        {
                          label: 'Smoke',
                          credit: { href: HMS_HREF, name: 'NOAA' },
                          // One lettered chip per density rather than three
                          // rows. Opacity is the whole encoding here, so the
                          // three chips also read as a ramp side by side,
                          // which they could not do stacked. The letter is
                          // what keeps them nameable at 14px.
                          swatch: (
                            <span className="flex flex-shrink-0 gap-0.5">
                              {SMOKE_DENSITIES.map((density) => (
                                <span
                                  key={density}
                                  className={SWATCH_CHIP}
                                  style={{
                                    backgroundColor: smokeSwatch(density),
                                    borderColor: SMOKE_EDGE,
                                  }}
                                  // A letter is not nameable on sight. The word
                                  // it stands for is the same one the plume
                                  // popup and the layer use, so this names it
                                  // rather than introducing a second
                                  // vocabulary.
                                  title={density}
                                >
                                  {density[0]}
                                </span>
                              ))}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  // Hard-stopped between bands where the metric strip blends,
                  // because those boundaries are NOAA's own classification —
                  // the picture and its key have to agree, which is why both
                  // read `snowDepth.ts`.
                  ...(showSnow
                    ? [
                        {
                          label: SNOW_LABEL,
                          credit: { href: NOHRSC_HREF, name: 'NOHRSC' },
                          ramp: {
                            css: snowRampCss(),
                            ticks: snowTicks(),
                            bands: SNOW_RAMP.length,
                          },
                        },
                      ]
                    : []),
                ]
                  .sort((a, b) => a.label.localeCompare(b.label))
                  .map((section) => (
                    <Fragment key={section.label}>{legendSection(section)}</Fragment>
                  ))}
              </div>
            </div>
          )}
          {/* Top-left map cluster — reopen-controls button (only while the
              panel is collapsed) + place search + Layers. It takes its own
              layer: what these buttons open hangs down across the map's bottom
              chrome and across the sheet, and the layer has to sit on the
              cluster rather than on the popover inside it (see LAYER). It stays
              under the loading overlay and the mobile drawer backdrop. */}
          <div className={`absolute ${MAP_EDGE.top} ${MAP_EDGE.left} ${LAYER.mapControls} flex flex-col items-start ${MAP_COL_GAP}`}>
            {/* The search field is the column's first row rather than a
                neighbour of the Controls button (TJ, 2026-09-14). Beside it,
                the two of them at the column's shared width needed 400px of a
                390px phone; above it, every member of the column is one row
                wide and the column reads as one object at every width.

                Raised above its later siblings so its results paint over the
                buttons below — they are siblings in one cluster, and DOM order
                alone put the buttons on top (#288 review). */}
            <div className="relative z-10">
              <SearchBox ref={searchBoxRef} onSelect={handleSearchSelect} pointed={searchPointed} />
            </div>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open controls"
                className={`${BUTTON_FLOATING} ${MAP_COL_W} ${MAP_ROW_H} flex flex-shrink-0 items-center gap-2 px-2.5`}
              >
                <IconMenu />
                Controls
              </button>
            )}
            {/* Layers, under the search box rather than beside MapLibre's own
                controls on the right. Two reasons it moved: the library's stack
                is two control GROUPS with a margin between them, so any offset
                that clears it is a guess that was already wrong once — and the
                left column is where the app's own map controls live, which
                makes the split legible. Left is ours, right is the library's. */}
            <div ref={layersRef} className="relative">
              <button
                onClick={() => setLayersOpen((o) => !o)}
                aria-expanded={layersOpen}
                className={`${BUTTON_FLOATING} ${MAP_COL_W} ${MAP_ROW_H} flex items-center gap-2 px-2.5`}
              >
                <IconLayers />
                Layers
              </button>
              {/* Zero from the button it hangs under, which is the same edge
                  as `MAP_EDGE.left`: the popover's offset parent is the column,
                  so an inset of its own would be that inset twice and the box
                  would hang a step right of the legends it hangs over. */}
              {layersOpen && (
                <div className={`${SURFACE_POPOVER} ${MAP_COL_W} ${MAP_COL_GAP_T} absolute left-0 px-2.5 py-2`}>
                  {MAP_LAYERS.map((layer) => (
                    <Fragment key={layer.key}>
                      {layerRow(layer)}
                      {/* The grid's sub-choices, revealed by its own checkbox
                          and rendered under the row they belong to rather than
                          after the list, so the alphabetical order above holds
                          whatever is open. The popover is as wide as the legend
                          boxes below it (`MAP_COL_W`), so these take the fluid
                          segment rather than the panel's fixed 144px column —
                          the same reason the results bar's mode switch does.

                          They are ONE block, set off from the list by the same
                          gap on both sides: `mt-1.5` under the checkbox row it
                          belongs to, and `mb-1.5` under the last of them. The
                          slider used to end flush against the next layer's row,
                          so the block read as belonging to that row as much as
                          to the grid's — a group is bounded by its gaps, and
                          one gap bounds nothing. */}
                      {layer.key === 'grid' && gridOn && (
                        <>
                          <div className={`${SEGMENT_FLUID_LIFTED} mt-1.5 w-full`}>
                            {(['blocks', 'smooth'] as GridStyle[]).map((value, i) => (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={gridStyle === value}
                                onClick={() => setGridStyle(value)}
                                className={`${SEGMENT_ITEM} ${
                                  gridStyle === value ? ACCENT.fill : SEGMENT_IDLE
                                } ${i > 0 ? SEGMENT_DIVIDER : ''}`}
                              >
                                {value === 'blocks' ? 'Blocks' : 'Smooth'}
                              </button>
                            ))}
                          </div>
                          {/* The coverage slider: how far from each destination
                              the grid reaches. The value and wordmark render
                              TWICE — muted on the well, white inside the accent
                              fill — with the top copy clipped to the fill, so the
                              line stays readable at any position without a color
                              racing another. Drag previews live (`gridReachDraft`)
                              and commits on release, because each committed value
                              is a refetch and a drag must not fetch per pixel. */}
                          <div
                            className={`relative mt-1.5 mb-1.5 h-6 w-full overflow-hidden ${RADIUS.control} ${LIFTED_EDGE} ${RECESSED_FILL}`}
                          >
                            {(() => {
                              const shown = gridReachDraft ?? gridReachFrac
                              const pct = shown * 100
                              const line = (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2">
                                  <span className={SLIDER_VALUE}>
                                    {pitchLabel(reachKmFor(gridReachPitchKm, shown))}
                                  </span>
                                  <span className={SLIDER_WORDMARK}>Coverage</span>
                                </div>
                              )
                              return (
                                <>
                                  <div className={`absolute inset-0 ${SLIDER_IDLE}`}>{line}</div>
                                  <div
                                    className={`absolute inset-0 ${ACCENT.fill}`}
                                    style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
                                  >
                                    {line}
                                  </div>
                                </>
                              )
                            })()}
                            <input
                              type="range"
                              aria-label="Coverage"
                              min={0}
                              max={100}
                              step={5}
                              value={Math.round((gridReachDraft ?? gridReachFrac) * 100)}
                              onChange={(e) => setGridReachDraft(Number(e.target.value) / 100)}
                              onPointerUp={commitGridReach}
                              onKeyUp={commitGridReach}
                              onBlur={commitGridReach}
                              className={SLIDER_OVERLAY}
                            />
                          </div>
                        </>
                      )}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
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
                        leavingRowKeys={leavingRowKeys}
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
