import {
  Fragment,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import WelcomeModal from './components/WelcomeModal'
import PreviewBanner from './components/PreviewBanner'
import TimelineTransport from './components/TimelineTransport'
import ModelCompare from './components/ModelCompare'
import { useAnalyze } from './hooks/useAnalyze'
import { modelForecastHours, useCapabilities } from './hooks/useCapabilities'
import { useChartSelection } from './hooks/useChartSelection'
import { useModelCompare } from './hooks/useModelCompare'
import { allocateColors } from './utils/chartColors'
import {
  ModelRow,
  compareAdded,
  drawnModelIds,
  modelRowsFor,
  pairColor,
  pairKey,
} from './utils/modelCompare'
import { modelRows, pruneHidden, shownModels, toggleHidden } from './utils/modelVisibility'
import { useFireProximity } from './hooks/useFireProximity'
import { fireKey } from './utils/fireProximity'
import { useForecastGrid } from './hooks/useForecastGrid'
import { useSearchedPlaces } from './hooks/useSearchedPlaces'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import {
  CustomDestination,
  DestinationResult,
  DiscoveryType,
  GeoPolygon,
  HourlySeries,
  SortBy,
} from './types'
import { alignRowToGrid, chartKey } from './utils/chartData'
import { logoUrl } from './logo'
import {
  ACCENT,
  BUTTON_FLOATING,
  CHOICE_INPUT,
  CHOICE_ROW,
  BUTTON_SECONDARY,
  FOCUS_RING,
  ICON,
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
  SURFACE_FLOATING,
  SURFACE_POPOVER,
  SURFACE_SHEET,
  SWATCH_CHIP,
  TAP,
  TEXT,
} from './styles'
import {
  DEFAULT_FAMILY_KEY,
  FAMILY_KEYS,
  MetricFamily,
  NOUN,
  familyOf,
  rankedNoun,
} from './metrics'
import { hourlyScale, rankedScale } from './utils/colors'
import {
  FALLBACK_PITCH_KM,
  GRID_REACH_DEFAULT_FRAC,
  gridAllowed,
  gridLegendLine,
  pitchLabel,
  reachKmFor,
  type GridStyle,
} from './utils/forecastGrid'
import {
  RADAR_FRAME_COUNT,
  IEM_HREF,
  radarOffsetLabel,
  radarOffsets,
  radarScaleEnds,
} from './utils/radar'
import { HMS_HREF, SMOKE_DENSITIES, SMOKE_EDGE, smokeSwatch } from './utils/smoke'
import {
  TimelineAxis,
  availableAxes,
  clampIndex,
  forecastScaleMarks,
  forecastStampLabel,
  frameHoldMs,
  initialIndex,
  nextFrame,
  playerAvailable,
  resolveAxis,
} from './utils/timeline'
import {
  Constraints,
  NO_CONSTRAINTS,
  constraintFields,
  refreshEchoRows,
} from './utils/clientAnalyze'
import { parseCustomCsv } from './utils/customDestinations'
import { buildCustomList, pendingDestinations, pinKey } from './utils/customList'
import { clampPanelHeight, resolvePanelHeights, splitChartTable } from './utils/layout'
import {
  dockedMapFloorPx,
  draggedMapFloorPx,
  legendBottomPx,
  mapCornerLiftPx,
  restingLiftPx,
  restingMapFloorPx,
  resolveSheetLift,
  sheetHeightPx,
  TRANSPORT_GAP_PX,
} from './utils/resultsSheet'
import { composeOverlay } from './utils/analyzeOverlay'
import { Place, isPeakKind } from './utils/geocode'
import {
  DEFAULT_LIMIT,
  DEFAULT_SORT,
  encodeState,
  decodeState,
  classifyWindow,
  clampLimit,
} from './utils/urlState'
import { UrlWriter, debounceUrlWrite, urlNeedsSync } from './utils/urlSync'
import {
  DAY_END,
  DAY_START,
  DEFAULT_SELECTION,
  ForecastSelection,
  clampSelection,
  dayKey,
  selectionLocalWindow,
  windowCaption,
} from './utils/calendar'
import { isPointSample } from './utils/forecastWindow'
import {
  PresentationKnobs,
  commitNeeded,
  discoveryChanges,
  discoveryKeys,
  fieldHasValue,
  presentResults,
} from './utils/present'
import {
  RemovedEntry,
  activeRemovals,
  authoredScope,
  recordRemoval,
  restorePlace,
} from './utils/removals'
import {
  MODEL_KEY,
  SortDir,
  SortKey,
  WILDFIRE_COL,
  WILDFIRE_KEY,
  applyColumnOrder,
  displayedColumns,
  moveColumn,
  visibleColumns,
  withModelColumn,
} from './utils/tableColumns'
import { NAME_DEFAULT_PX } from './utils/columnResize'
import { compareValues } from './utils/sortResults'
import { buildResultsCsv, csvFilename } from './utils/resultsCsv'

// The empty case of `response?.times`, hoisted. `?? []` inside JSX hands a
// memoized child a new array on every render, which is enough to re-render it
// for a state change that has nothing to do with it (#337, finding 8).
const NO_TIMES: number[] = []

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

// Stands in for the analysis snapshot's covered set before the first analysis.
// A module constant rather than an inline `new Set()`, which would be a fresh
// identity on every render and rebuild the pending list underneath the map.
const NO_CUSTOM: ReadonlySet<string> = new Set()

// What the chart draws for its rows while a model comparison is up: nothing,
// because the comparison composes every line itself. A module constant so the
// chart's line memo is not rebuilt by a fresh empty array on every render.
const NO_CHART_ROWS: DestinationResult[] = []

// Opening heights for the two docked panels, and where a double-click on a
// resizer puts them back. A drag is easy to overshoot and there was no way
// back short of dragging until it looked right again.
/**
 * The chart and the table open at the same height, and at the height that
 * leaves the map its whole legend stack.
 *
 * One number for both, because they are two halves of one answer and an 8px
 * difference between them read as a mistake. The value is what Both mode can
 * spend on a 1000px-tall window: 1000 less the docked map floor
 * (`dockedMapFloorPx`, 541 with two grips) is 459, and two panels of 220 fit
 * inside it with the map a few pixels clear of its floor. They were 288 and
 * 280, chosen before the legend stack had a number, and at those heights the
 * bottom of the stack sat under the results bar on exactly this window.
 *
 * Shared with the phone, where the sheet's own floors take over; they are the
 * starting heights either way, and the reader's drag replaces them.
 */
const DEFAULT_PANEL_HEIGHT = 220
const DEFAULT_CHART_HEIGHT = DEFAULT_PANEL_HEIGHT
const DEFAULT_TABLE_HEIGHT = DEFAULT_PANEL_HEIGHT

// How close two presses must be to count as a double-click. The browser's own
// dblclick never arrives on these grips: the resize begins on pointerdown and
// preventDefault plus the drag overlay stop the pair of clicks ever resolving,
// so the gesture is recognised here instead. 350ms is a shade over the usual
// system threshold, which is the right way to miss.
const DOUBLE_PRESS_MS = 350

// Collapse/expand affordance for the bottom panels' header bars.
function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <polyline points={up ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
    </svg>
  )
}

// Live viewport height, so the chart/table panel heights can be re-clamped when
// the window resizes or a phone rotates — otherwise a stale height could let the
// panels crowd the map below its floor after a resize.
function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  )
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return height
}

export default function App() {
  const mapRef = useRef<MapViewHandle>(null)
  const searchBoxRef = useRef<SearchBoxHandle>(null)
  const columnsButtonRef = useRef<HTMLButtonElement>(null)
  const modelsButtonRef = useRef<HTMLButtonElement>(null)
  const removedButtonRef = useRef<HTMLButtonElement>(null)

  // The discovery inputs behind the results currently on screen: `base` covers
  // the user-authored inputs (polygon + types + unnamed peaks + CSV rows) and
  // `searchedKeys` the searched places that competed. An Analyze
  // whose base matches and whose searched list only SHRANK (row removals) skips
  // Overpass and just refreshes the surviving rows' weather; a NEW searched
  // place — which must compete against the full candidate field the refresh
  // echo doesn't have — or any base change forces a fresh discovery.
  const discoveryRef = useRef<{ base: string; searchedKeys: string[] } | null>(null)
  // Remembers each row's real identity (type + osm_id) by coordinate — from
  // discovered rows (which carry an osm_id) and from searched places (whose
  // geocoding knew their kind and OSM id). Rows echoed through the custom path
  // come back as type "custom" with no osm_id; this map restores them so a
  // peak still links to Peakbagger and shows the right badge.
  const identityMapRef = useRef<Map<string, { type: string; osm_id: string | null }>>(new Map())
  // Rows leaving the display due to a live presentation knob: fade them out.
  // Keyed by coordinate. Only populated when the same analysis has rows
  // disappearing — not on initial render or a fresh analysis.
  const [leavingRowKeys, setLeavingRowKeys] = useState<Set<string>>(new Set())
  const lastAnalyzedResultsRef = useRef<DestinationResult[] | null>(null)
  // Rows the user ×-removed from the current report, keyed by coordinate and
  // carrying what a restore needs (#241 — see utils/removals.ts). Scoped
  // to the user-authored discovery inputs (removalScopeRef): removing a row —
  // even a searched place, which shrinks the custom list — must not count as
  // changing them. Only a polygon/type/CSV edit starts a clean slate
  // where removed destinations may legitimately return. Each entry also records
  // the authored scope it was made under, which is what lets the live pending
  // preview expire one between analyses while the report keeps its snapshot.
  const [removed, setRemoved] = useState<Map<string, RemovedEntry>>(new Map())
  // Every key, for the two snapshot consumers: the displayed report and the
  // refresh echo. The preview reads `activeRemovedKeys` instead.
  const removedKeys = useMemo(() => new Set(removed.keys()), [removed])
  const removalScopeRef = useRef<string | null>(null)
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

  // Custom CSV points restored from the URL, parsed once — MapView frames them
  // on load instead of geolocating, mirroring the restored-polygon behavior.
  const restoredCustomPoints = useMemo(
    () => (restored?.customCsv ? parseCustomCsv(restored.customCsv) : []),
    [restored],
  )

  const [polygon, setPolygon] = useState<GeoPolygon | null>(() => restored?.polygon ?? null)
  // Draw mode (#118). The map used to be permanently in it, which is why a
  // pan could move a vertex and why a click could only ever mean "polygon
  // corner". Every session — including one restored from a link with a ring
  // already in it — starts out of it: the common case is looking at the map,
  // not editing it, and leaving the gesture free is what lets a basemap peak
  // be clickable at all (#119).
  const [drawing, setDrawing] = useState(false)
  // A restored polygon seeds the count so Analyze unlocks before the map loads
  // (MapView re-emits the authoritative count+area once its points hydrate).
  const [drawPointCount, setDrawPointCount] = useState(
    () => Math.max(0, (restored?.polygon?.coordinates[0]?.length ?? 1) - 1),
  )
  const [polygonAreaKm2, setPolygonAreaKm2] = useState<number | null>(null)
  // Which kinds the polygon looks for, as a set — several are found in one
  // Overpass query. Nothing is checked by default: discovery is the input
  // that needs a polygon and costs an upstream query, so a fresh session
  // asks for none of it until the user says so.
  const [destinationTypes, setDestinationTypes] = useState<DiscoveryType[]>(
    () => restored?.destinationTypes ?? [],
  )
  // What Analyze asks about: the current hour, or days off the calendar (#166).
  // One value where there used to be four — a mode plus three sets of
  // timestamps, two of them always dormant. Defaults to the current hour: the
  // first question most people arrive with is "where is it clear right now", and
  // it needs no date input, so a fresh load can Analyze without touching Step 2.
  const [selection, setSelection] = useState<ForecastSelection>(
    () => restored?.selection ?? DEFAULT_SELECTION,
  )
  // 200 rather than 100 because the pasted lists people bring are themselves
  // often 100 long (peakbagger exports, the examples/ CSVs). At 100 a list plus
  // anything else — one searched peak, a polygon — spills over the cut on its
  // first analysis, which is what made #205 visible.
  const [limit, setLimit] = useState(() =>
    clampLimit(restored?.limit ?? DEFAULT_LIMIT, caps.maxLimit),
  )
  // The initializer above clamps against the compiled fallback, because at
  // first render that is all useCapabilities has. Re-clamp once the real
  // ceiling lands so a deployment that publishes a lower one is honored on a
  // restored link too. Only ever lowers, so it cannot fight the knob.
  useEffect(() => {
    setLimit((prev) => clampLimit(prev, caps.maxLimit))
  }, [caps.maxLimit])
  // Which model answers. Restored from the link when one names a model, else
  // the deployment's default. Old links carry no `model=` and inherit it, which
  // can change their numbers: they were computed under Open-Meteo's
  // `best_match` blend. That is a release note rather than something to migrate
  // around — the blend never reported which model it picked, so there is no
  // honest way to reproduce those numbers. The named default is the closest
  // thing to a continuation: `best_match` resolved to GFS at Rainier.
  const [forecastModel, setForecastModel] = useState(
    () => restored?.forecastModel ?? caps.defaultForecastModel,
  )
  // Same shape as the limit re-clamp above: the initializer runs against the
  // compiled fallback, so adopt the real default once capabilities land — but
  // only when the link named nothing and the user has not chosen, or this would
  // overwrite a deliberate pick a moment after it was made.
  const untouchedModelRef = useRef(restored?.forecastModel === undefined)
  useEffect(() => {
    if (!untouchedModelRef.current) return
    setForecastModel(caps.defaultForecastModel)
  }, [caps.defaultForecastModel])
  // The extra models the chart draws beside the ranking one (#232), in the
  // published order — the picker normalizes it, so this never holds the
  // ranking model and never holds a duplicate. Panel state rather than chart
  // state: the model picker is where it is chosen, and a comparison is bought
  // by the next Analyze like every other model decision, never on load.
  const [comparedModels, setComparedModels] = useState<string[]>(
    () => restored?.compareModels ?? [],
  )
  // The last model change trimmed the forecast window to fit the new model's
  // reach. Held rather than derived because a clamp leaves no trace: afterwards
  // the selection simply is inside the band, and nothing distinguishes a window
  // that was shortened from one that always fitted.
  const [modelClamped, setModelClamped] = useState(false)
  // Both edges of the servable band, from /api/capabilities: the selected
  // model's reach ahead, and the archive's reach back (#123).
  const band = {
    forecastHours: modelForecastHours(caps.forecastModels, forecastModel),
    pastDays: caps.archiveDays,
  }

  // The window a model clamp took away, held so switching back to a model
  // that can serve it restores it (#242 review). A clamp is the picker
  // editing the user's dates on its own authority; this is the undo. Cleared
  // whenever the user edits the window themselves (their choice supersedes
  // the memory) and once an analysis runs (the report pins the window that
  // was actually asked, and restoring a pre-clamp range after it would
  // silently disagree with what is on screen).
  const preClampSelectionRef = useRef<ForecastSelection | null>(null)

  // Every model change reconsiders the window, because the far edge moves with
  // it — by twelve days between ECMWF and HRRR. Clamping rather than refusing:
  // the alternative rejects the model over a window chosen before the user knew
  // the model bounded it, and leaves them to guess by how much to shorten it.
  function changeForecastModel(id: string) {
    untouchedModelRef.current = false
    // The compared set is not touched here. A model is on the chart once
    // whichever way it got there, and which models are selected is the
    // picker's own answer (`utils/modelSelection.ts`), handed over beside this
    // call rather than recomputed from a state this function cannot see.
    const hours = modelForecastHours(caps.forecastModels, id)
    // A remembered pre-clamp window comes back the moment a model can serve
    // it whole (clampSelection returns null for "fits unchanged").
    const remembered = preClampSelectionRef.current
    // The band as the NEW model leaves it: only the far edge moves with a model.
    const nextBand = { ...band, forecastHours: hours }
    if (remembered && clampSelection(remembered, new Date(), nextBand) === null) {
      preClampSelectionRef.current = null
      setSelection(remembered)
      setModelClamped(false)
      setForecastModel(id)
      return
    }
    const clamped = clampSelection(selection, new Date(), nextBand)
    if (clamped) {
      // Remember the FIRST window in a clamp chain: stepping HRRR → ICON →
      // GFS should restore the range the user picked, not the wreckage of
      // the intermediate clamp.
      if (preClampSelectionRef.current === null) preClampSelectionRef.current = selection
      setSelection(clamped)
    }
    setModelClamped(clamped !== null)
    setForecastModel(id)
  }

  // Any deliberate move of the window retires the clamp notice — it describes
  // one past edit, and leaving it up would attribute the user's own choice to
  // the model picker — and the pre-clamp memory with it, for the same reason.
  function changeSelection(next: ForecastSelection) {
    preClampSelectionRef.current = null
    setModelClamped(false)
    setSelection(next)
  }

  const [customCsv, setCustomCsv] = useState(() => restored?.customCsv ?? '')
  // Parsed once per edit and shared by the pending markers and the Analyze
  // request, so what the map shows and what gets ranked can't drift apart.
  const csvRows = useMemo(() => parseCustomCsv(customCsv), [customCsv])
  // The destination inputs the user authored, in one spelling: the removal
  // reset reads it (folding the polygon ring in) and so does every removal
  // recorded while these inputs stand, so the two cannot drift apart.
  const destinationScope = useMemo(
    () => authoredScope(destinationTypes, customCsv),
    [destinationTypes, customCsv],
  )
  const [sortBy, setSortByRaw] = useState<SortBy>(() => restored?.sortBy ?? DEFAULT_SORT)
  const [sortDesc, setSortDesc] = useState(() => restored?.sortDesc ?? false)
  // What each metric row's aggregate dropdown holds (#291), the active row's
  // entry always equal to sortBy. One state for every row because a
  // dropdown choice IS a ranking choice — picking an aggregate activates its
  // row, the same one-click contract the direction toggle has always kept —
  // so the two could only ever disagree by a missed update.
  const [rowKeys, setRowKeys] = useState<Record<MetricFamily, SortBy>>(
    () => restored?.rowKeys ?? { ...DEFAULT_FAMILY_KEY },
  )
  const setSortBy = useCallback((key: SortBy) => {
    setSortByRaw(key)
    setRowKeys((rows) => (rows[familyOf(key)] === key ? rows : { ...rows, [familyOf(key)]: key }))
  }, [])
  // The forecast bounds (#115). None of them can gate a fetch — nothing knows
  // a destination's precipitation before it has
  // been fetched — so they are pure presentation and every one of them applies
  // live, loosening as well as tightening.
  const [constraints, setConstraints] = useState<Constraints>(
    () => restored?.constraints ?? NO_CONSTRAINTS,
  )
  // A live map overlay, not part of the analyze request, but persisted to the
  // URL so a shared link reproduces it. Defaults off; toggling queries NIFC for
  // the current viewport.
  const [showWildfires, setShowWildfires] = useState(() => restored?.showWildfires ?? false)
  // The two overlays #121 adds, on the same contract: live, off by default,
  // persisted to the URL, and never an input to the ranking. Radar is raster
  // tiles the browser fetches straight from IEM; smoke is one national GeoJSON
  // from the pod.
  const [showRadar, setShowRadar] = useState(() => restored?.showRadar ?? false)
  const [showSmoke, setShowSmoke] = useState(() => restored?.showSmoke ?? false)
  // The forecast grid (#246), on the same contract as the three above with one
  // difference worth naming: this toggle is a spend boundary. Turning it on is
  // what fetches a lattice of forecasts over the analyzed field, and leaving it
  // on is standing consent for the next analysis to do the same. It still
  // changes nothing about the ranking, so it never touches `commitNeeded`.
  const [showGrid, setShowGrid] = useState(() => restored?.showGrid ?? false)
  // Whether the forecast player is on the map. `null` means "this device's
  // default": on at a desktop width, off on a phone, where the bar is a band
  // across a map that can be a third of the screen. A boolean means the reader
  // has decided, and only a decision reaches the URL — in either direction, so
  // a link can carry the player onto a phone or off a desktop.
  //
  // Not a knob. Switching it changes what is looked at and nothing about what
  // was asked for: no ranking moves, nothing is fetched, and `commitNeeded`
  // does not know it exists.
  const [showPlayer, setShowPlayer] = useState<boolean | null>(() => restored?.showPlayer ?? null)
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
  // Which drawing the grid's samples get. Blocks by default: it is the style
  // that cannot overstate what was sampled, since one square is one forecast
  // and a reader can count them. Purely presentation over held samples, so
  // switching costs one re-render and nothing upstream.
  const [gridStyle, setGridStyle] = useState<GridStyle>(() => restored?.gridStyle ?? 'blocks')
  // The coverage slider's committed BAR POSITION in [0, 1] — the kilometres
  // derive from the model's pitch, so the position means the same thing on
  // every model. Changing it re-grids on its own — the layer fetches for
  // itself the way toggling it on does — so this is an overlay property,
  // never a knob: commitNeeded does not know it exists.
  const [gridReachFrac, setGridReachFrac] = useState<number>(
    () => restored?.gridReachFrac ?? GRID_REACH_DEFAULT_FRAC,
  )
  // The slider's live position while a drag is in flight, or null at rest.
  // Displaying the draft and committing on release is what keeps a drag from
  // refetching the lattice per pixel.
  const [gridReachDraft, setGridReachDraft] = useState<number | null>(null)
  const commitGridReach = useCallback(() => {
    if (gridReachDraft !== null) {
      setGridReachFrac(gridReachDraft)
      setGridReachDraft(null)
    }
  }, [gridReachDraft])
  // Summits OSM knows only by their height. Off by default: measured over one
  // 8x10 km box in the Alpine Lakes, 7 peaks are named and 13 are not, so
  // this roughly triples what an analysis costs and how often it refuses.
  const [includeUnnamedPeaks, setIncludeUnnamedPeaks] = useState(
    () => restored?.includeUnnamedPeaks ?? false,
  )
  const [showResults, setShowResults] = useState(false)
  // The heights both panels open at, and the ones a double-click on either
  // resizer restores. Named rather than inline because a reset that hard-coded
  // its own numbers would be a second opinion about what "default" means.
  const [tableHeight, setTableHeight] = useState(DEFAULT_TABLE_HEIGHT)
  const [chartHeight, setChartHeight] = useState(DEFAULT_CHART_HEIGHT)
  // Which views the results area shows: chart-only, table-only, or both. The
  // mode is always honored literally — a mode with nothing to draw yet shows
  // its empty panel rather than quietly displaying a different one, or the
  // segment reads as broken (#242 review: it sat on Chart while the table
  // showed, and clicking did nothing visible).
  //
  // Everyone opens on Table; a desktop-width window widens to Both when an
  // analysis lands (the effect below). Only an EXPLICIT press on the segment
  // persists, under `modeChosen`: the old code stored every mode change, so
  // the automatic default wrote itself back as if the user had picked it and
  // then beat the desktop widening forever. The stale `mode` field from that
  // code is deliberately ignored for the same reason — nothing in it says
  // whether the user ever actually chose.
  type ResultsMode = 'chart' | 'table' | 'both'
  const modeChosenRef = useRef(false)
  const [resultsMode, setResultsMode] = useState<ResultsMode>(() => {
    if (typeof localStorage === 'undefined') return 'table'
    try {
      const stored = JSON.parse(localStorage.getItem('bluebird_forecast_view') ?? '{}')
      if (stored.modeChosen === 'chart' || stored.modeChosen === 'table' || stored.modeChosen === 'both') {
        modeChosenRef.current = true
        return stored.modeChosen
      }
    } catch {
      // Ignore localStorage errors (SSR, quota, etc.)
    }
    return 'table'
  })
  // An intentional press on the segment: sticks for the session and persists.
  function chooseResultsMode(mode: ResultsMode) {
    modeChosenRef.current = true
    setResultsMode(mode)
    try {
      const current = JSON.parse(localStorage.getItem('bluebird_forecast_view') ?? '{}')
      localStorage.setItem('bluebird_forecast_view', JSON.stringify({ ...current, modeChosen: mode }))
    } catch {
      // Ignore localStorage errors (SSR, quota, etc.)
    }
  }
  // Which columns the table displays (null = use default narrowed set, Set = user choice).
  // The CSV export always gets the full displayedColumns set regardless.
  const [columnVisibility, setColumnVisibility] = useState<Set<string> | null>(() => {
    if (typeof localStorage === 'undefined') return null
    try {
      const stored = JSON.parse(localStorage.getItem('bluebird_forecast_view') ?? '{}')
      // One key per generation of the column set, because a stored set cannot
      // otherwise be told apart from a deliberate choice to hide the newest
      // column: `columns` predates the wildfire column joining the picker
      // (#288) and `columns2` predates the freezing level (#295), so reading
      // either verbatim would hide a new column from everyone who has ever
      // touched the picker. Each migrates with the new keys added, which is
      // what those users were already seeing.
      if (stored.columns3) return new Set(stored.columns3)
      if (stored.columns2) return new Set([...stored.columns2, ...FAMILY_KEYS.freeze])
      if (stored.columns)
        return new Set([...stored.columns, WILDFIRE_KEY, ...FAMILY_KEYS.freeze])
    } catch {
      // Ignore localStorage errors
    }
    return null
  })
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
  const [modelColumn, setModelColumn] = useState<boolean | null>(() => {
    if (typeof localStorage === 'undefined') return null
    try {
      const stored = JSON.parse(localStorage.getItem('bluebird_forecast_view') ?? '{}')
      return typeof stored.modelColumn === 'boolean' ? stored.modelColumn : null
    } catch {
      return null
    }
  })

  // The order the reader dragged the columns into, or null for the automatic
  // one (#360). A list of keys rather than positions, so a column the list
  // predates keeps its place instead of vanishing; `applyColumnOrder` owns that
  // rule.
  //
  // It is discarded whenever the ranking changes (TJ, 2026-09-14): `Rank by`
  // pulls the ranked metric group to the front, and the maintainer chose to let
  // it win rather than have a stored order suppress the one thing the ranking
  // does to the columns.
  const [columnOrder, setColumnOrder] = useState<readonly string[] | null>(() => {
    if (typeof localStorage === 'undefined') return null
    try {
      const stored = JSON.parse(localStorage.getItem('bluebird_forecast_view') ?? '{}')
      return Array.isArray(stored.columnOrder) ? stored.columnOrder : null
    } catch {
      return null
    }
  })

  // Persist column visibility to localStorage when it changes.
  useEffect(() => {
    try {
      const current = JSON.parse(localStorage.getItem('bluebird_forecast_view') ?? '{}')
      delete current.columns
      delete current.columns2
      localStorage.setItem(
        'bluebird_forecast_view',
        JSON.stringify({
          ...current,
          columns3: columnVisibility ? [...columnVisibility] : undefined,
          // Absent rather than null while the reader has not answered, so the
          // count still decides after a reload.
          modelColumn: modelColumn ?? undefined,
          columnOrder: columnOrder ?? undefined,
        }),
      )
    } catch {
      // Ignore localStorage errors (SSR, quota, etc.)
    }
  }, [columnVisibility, modelColumn, columnOrder])
  // Column picker popover open/closed
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  // Models whose lines the reader has put down (#232). Presentation and
  // nothing else: the forecasts behind them are bought either way, so this
  // rides in no link and no storage, and a reload comes back showing
  // everything the comparison paid for.
  const [hiddenModels, setHiddenModels] = useState<ReadonlySet<string>>(() => new Set())
  const [removedOpen, setRemovedOpen] = useState(false)
  // Column widths the user has set (px by key). Held here rather than in the
  // table so a mode switch or the collapse chevron — both of which unmount
  // the table — cannot reset them. Session-only by design: a width is a
  // reading posture, not a preference. Name opens at the measured
  // 25-character width and everything else natural.
  const [tableColWidths, setTableColWidths] = useState<Record<string, number>>({
    name: NAME_DEFAULT_PX,
  })
  // Chevron to collapse/expand the entire results area.
  const [resultsCollapsed, setResultsCollapsed] = useState(false)
  // The results' own height as rendered, which on a phone is how much map the
  // sheet covers. Observed rather than derived because everything anchored to
  // the map's bottom edge measures from this one number, and a derivation has
  // to guess a header bar whose height depends on the pointer and on what the
  // bar is carrying. `null` until the first observation, and while the results
  // are docked, where the number means nothing.
  const [sheetMeasuredPx, setSheetMeasuredPx] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Whether the reader has set a panel height themselves. It only matters on a
  // phone, where the results are a sheet standing on the map (#249): until they
  // drag, the sheet rests low enough for the whole legend stack to fit above it,
  // and a drag hands the height over — the legends then scroll, the way they do
  // on any map too short for them. A double press on a grip means "put it back",
  // so it returns the resting height with the rest of the default.
  const [heightsChosen, setHeightsChosen] = useState(false)
  // When each grip was last pressed, keyed by which one. A double press resets
  // that grip's own panel — the chart resizer restores the chart, the table
  // resizer the table — rather than both, since a drag only ever moved one.
  const lastGripPressRef = useRef<Record<string, number>>({})

  function isDoublePress(grip: string, at: number): boolean {
    const previous = lastGripPressRef.current[grip] ?? 0
    lastGripPressRef.current[grip] = at
    return at - previous < DOUBLE_PRESS_MS
  }
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('bluebird_forecast_welcomed'))
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
  // Whether the player is on the map: the reader's decision where they have made
  // one, this device's default otherwise.
  const playerShown = showPlayer ?? isDesktop

  function dismissWelcome() {
    localStorage.setItem('bluebird_forecast_welcomed', '1')
    setShowWelcome(false)
  }

  // Pointer-driven vertical resize, shared by mouse and touch (Pointer Events)
  // and by both breakpoints. `onDrag` receives the drag distance with up
  // positive; the handles below feed it the map│chart or chart│table geometry.
  function beginResize(e: React.PointerEvent, onDrag: (dragUpPx: number) => void) {
    e.preventDefault()
    const startY = e.clientY
    setIsDragging(true)
    setHeightsChosen(true)

    function onMove(ev: PointerEvent) {
      onDrag(startY - ev.clientY)
    }

    function onUp() {
      setIsDragging(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
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
    paceEndMs,
  } = useAnalyze(caps.maxDestinations, caps.forecastModels)

  // Places searched by name — the third destination input. Searching registers
  // the place (map dot + URL persistence); its forecast joins the next Analyze,
  // where the list folds into the ranked request alongside the CSV.
  const searched = useSearchedPlaces()

  // Repopulate searched places restored from the URL, once at mount. They show
  // as pending dots until the user runs an Analyze — nothing fetches on load.
  useEffect(() => {
    if (restored?.pins?.length) searched.restore(restored.pins)
    // Kept: `searched` is a fresh object every render, so a complete list would
    // re-seed the pins over whatever the reader has added since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Registering a destination the user named, however they named it: by
  // searching, or by clicking a labeled peak or lake on the basemap (#119).
  // Both land in the same list, so both go through here.
  const registerPlace = useCallback((place: Place) => {
    searched.addPlace(place)
    // Re-naming a previously ×-removed spot is an explicit re-request — drop
    // the stale removal so the place isn't filtered out of its next report.
    setRemoved((prev) => {
      const key = pinKey(place.lat, place.lon)
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    // Kept: the only value read is `searched.addPlace`, and `useSearchedPlaces`
    // rebuilds it every render, so listing it would hand a new `registerPlace`
    // to the memoized map on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const handleRemovePoi = useCallback((latitude: number, longitude: number) => {
    searched.removePlace(latitude, longitude)
    // Kept for the reason `registerPlace` above keeps its own: `searched` is
    // rebuilt every render, and this handler is a prop of the memoized map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Naming a destination — by search or by pasting CSV — opens the results
  // panel immediately: it appears as an un-forecasted row, so there's feedback
  // before any analysis runs. Read off the inputs rather than the derived
  // `pending` list, which is declared further down.
  //
  // The DEPENDENCY is the fact, never the two lists. `csvRows` is a fresh array
  // per keystroke, so an effect keyed on it runs per character and calls
  // setShowResults(true) against a panel that is already open. React skips a
  // same-value setState only while the fiber has no work pending, which a
  // typing hand never leaves it, so each of those no-op calls schedules a real
  // update from inside a passive effect. Fifty in a row is React error #185,
  // which is what a pasted coordinate list used to produce (issue #185;
  // measured at the 61st character, the first ten being the row yet to parse).
  // `src/App.test.ts` fails any effect here that takes `csvRows` again.
  const destinationNamed = searched.places.length > 0 || csvRows.length > 0
  useEffect(() => {
    if (destinationNamed) setShowResults(true)
  }, [destinationNamed])

  // The selection resolved to the datetime-local pair the rest of the app reads:
  // the horizon and air-quality warnings, the staleness comparison below, and the
  // ISO conversion in handleAnalyze. Recomputed per render rather than memoized,
  // since for the current-hour selection it moves with the clock.
  const panelWindow = selectionLocalWindow(selection, new Date())
  // A dateless Dates arm has no window (Analyze is blocked on it), but the
  // display still needs a shape — column regime, captions — so it borrows a
  // whole-day span. Never analyzed: handleAnalyze re-reads the selection and
  // refuses a null window.
  const panelWindowMs = panelWindow
    ? { startMs: Date.parse(panelWindow.start), endMs: Date.parse(panelWindow.end) }
    : {
        startMs: Date.parse(`${dayKey(new Date())}T${DAY_START}`),
        endMs: Date.parse(`${dayKey(new Date())}T${DAY_END}`),
      }

  // The knobs the displayed report is rendered under: markers, legend, results
  // header, and table column order all read from here.
  //
  // With a field held, the panel's ranking IS the displayed ranking — the rows
  // below are re-derived from it on every change, so reading the snapshot here
  // would show a legend that disagreed with the table. The window stays
  // from the snapshot either way: it is a data knob, and a point sample cannot
  // become a range without a new analysis. Before the first analysis there is
  // no field and nothing to disagree with.
  const liveKnobs: PresentationKnobs = useMemo(
    () => ({
      sortBy,
      sortDesc,
      limit,
      constraints,
    }),
    [sortBy, sortDesc, limit, constraints],
  )
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
  // Which endpoint answered the report on screen, for the surfaces that name
  // the wind's datum (#361): the table's headers, the file's, the Columns
  // picker's and a marker's popup. Read off the analysed snapshot rather than
  // the panel's selection, because these describe numbers already fetched — a
  // panel moved since is a stale question, not a relabel. Null until the first
  // analysis, which is one of the two states with no datum to name.
  const windDatumSource = analyzed?.windowSource ?? null
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
  // The forecast window is a data knob: the browser holds no forecasts for days
  // it never fetched, so a calendar change cannot re-present anything. Comparing
  // it at all is new with the calendar, and is the reason to: picking days is a
  // click now, so a report can go stale while the panel looks settled, where
  // before it took typing two datetimes.
  //
  // The current hour is exempt, since its window moves with the clock and a cue
  // that never cleared would ask for an Analyze whose answer is already on
  // screen. Switching between the two arms still counts.
  const windowChanged =
    analyzed !== null &&
    (analyzed.kind !== selection.kind ||
      (selection.kind === 'days' &&
        (analyzed.window.startMs !== panelWindowMs.startMs ||
          analyzed.window.endMs !== panelWindowMs.endMs)))
  // A model change is a data knob for a stronger reason than the window: the
  // held rows are not missing days, every number in them came from a model the
  // panel no longer names.
  // A newly ticked comparison rides the same reason: it is the model row of the
  // panel disagreeing with the model behind the rows, and the browser holds no
  // forecasts for a model it never bought. Unticking one is not a change of this
  // kind — its line is drawn from numbers already in hand, so it stops at once.
  const modelChanged =
    analyzed !== null &&
    (analyzed.forecastModel !== forecastModel ||
      compareAdded(analyzed.compareModels, comparedModels))
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
    // Live countdown while the client pacer sleeps off a quota deficit; the
    // 250ms elapsed ticker below keeps this recomputing.
    paceRemainingS:
      paceEndMs !== null ? Math.max(0, Math.ceil((paceEndMs - Date.now()) / 1000)) : null,
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
      showGrid,
      showPlayer,
      gridStyle,
      gridReachFrac,
      pins: searched.places,
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
    // `forecastModel` and `caps.defaultForecastModel` belong here because
    // `encodeState` reads both: the model writes to the URL only when it
    // differs from the published default. They were missing, so a model change
    // with no other edit left the address bar on the old model and a link
    // copied at that moment shared it (#292).
  }, [
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    selection,
    forecastModel,
    caps.defaultForecastModel,
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
    showGrid,
    showPlayer,
    gridStyle,
    gridReachFrac,
    searched.places,
    writeUrl,
  ])

  // Unmount is the one moment a queued write cannot wait out its delay, so it
  // is the one moment worth flushing. Empty deps keep it to unmount only: the
  // sync effect above must not flush, or the debounce collapses nothing.
  useEffect(() => () => writeUrl.flush(), [writeUrl])

  // Warn when the selection falls outside Open-Meteo's servable range, or its
  // narrowed hours run backwards. Blocks Analyze (in ControlPanel): Open-Meteo
  // rejects out-of-range dates outright, so submitting would only produce an
  // upstream error. The calendar cannot pick an unservable day, so a horizon
  // warning now means a shared or hand-edited link brought one in.
  const windowStatus = panelWindow
    ? classifyWindow(panelWindow.start, panelWindow.end, new Date(), band)
    : // No dates picked yet: nothing to warn about, the dates blocker owns it.
      'ok'
  const windowWarning =
    selection.kind === 'now' || windowStatus === 'ok' ? null : windowStatus

  const handleDrawUpdate = useCallback((count: number, areaKm2: number | null) => {
    setDrawPointCount(count)
    setPolygonAreaKm2(areaKm2)
  }, [])

  function handleCancelDrawing() {
    mapRef.current?.cancelDrawing()
    setDrawing(false)
    // cancelDrawing fires onDrawUpdate(0, null) to reset counts
  }

  // Enter and Escape both leave draw mode. Neither discards anything: every
  // edit is already committed to the polygon (and to the URL) as it happens,
  // so there is no pending state for a cancel to roll back — Clear is the
  // control that throws a ring away. Escape is here because it is what a hand
  // reaches for to get out of a mode, not because it means something different
  // from Done. Enter shares Done's 3-point floor — it means "the ring is
  // finished", which two points cannot be — while Escape stays an
  // unconditional way out of the mode.
  useEffect(() => {
    if (!drawing) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      // Not while the user is in the CSV box or a number field, where Enter
      // and Escape belong to the control they are typing into.
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter' && drawPointCount < 3) return
      setDrawing(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawing, drawPointCount])


  // The user-authored discovery inputs as a stable string. Everything that
  // changes which destinations are FOUND belongs here — the CSV as parsed rows
  // (a comment or whitespace edit doesn't needlessly bust the refresh) but NOT
  // the searched places, which are compared separately so removals stay
  // refresh-eligible.
  //
  // Nothing that only re-presents the held field belongs here. Ranking, the
  // cap and every bound are read off rows the browser already holds (#188), so
  // none of them reaches this function and none of them re-buys a discovery.
  function discoveryBase(poly: GeoPolygon | null, csvRows: CustomDestination[]): string {
    return JSON.stringify({
      ring: poly?.coordinates[0] ?? null,
      // Sorted so checking peaks then lakes and lakes then peaks are the
      // same discovery, matching the order-independent cache key upstream.
      types: [...destinationTypes].sort(),
      unnamed: includeUnnamedPeaks,
      csv: csvRows,
    })
  }

  async function handleAnalyze() {
    // Analyzing is the end of drawing. Leaving the mode on would put the map
    // back in the state #118 describes — reading a result and panning around
    // it while every click still adds a vertex.
    setDrawing(false)
    // The report pins the window that was actually asked; a pre-clamp range
    // restored after this would silently disagree with it.
    preClampSelectionRef.current = null

    // The one conversion from a local selection to the UTC instants the API
    // takes. Equal timestamps are how a point sample travels — the current hour,
    // or a day narrowed to a single hour — and the backend normalizes them to
    // the hour containing the moment.
    const kind = selection.kind
    const local = selectionLocalWindow(selection, new Date())
    // Unreachable through the UI (the dates blocker disables Analyze), kept as
    // the honest backstop: a dateless selection has nothing to fetch.
    if (local === null) return
    const start = new Date(local.start).toISOString()
    const end = new Date(local.end).toISOString()

    // Every bound the request carries. They stay on it because it is the same
    // shape POST /api/analyze documents for direct callers, but the browser
    // holds the field and applies them live, so they go unused here. The
    // elevation band is the one the app no longer sends at all (#341); the API
    // still accepts it from a direct caller.
    const bounds = constraintFields(constraints)

    // Resolve the ranked inputs first. The custom side of the analysis is the
    // pasted CSV ∪ the searched places — with a *complete* polygon (>= 3
    // points) the backend unions discovery in too. An incomplete ring is
    // ignored so a mid-draw Analyze doesn't fire a bogus discovery.
    // finishDrawing() snapshots the map's always-editable ring synchronously
    // (and closes it), falling back to the restored polygon before the map has
    // loaded.
    const custom = buildCustomList(csvRows, searched.places)
    const resolvedPolygon =
      drawPointCount >= 3 ? mapRef.current?.finishDrawing() ?? polygon : null

    // Reset the removal set only when the user changed a discovery input —
    // searched places are deliberately absent (their list shrinks on removal).
    //
    // A re-analysis extends the held field rather than rebuilding it, so the
    // rows a user struck out stay struck out. Losing them to anything short of
    // a genuine discovery change would be an unexplained edit of their work.
    const removalScope = JSON.stringify({
      ring: resolvedPolygon?.coordinates[0] ?? null,
      // The ring is this comparison's alone: it resolves only here, and it
      // never names a pending destination, which is what the shared scope
      // serves.
      authored: destinationScope,
    })
    if (removalScopeRef.current !== removalScope) {
      removalScopeRef.current = removalScope
      setRemoved(new Map())
    }

    // A polygon run whose base inputs are unchanged, with results still on
    // screen, is a pure refresh: skip Overpass and refetch just those
    // destinations' weather through the custom path. A SHRUNK searched list is
    // refresh-compatible too — the departed rows are already gone from the
    // displayed report the refresh echoes. Any base change or NEW searched
    // place (which must compete against the full candidate field) falls
    // through to a fresh discovery.
    const base = discoveryBase(resolvedPolygon, csvRows)
    const searchedKeys = searched.places.map((p) => pinKey(p.lat, p.lon))
    const prev = discoveryRef.current
    const isRefresh =
      resolvedPolygon !== null &&
      response !== null &&
      response.results.length > 0 &&
      prev !== null &&
      prev.base === base &&
      searchedKeys.every((k) => prev.searchedKeys.includes(k))

    const willRank = resolvedPolygon !== null || custom.length > 0

    // Before the await, not after it. The analysis now publishes ranked rows
    // as each batch lands (#337, finding 2), and a results area that opens
    // only once the whole run returns would hide every one of them until the
    // end, which is the thing that change exists to fix.
    if (willRank) setShowResults(true)

    if (isRefresh && response) {
      // Refresh: weather-only over the known destinations (no Overpass). They
      // come back as type "custom" with no osm_id; the results memo restores
      // each row's real identity by coordinate.
      //
      // The echo is the FULL analyzed field, not the displayed rows. A window
      // change lands here (discoveryBase deliberately omits the window), and
      // re-ranking only the last cut's survivors ranked 10 of 851 candidates:
      // fast, silent, and wrong (#177). Exactness costs a real refetch of the
      // whole field at the new window — the same price the first Analyze paid,
      // minus Overpass — which the progress bar and pace countdown narrate.
      // Record the shrunk searched list so re-adding one of these places later
      // reads as an addition (fresh run), not a refresh that would skip it.
      discoveryRef.current = { base, searchedKeys }
      await analyze({
        destination_types: [],
        start_datetime: start,
        end_datetime: end,
        forecast_model: forecastModel,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        custom_destinations: refreshEchoRows(universe, results, removedKeys),
        ...bounds,
      // The identity this refresh answers for is the polygon discovery it
      // echoes, not the custom-shaped request it rides on: derived from the
      // request, the snapshot would say "no ring searched" and the panel's
      // unchanged polygon would falsely cue as new.
      }, kind, {
        discovery: discoveryKeys(resolvedPolygon, destinationTypes, includeUnnamedPeaks),
        compareModels: comparedModels,
      })
    } else if (resolvedPolygon) {
      // Discovery — with the custom list riding along so the backend ranks the
      // polygon ∪ CSV union as one report.
      await analyze({
        polygon: resolvedPolygon,
        destination_types: destinationTypes,
        include_unnamed_peaks: includeUnnamedPeaks,
        start_datetime: start,
        end_datetime: end,
        forecast_model: forecastModel,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        ...(custom.length > 0 ? { custom_destinations: custom } : {}),
        ...bounds,
      }, kind, { compareModels: comparedModels })
      // Remember these discovery inputs so the next compatible Analyze refreshes.
      discoveryRef.current = { base, searchedKeys }
    } else if (custom.length > 0) {
      // Custom-only (CSV and/or searched places). Not a refreshable polygon
      // discovery — clear the record so a later identical polygon Analyze
      // can't mistake these rows for that polygon's discovered set.
      discoveryRef.current = null
      await analyze({
        destination_types: [],
        start_datetime: start,
        end_datetime: end,
        forecast_model: forecastModel,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        custom_destinations: custom,
        ...bounds,
      }, kind, { compareModels: comparedModels })
    }

    // Nothing to rank (unreachable through the gate, which requires an input,
    // but kept as a safety net): drop any stale report.
    if (!willRank) reset()

    setShowResults(true)
  }

  // Record every discovered row's OSM identity (rows that carry an osm_id) so a
  // later refresh — which comes back through the custom path with osm_id null —
  // can have its identity restored below. Runs after each response lands.
  //
  // Registers the whole analyzed field, not only the displayed rows: the refresh
  // echoes the universe (#177), so a destination that ranked below the last cut
  // can surface in the next report and would otherwise come back permanently
  // identity-less (no peak link, wrong marker type).
  useEffect(() => {
    const rows = universe ?? response?.results
    if (!rows) return
    for (const r of rows) {
      if (r.osm_id) identityMapRef.current.set(pinKey(r.latitude, r.longitude), { type: r.type, osm_id: r.osm_id })
    }
  }, [response, universe])

  // Searched places know more than the custom echo carries: their geocoded
  // kind (peak vs not) and OSM id. Seed those identities so their ranked rows
  // link where the feature belongs.
  useEffect(() => {
    for (const p of searched.places) {
      identityMapRef.current.set(pinKey(p.lat, p.lon), {
        // The geocoder's own word for the thing, so the table's Type column
        // says what a place actually is — a searched city reads "City" rather
        // than "Custom", which is a statement about how it got here rather
        // than about what it is. Peaks normalize (OSM says "volcano" for
        // several) because the Peakbagger link keys on that one value;
        // everything else is carried through. "custom" stays the fallback for
        // a pasted coordinate, which genuinely has no kind.
        type: isPeakKind(p.kind) ? 'peak' : p.kind || 'custom',
        osm_id: p.osmId ?? null,
      })
    }
  }, [searched.places])

  // The displayed report, re-derived from the held field on every knob change
  // (#188). presentResults owns the whole decision — band, removals, ranking,
  // cut — so the table, the markers, and the count cannot disagree about which
  // rows are on screen.
  //
  // Rows returned without an osm_id (a refresh's custom echo) are re-tagged from
  // the remembered discovery identities by coordinate; genuine custom-CSV rows
  // simply have no match and pass through unchanged.
  const presented = useMemo(
    () => presentResults(universe, liveKnobs, removedKeys),
    [universe, liveKnobs, removedKeys],
  )
  const results = useMemo(
    () =>
      presented.rows.map((r) => {
        if (r.osm_id) return r
        const id = identityMapRef.current.get(pinKey(r.latitude, r.longitude))
        return id ? { ...r, type: id.type, osm_id: id.osm_id } : r
      }),
    [presented],
  )

  // The window the displayed rows describe, or null when nothing is displayed.
  // Lifted out of the header's JSX because the same string is both the line and
  // its own tooltip: a narrow panel ellipsizes it, and a truncated date range
  // that cannot be recovered is worse than no date range at all.
  const windowTitle =
    results.length > 0 && analyzed !== null
      ? windowCaption(analyzed.kind, analyzed.window.startMs, analyzed.window.endMs, pointSample)
      : null

  // Detect rows leaving display via live presentation knobs (not fresh analysis).
  // Only fires when analyzed is stable and results change — i.e., a live knob
  // hid rows. No animation on initial render or fresh analysis.
  useEffect(() => {
    if (analyzed === null) {
      setLeavingRowKeys(new Set())
      return
    }
    const prevKeys = new Set(
      (lastAnalyzedResultsRef.current ?? []).map((r) => pinKey(r.latitude, r.longitude)),
    )
    const currKeys = new Set(results.map((r) => pinKey(r.latitude, r.longitude)))
    const leaving = new Set<string>()
    for (const key of prevKeys) {
      if (!currKeys.has(key)) leaving.add(key)
    }
    setLeavingRowKeys(leaving)
    lastAnalyzedResultsRef.current = results
  }, [results, analyzed])

  // The detail-column sort, held here rather than inside ResultsTable (#125).
  //
  // Clicking one of the ranking columns re-cuts the whole field through
  // the panel knob and is already answered by `results` above. Clicking any
  // other column is a reading aid: it reorders the rows on screen without
  // changing which rows they are. That order used to be private to the table,
  // which made the table the only thing that knew what it was showing —
  // tolerable while nothing else needed the answer, and wrong the moment a
  // download had to leave in the order on screen.
  //
  // The pair below is therefore two arrays, not one, and the difference
  // matters: `results` stays in ranking order for the markers, the legend, the
  // fire lookup and the chart's default selection, while `tableRows` is what
  // the table draws and what the CSV writes. Handing `tableRows` to the map
  // would quietly make the markers follow a detail sort, and the types would
  // not complain.
  const [detailSort, setDetailSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: sortBy,
    dir: sortDesc ? 'desc' : 'asc',
  })

  // Follow the ranking: on a new report, and on a live ranking change, drop any
  // detail-column sort and read in the order the rows arrived in.
  //
  // Keyed on the report rather than on the rows, which are a new array on every
  // live cap or bound change and would otherwise throw away a sort the
  // user just asked for.
  useEffect(() => {
    setDetailSort({ key: view.sortBy, dir: view.sortDesc ? 'desc' : 'asc' })
  }, [view.sortBy, view.sortDesc, analysisSeq])

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
  const csvColumns = useMemo(
    () => displayedColumns(pointSample, view.sortBy, windDatumSource),
    [pointSample, view.sortBy, windDatumSource],
  )
  // Every column is on by default — the table scrolls sideways rather than
  // opening narrowed (TJ's call in the #242 review). A stored choice from the
  // Columns picker still wins; null means "all of them".
  const effectiveVisibleKeys = useMemo(() => {
    if (columnVisibility !== null) return columnVisibility
    return new Set([...csvColumns.map((c) => c.key as string), WILDFIRE_KEY])
  }, [columnVisibility, csvColumns])

  // × on a table row. Removing a searched place also deregisters it — else the
  // next analysis would simply rediscover it from the searched list. The
  // backing place is captured first, so a restore can re-register it.
  // Stable identities for the table's callbacks, for the reason `NO_TIMES`
  // exists: an inline arrow is a new prop on every render.
  const handleDetailSort = useCallback(
    (key: SortKey, dir: SortDir) => setDetailSort({ key, dir }),
    [],
  )
  const handleRemovePending = useCallback(
    (d: { latitude: number; longitude: number }) =>
      searched.removePlace(d.latitude, d.longitude),
    [searched],
  )
  const handleFocusResult = useCallback(
    (row: DestinationResult) => mapRef.current?.focusResult(row),
    [],
  )
  const handleFocusPending = useCallback(
    (at: { latitude: number; longitude: number }) => mapRef.current?.focusPoint(at),
    [],
  )

  const handleRemoveResult = useCallback(
    (row: DestinationResult) => {
      setRemoved((prev) => recordRemoval(prev, row, searched.places, destinationScope))
      searched.removePlace(row.latitude, row.longitude)
    },
    [searched, destinationScope],
  )

  // What the browser still holds a forecast row for — the field on the client
  // path, the trimmed rows on the server path. Decides whether a restore is a
  // pure unhide or must re-register a place (see restorePlace).
  const heldKeys = useMemo(
    () =>
      new Set((universe ?? response?.results ?? []).map((r) => pinKey(r.latitude, r.longitude))),
    [universe, response],
  )
  const csvKeys = useMemo(
    () => new Set(csvRows.map((r) => pinKey(r.latitude, r.longitude))),
    [csvRows],
  )

  // Undo for the × (#241): drop the removal, and re-register the place when
  // nothing held can re-present the row. Never fetches — a restored row not in
  // the held field reappears as a pending row and rejoins the next Analyze.
  function handleRestoreRemoved(key: string) {
    const entry = removed.get(key)
    if (!entry) return
    const place = restorePlace(entry, heldKeys, csvKeys)
    setRemoved((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    if (place) searched.addPlace(place)
  }

  function handleRestoreAllRemoved() {
    for (const entry of removed.values()) {
      const place = restorePlace(entry, heldKeys, csvKeys)
      if (place) searched.addPlace(place)
    }
    setRemoved(new Map())
  }

  // Custom destinations no analysis has covered yet — drawn as neutral pending
  // dots and un-forecasted rows. Pasted CSV rows count: a list should show up
  // the moment it's pasted, not only once an analysis returns.
  //
  // Measured against the analysis snapshot, never against `results`: those are
  // the top-`limit` rows, so asking them turned every added destination below
  // the cut back into an un-forecasted row (#205). Before the first analysis
  // there is no snapshot, so everything named is pending, which is the point.
  //
  // Reads the ACTIVE removals rather than the whole map (#158). The report and
  // the refresh echo are snapshots of one analysis and keep the full map; this
  // preview is live over a list the user is still typing, so a × made against
  // an earlier list must stop hiding a line that is still pasted.
  const activeRemovedKeys = useMemo(
    () => activeRemovals(removed, destinationScope),
    [removed, destinationScope],
  )
  const pending = useMemo(
    () =>
      pendingDestinations(
        csvRows,
        searched.places,
        analyzed?.customKeys ?? NO_CUSTOM,
        activeRemovedKeys,
      ),
    [csvRows, searched.places, analyzed, activeRemovedKeys],
  )
  // Which discovery inputs the panel has moved since the analysis, in the
  // spelling the snapshot records. The comparison itself is `present.ts`'s, so
  // it can be tested; what belongs here is only which panel state feeds it.
  const discoveryMoved = discoveryChanges(
    analyzed,
    discoveryKeys(polygon, destinationTypes, includeUnnamedPeaks),
    polygon !== null,
  )
  // Every knob that has stopped being live, and why. Empty while everything
  // applies instantly, which is the normal case: the cues exist so the
  // controls never feel dead, and showing one when the knobs are in fact live
  // would ask for an Analyze that changes nothing. Declared here rather than
  // beside windowChanged/modelChanged above because the destination cue reads
  // `pending` — the same set behind the map's pending dots, so the cue and
  // the dots cannot disagree about what an analysis has not covered.
  const commitReasons =
    !loading && response !== null
      ? commitNeeded(analyzed, {
          window: windowChanged,
          model: modelChanged,
          polygon: discoveryMoved.polygon,
          types: discoveryMoved.types,
          destinationAdded: pending.length > 0,
        })
      : []
  // The table bar's row count: shown, of what the knobs admit, and — only when
  // a forecast bound is hiding some — of what was analyzed. An elected top-N
  // cut appends what it left out, since "of 1,500" would otherwise read as the
  // whole area. Null before a report exists, so the bar carries no count for
  // the pending-rows-only case.
  const rowCount = useMemo(() => {
    if (response === null) return null
    // "so far" while the field is still arriving (#337): the rows are real and
    // ranked, but both numbers are a floor and the order moves as the rest of
    // the batches land. Two words on the count that is already there, rather
    // than a second line or a box, because the count is the thing that is
    // provisional.
    const tail = arriving ? ' so far' : ''
    const shown = `${results.length.toLocaleString()} of ${presented.eligible.toLocaleString()}${tail}`
    // Comma-joined rather than parenthesized: the bar already wraps the whole
    // thing in parentheses, and a nested pair reads as a typo.
    if (presented.excluded > 0) {
      const analyzed = (presented.eligible + presented.excluded).toLocaleString()
      return `${shown} matching, ${analyzed} analyzed`
    }
    if (response.truncated && response.total_found != null) {
      return `${shown}, ${response.total_found.toLocaleString()} found`
    }
    return shown
  }, [response, results.length, presented.eligible, presented.excluded, arriving])

  // Why the table is empty, when it is. Three ways to get here and three
  // different next moves, and the newest one is the most easily mistaken for a
  // failed analysis: the destinations were found and forecast, the filters
  // simply admit none of them.
  const emptyReason = useMemo(() => {
    if (response === null || results.length > 0) return null
    if (presented.excluded > 0 && presented.eligible === 0) {
      return `No destinations match these filters. ${(
        presented.eligible + presented.excluded
      ).toLocaleString()} were analyzed.`
    }
    if (removedKeys.size > 0) {
      return 'All rows have been removed from this analysis. Use Removed above to restore them.'
    }
    return 'No destinations found. Try a larger area.'
  }, [response, results.length, presented.eligible, presented.excluded, removedKeys])


  // ── The map timeline (#121) ───────────────────────────────────────────────
  //
  // Two things span time and share one bar: radar's last 55 minutes of observed
  // rain, and the analyzed window's own hourly grid. Every reducer behind it is
  // in `utils/timeline.ts`; what lives here is the state and the interval.
  //
  // Each axis keeps its own playhead, so scrubbing radar back half an hour and
  // then switching to the forecast does not land the forecast half an hour in.
  const [chosenAxis, setChosenAxis] = useState<TimelineAxis | null>(null)
  const [radarIndex, setRadarIndex] = useState(() => initialIndex('radar', RADAR_FRAME_COUNT))
  const [forecastIndex, setForecastIndex] = useState(0)
  const [playing, setPlaying] = useState(false)

  // The report's own hourly grid, which is what the forecast axis plays. It
  // comes back on both analysis paths, so the axis does not care which one ran
  // — unlike the live presentation knobs, which need the held field.
  // Memoized for its IDENTITY rather than its cost: the empty fallback was a
  // fresh array on every render before an analysis, which gave `movePlayheadTo`
  // below a new identity per render and re-rendered the chart that holds it.
  const forecastTimes = useMemo(() => response?.times ?? [], [response?.times])
  const timelineAxes = availableAxes(playerShown, showRadar, forecastTimes.length)
  const timelineAxis = resolveAxis(timelineAxes, chosenAxis)
  // Whether the player has anything to play: radar contributes a past axis and
  // a multi-hour report a forecast one, so with neither there is nothing for a
  // transport to span. The row is then not in the popover at all, because a
  // checkbox that switches nothing on is a control the reader has to test to
  // learn is empty. `showPlayer` is untouched by that: the reader's own
  // decision survives the row being absent, so turning radar off and on again
  // never turns the player back on.
  const playerOffered = playerAvailable(showRadar, forecastTimes.length)
  const frameCount = timelineAxis === 'radar' ? RADAR_FRAME_COUNT : forecastTimes.length
  const frameIndex = clampIndex(
    timelineAxis === 'radar' ? radarIndex : forecastIndex,
    frameCount,
  )
  const setFrameIndex = timelineAxis === 'radar' ? setRadarIndex : setForecastIndex

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

  // A new report is a new grid, so the forecast playhead goes back to the start
  // of it. Keyed on the analysis rather than on the times array, which is a new
  // reference on every live knob change and would otherwise reset the playhead
  // under a reader who only re-sorted.
  useEffect(() => {
    setForecastIndex(initialIndex('forecast', 0))
  }, [analysisSeq])

  // Playback stops when the bar goes away, so switching an overlay off cannot
  // leave an interval running against an axis that no longer exists.
  useEffect(() => {
    if (timelineAxis === null) setPlaying(false)
  }, [timelineAxis])

  useEffect(() => {
    if (!playing || timelineAxis === null || frameCount < 2) return
    const id = setTimeout(
      () => setFrameIndex((i) => nextFrame(clampIndex(i, frameCount), frameCount)),
      frameHoldMs(frameIndex, frameCount),
    )
    return () => clearTimeout(id)
  }, [playing, timelineAxis, frameCount, frameIndex, setFrameIndex])

  // The hour the markers are colored for, or null to color them by the window
  // aggregate the ranking used. Playback is marker PRESENTATION and nothing
  // else: which rows are displayed, how they rank, what the table says and what
  // the legend's bins are all stay where the analysis left them, and the
  // `analyzed` snapshot stays authoritative.
  const playbackIndex = timelineAxis === 'forecast' ? clampIndex(forecastIndex, frameCount) : null

  // What the transport reads out, composed by whichever axis owns the
  // vocabulary — relative minutes for radar, a weekday and hour for the
  // forecast. The bar itself formats nothing.
  const timelineReadout =
    timelineAxis === 'radar'
      ? radarOffsetLabel(radarOffsets()[frameIndex] ?? 0)
      : forecastStampLabel(forecastTimes[frameIndex] ?? forecastTimes[0] ?? Date.now())
  const timelineScale =
    timelineAxis === 'radar' ? radarScaleEnds() : forecastScaleMarks(forecastTimes)


  // Clicking the chart moves the map's playhead to that hour, and takes the
  // transport to the forecast axis if it was showing radar — the reader just
  // pointed at a forecast hour, so leaving the bar on the past would answer a
  // question they did not ask. The nearest stamp rather than an exact match:
  // Recharts hands back the x value under the pointer, which on a wide chart is
  // an interpolated instant between two hourly points.
  const movePlayheadTo = useCallback(
    (ms: number) => {
      if (forecastTimes.length === 0) return
      let nearest = 0
      for (let i = 1; i < forecastTimes.length; i++) {
        if (Math.abs(forecastTimes[i] - ms) < Math.abs(forecastTimes[nearest] - ms)) nearest = i
      }
      setForecastIndex(nearest)
      setChosenAxis('forecast')
    },
    [forecastTimes],
  )

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

  // The forecast grid (#246): the ranked metric as model-resolution cells under
  // the markers, scrubbed by the same playhead.
  //
  // Every input comes from the `analyzed` snapshot rather than from the panel.
  // The calendar, the model picker and the ranking can all move while a report
  // sits on screen, and a grid built from panel state would paint a window the
  // markers above it never saw. The pitch is the ANALYZED model's finest grid
  // for the same reason.
  //
  // A report carrying archive hours is the one it cannot draw over: those hours
  // name no model, so there is no pitch the lattice could honestly be sampled at
  // (`gridAllowed`, #123). The layer is switched out of play rather than
  // switched off — the reader's preference survives, and the next forecast
  // analysis grids itself the way it always did. The row says why, since a
  // disabled checkbox beside three live ones reads as broken.
  const gridAvailable = gridAllowed(analyzed)
  // The layer as it actually stands, which is what every surface below reads:
  // the checkbox holds a preference, and this is whether that preference is in
  // effect. One flag rather than a pair repeated per surface, so the fetch, the
  // sub-choices and the legend box cannot answer differently.
  const gridOn = showGrid && gridAvailable
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
    ...(playerOffered
      ? [{ key: 'player', label: 'Forecast player', checked: playerShown, onChange: setShowPlayer }]
      : []),
    { key: 'radar', label: 'Rain radar', checked: showRadar, onChange: setShowRadar },
    { key: 'smoke', label: 'Smoke', checked: showSmoke, onChange: setShowSmoke },
    { key: 'fires', label: 'Wildfires (US only)', checked: showWildfires, onChange: setShowWildfires },
  ]
  const grid = useForecastGrid({
    enabled: gridOn,
    field: universe,
    window: analyzed?.window ?? null,
    model: analyzed?.forecastModel ?? forecastModel,
    times: forecastTimes,
    pitchKm:
      caps.forecastModels.find((m) => m.id === analyzed?.forecastModel)?.finestGridKm ??
      FALLBACK_PITCH_KM,
    reachFrac: gridReachFrac,
    // The live thumb position while dragging: the held field re-cuts to it in
    // real time, and only a committed value can fetch.
    displayReachFrac: gridReachDraft ?? gridReachFrac,
    analysisSeq,
  })
  // The pitch the slider's kilometres read from: the analyzed model once a
  // report is held (what the grid actually draws), the panel's pick before
  // one exists — so the control never quotes the 13 km fallback at a reader
  // who has GFS selected.
  const gridReachPitchKm =
    caps.forecastModels.find((m) => m.id === (analyzed?.forecastModel ?? forecastModel))
      ?.finestGridKm ?? FALLBACK_PITCH_KM
  // Something is painted, which is what a legend can be keyed to. A field still
  // filling in has some, so the legend arrives with the first chunk rather than
  // with the last — a key to an empty map would be noise, but a key to a
  // quarter-painted one is exactly what a reader needs.
  const gridPainted = gridOn && grid.cells.length > 0
  // The legend also opens while the grid is still fetching, so its one line can
  // say the field is coming. That gap is the whole reason the cue exists: the
  // grid inherits the quota debt of the analysis that just ran, so after a big
  // one it is minutes before the first samples land.
  const gridCued = gridOn && grid.status === 'loading'
  // The layer is on and could not draw. Said out loud for the same reason the
  // loading line exists: a switched-on layer with nothing under it and nothing
  // said reads as a broken app rather than as a failed fetch.
  const gridFailed = gridOn && grid.status === 'failed'
  // A one-second tick, only while the pacer is actually asleep, so the
  // countdown moves. Nothing else on screen needs it and it stops on its own.
  const [paceNow, setPaceNow] = useState(0)
  useEffect(() => {
    if (grid.paceEndMs === null) return
    const id = setInterval(() => setPaceNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [grid.paceEndMs])
  const gridPaceRemainingS =
    grid.paceEndMs === null
      ? null
      : Math.max(0, Math.ceil((grid.paceEndMs - Math.max(paceNow, Date.now())) / 1000))
  const gridLegend = gridLegendLine(
    gridPainted,
    grid.pitchKm,
    gridPaceRemainingS,
    gridFailed,
    grid.complete,
  )

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
      // The table draws pending (un-analyzed) rows above the ranked ones, so
      // the file carries them too — identity columns filled, Rank and every
      // metric blank. Before the first analysis this is the whole file.
      pending.map(
        (d) =>
          ({
            name: d.name,
            type: d.kind ?? 'custom',
            elevation_ft: d.elevation_ft ?? null,
            latitude: d.latitude,
            longitude: d.longitude,
          }) as DestinationResult,
      ),
      fire.uncovered,
      analysisModelLabel,
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = csvFilename(new Date())
    link.click()
    requestAnimationFrame(() => URL.revokeObjectURL(url))
  }

  // Comparison-chart selection (checkboxes in the table → lines in the chart).
  // Every row shares the analysis's hourly grid. A point-sample analysis charts
  // too: its single-instant grid renders as one dot per destination — still a
  // cross-destination comparison, same default-select-all.
  // Memoized for its identity, like `forecastTimes` above: `chartedSeries`
  // below depends on it, and a fresh empty array per render rebuilt that memo
  // on every render before an analysis.
  const chartTimes = useMemo(() => response?.times ?? [], [response?.times])
  // Everything the chart tracks: the displayed rows plus the pending
  // destinations no analysis has covered. Pending rows ride along as
  // series-less pseudo-rows so a searched place is colored and selected the
  // moment it appears — and since colors stick to the coordinate key, the hue
  // it wears before the analysis is the hue its line draws in after.
  const chartCandidates = useMemo(() => {
    const have = new Set(results.map((r) => pinKey(r.latitude, r.longitude)))
    const extras = pending
      .filter((d) => !have.has(pinKey(d.latitude, d.longitude)))
      .map(
        (d) =>
          ({
            name: d.name,
            type: d.kind ?? 'custom',
            elevation_ft: d.elevation_ft ?? null,
            latitude: d.latitude,
            longitude: d.longitude,
          }) as DestinationResult,
      )
    return [...results, ...extras]
  }, [results, pending])
  const chart = useChartSelection(chartCandidates, view.sortBy)

  // Comparing models across the charted destinations (#232). A drill-down rather
  // than a knob: it touches nothing the ranking reads. Never on air quality,
  // which comes from CAMS whatever forecast model ranked the field, so a
  // comparison there could only draw the same line twice.
  //
  // The rank comes from `results`, which is the ranking order the markers and
  // the legend already read — not from `tableRows`, whose numbering follows a
  // detail-column sort that reorders the rows on screen without changing which
  // rows they are.
  // Every DISPLAYED row as a point the comparison can fetch for. Wider than
  // the charted set: the results table shows one row per model for everything
  // on screen, so the numbers are bought for everything on screen. Keyed by
  // `chartKey` like the charted ones, so one pair key serves both readers.
  const comparePoints = useMemo(
    () =>
      results.map((r) => ({
        key: chartKey(r),
        latitude: r.latitude,
        longitude: r.longitude,
        elevationFt: r.elevation_ft,
      })),
    [results],
  )

  const chartedDestinations = useMemo(() => {
    const rankByKey = new Map(results.map((r, i) => [chartKey(r), i + 1]))
    return chart.selectedRows
      .filter((r) => rankByKey.has(chartKey(r)))
      .map((r) => ({
        key: chartKey(r),
        rank: rankByKey.get(chartKey(r)) as number,
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        elevationFt: r.elevation_ft,
        // The colour it already wears in the table and on the map. A compared
        // chart says two things at once, and this is the one it has always
        // said; the model is the line style.
        color: chart.colorFor(r),
      }))
    // Kept: the rule asks for the whole `chart` object, which useChartSelection
    // rebuilds every render. `colorFor` cannot answer differently for a row
    // that has not changed, so the two listed values are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart.selectedRows, results])
  // The ranking model's own numbers per destination, on the chart's grid: a
  // pinned row carries its own stamps, so the alignment the chart does for its
  // rows has to happen here too or a pin would compare against the wrong hours.
  const chartedSeries = useMemo(() => {
    const out: Record<string, HourlySeries | null> = {}
    for (const row of chart.selectedRows) {
      out[chartKey(row)] = alignRowToGrid(row, chartTimes).series ?? null
    }
    return out
  }, [chart.selectedRows, chartTimes])
  // Every model the panel has selected, ranking first: the Models popover's
  // rows. The SELECTION rather than the chart, so a model ticked before the
  // next Analyze already has a row.
  const selectedModelRows = useMemo(
    () => modelRows(caps.forecastModels, forecastModel, comparedModels),
    [caps.forecastModels, comparedModels, forecastModel],
  )

  // A colour per LINE, which under a comparison means a colour per
  // (destination, model) PAIR (#232). Three destinations under three models is
  // nine lines and nine colours.
  //
  // The pairs for the ranking model are seeded with their destinations' own
  // colours — the hue the marker and the table checkbox already wear — so a
  // chart with nothing compared draws exactly as it always did. Every other
  // pair takes the next colour from the ONE session allocator the destinations
  // themselves draw on, which is what stops a line being handed the colour of
  // a destination standing beside it.
  //
  // Allocated here rather than inside `useModelCompare` because the allocation
  // has to happen BEFORE the lines are composed, and `drawnModelIds` is what
  // lets both places agree about which pairs exist without the hook having to
  // answer first.
  const chartedPairKeys = useMemo(() => {
    const drawn = shownModels(
      drawnModelIds(
        comparedModels,
        analyzed?.compareModels ?? [],
        caps.forecastModels,
        analyzed?.forecastModel ?? null,
      ).map((id) => ({ id })),
      hiddenModels,
    )
    return drawn.flatMap((m) => chartedDestinations.map((d) => pairKey(m.id, d.key)))
  }, [analyzed, caps.forecastModels, chartedDestinations, comparedModels, hiddenModels])
  const chartedPairColors = useMemo(() => {
    const allocated = allocateColors(chart.colorByKey, chartedPairKeys)
    const seeded: Record<string, string> = { ...allocated }
    const ranking = analyzed?.forecastModel
    if (ranking) {
      for (const d of chartedDestinations) seeded[pairKey(ranking, d.key)] = d.color
    }
    return seeded
  }, [analyzed, chart.colorByKey, chartedDestinations, chartedPairKeys])
  // The allocation above is for the frame that draws the lines; this is what
  // makes it stick, so a pair hidden and shown again comes back the colour it
  // was rather than taking the next one off the end.
  const chartedPairsKey = chartedPairKeys.join('|')
  useEffect(() => {
    chart.rememberColors(chartedPairKeys)
    // Kept: `chartedPairsKey` is the joined VALUE of `chartedPairKeys`, which
    // is a new array whenever anything above it re-derives. Listing the array
    // and the hook object would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartedPairsKey])
  const compare = useModelCompare({
    enabled: chart.metric !== 'aqi',
    destinations: chartedDestinations,
    rows: comparePoints,
    heldSeries: chartedSeries,
    analyzed,
    analysisSeq,
    models: caps.forecastModels,
    picked: comparedModels,
    fetchable: analyzed?.compareModels ?? [],
    hidden: hiddenModels,
    colors: chartedPairColors,
    times: chartTimes,
  })

  // What colour a table row's chart checkbox wears.
  //
  // A colour identifies a LINE, and with a comparison up a line is a
  // (destination, model) PAIR: two rows for one place draw two lines in two
  // colours, so their checkboxes have to say which is which. Keyed off the same
  // `chartedPairColors` the chart itself reads, so the swatch beside a row and
  // the line it puts on the chart cannot be different colours.
  //
  // Falls back to the destination's own colour, which is the right answer
  // everywhere a pair has none: a single-model report, and any row nobody has
  // charted (whose swatch is uncoloured anyway until it is).
  const rowChartColor = useCallback(
    (row: DestinationResult) => {
      return pairColor(
        chartedPairColors,
        (row as ModelRow).modelId,
        chartKey(row),
        chart.colorFor(row),
      )
    },
    [chartedPairColors, chart],
  )

  // Whether the table shows one row per model. A single selected model is the
  // report as it always was: every row would carry the same model name, which
  // is a column that says nothing.
  const comparingRows = compare.shown.length > 1

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
    setColumnVisibility(rest)
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
    )
  }, [comparingRows, results, compare.shown, compare.results, forecastModel])

  const tableRows = useMemo(() => {
    const value = (r: DestinationResult) =>
      detailSort.key === WILDFIRE_KEY
        ? (fire.warnings.get(fireKey(r.latitude, r.longitude))?.miles ?? null)
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
    const cols = visibleColumns(pointSample, view.sortBy, effectiveVisibleKeys, windDatumSource)
    const withFire = effectiveVisibleKeys.has(WILDFIRE_KEY) ? [...cols, WILDFIRE_COL] : cols
    return applyColumnOrder(withModelColumn(withFire, modelColumnOn), columnOrder)
  }, [
    pointSample,
    view.sortBy,
    effectiveVisibleKeys,
    modelColumnOn,
    columnOrder,
    windDatumSource,
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

  // A model put down and later selected again comes back DRAWN, so a flag
  // outlives its model by exactly nothing. Keyed on the panel's selection
  // rather than on the chart's, because that is where a model leaves.
  const selectedModelsKey = [forecastModel, ...comparedModels].join(',')
  useEffect(() => {
    setHiddenModels((prev) => pruneHidden(prev, selectedModelsKey.split(',')) ?? prev)
  }, [selectedModelsKey])

  // A desktop-width window widens to Both when an analysis lands, so the first
  // report arrives with its chart — unless the user has ever explicitly picked
  // a mode, which always wins. A phone stays on Table: the stacked pair leaves
  // the map a sliver there. Checked per analysis rather than on mount so the
  // pre-analysis screen still opens on the plain table.
  useEffect(() => {
    if (response === null || modeChosenRef.current) return
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    setResultsMode('both')
  }, [response, analysisSeq])

  // Space below the map that a resize must leave alone: the preview banner (when
  // present) sits above the map, so the map + chart + table share the rest.
  const bannerPx = preview.enabled ? 32 : 0

  // Applied panel heights, re-derived every render from the desired (state)
  // heights and the live viewport. Chart-priority: enabling the chart shrinks an
  // over-tall table to fit rather than pushing the map's legends off-screen, and
  // the map always keeps its floor. Drives both breakpoints — mobile is resizable
  // too, so it can no longer rely on Tailwind's fixed panel heights.
  const viewportH = useViewportHeight()
  // Which panels are visible: the mode and the collapse chevron alone decide.
  // Deliberately NOT gated on having data — a mode with nothing to draw shows
  // its empty panel (the chart with no analysis renders bare axes), because a
  // segment that says Chart while the table shows reads as broken.
  const chartShowing = !resultsCollapsed && (resultsMode === 'chart' || resultsMode === 'both')
  const tableShowing = !resultsCollapsed && (resultsMode === 'table' || resultsMode === 'both')
  // One grip per panel on screen: the map│chart resizer, the chart│table divider.
  const gripCount = resultsCollapsed ? 0 : resultsMode === 'both' ? 2 : 1
  // On a phone the results stand ON the map rather than beside it, so the floor
  // the panels leave is not "some map" but "enough map for the legend stack to
  // sit above the sheet" (#249). Two of them, and the sheet is never taller
  // than the looser one allows: the resting reserve holds the whole legend
  // stack and lasts until the reader takes a grip, and the drag floor holds
  // however far they pull — it keeps the band the timeline needs to stay clear
  // of the map's button column, which is where the bar landed before the cap.
  // Desktop takes the same split, from the same three constants. A docked
  // panel covers nothing, so there is no sheet to hold up — but its bar and
  // grips come out of the map's own column, so the resting floor counts them
  // (`dockedMapFloorPx`) and the map keeps the whole legend stack at the
  // default heights. The DRAG floor stays `clampPanelHeight`'s own, as it was:
  // a reader who pulls the panels up has chosen a shorter map, and the stack
  // scrolls rather than the drag stopping short.
  const dragFloorPx = isDesktop ? undefined : draggedMapFloorPx(gripCount)
  const mapFloorPx = isDesktop
    ? heightsChosen
      ? undefined
      : dockedMapFloorPx(gripCount)
    : heightsChosen
      ? dragFloorPx
      : restingMapFloorPx(gripCount)
  const { chart: chartPanelPx, table: tablePanelPx } = resolvePanelHeights(
    chartHeight,
    tableHeight,
    {
      chartShown: chartShowing,
      tableShown: tableShowing && showTable,
      availPx: viewportH - bannerPx,
      mapMinPx: mapFloorPx,
    },
  )
  // The results' real height, which is what the map's bottom chrome rides.
  //
  // Two paths, because the height moves for two different kinds of reason.
  // This one is the render: a mode switch, the collapse chevron, a drag and a
  // rotation all re-render this component, so measuring after every render
  // catches each of them in the frame it happens. It settles immediately —
  // nothing downstream of this number changes the sheet's own height, so the
  // re-render it causes measures the same value and stops.
  //
  // `null` while the results are docked below the map, where nothing covers the
  // map's bottom edge and the number would mean nothing.
  //
  // Kept: no list is the point. The rule offers `[isDesktop]`, which would miss
  // the mode switch, the chevron, the drag and the rotation this exists to
  // catch. The same-value guard below is what stops the update chain.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = sheetRef.current
    const next = !el || isDesktop ? null : el.getBoundingClientRect().height
    setSheetMeasuredPx((prev) => (prev === next ? prev : next))
  })

  // And the second path: a resize that no render caused — a font landing, the
  // on-screen keyboard, a scrollbar appearing inside the table. Rare, and the
  // reason this is not left to the render alone.
  useEffect(() => {
    const el = sheetRef.current
    if (!el || isDesktop) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      // The BORDER box: the sheet's own top border is part of what covers the
      // map, and `contentRect` leaves it out.
      const box = entry.borderBoxSize?.[0]?.blockSize
      const next = box ?? entry.target.getBoundingClientRect().height
      setSheetMeasuredPx((prev) => (prev === next ? prev : next))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isDesktop, showTable])

  // How far the sheet reaches up the map, and therefore how far the map's own
  // bottom chrome — the legend stack, the timeline, and MapLibre's scale and
  // attribution — rides up to clear it. Zero wherever the results are docked
  // below the map, which is every desktop width and the moment before the first
  // analysis.
  //
  // The MEASURED height, not the derived one: the estimate has to guess a
  // header and a grip, and a guess 20px out is 20px of gap the reader can see
  // under the player. The estimate is what the first frame gets, before the
  // observer below has reported.
  const sheetLiftPx = resolveSheetLift({
    docked: isDesktop || !showTable,
    measuredPx: sheetMeasuredPx,
    estimatePx: sheetHeightPx({
      collapsed: resultsCollapsed,
      gripCount,
      panelsPx: chartPanelPx + tablePanelPx,
    }),
  })
  // Both of the library's bottom corners ride the same lift as the app's own
  // chrome, at every width: the scale bar bottom-left and the attribution
  // bottom-right sit in the band between the forecast player and the top of the
  // results, which is the one place on that edge nothing else stands.
  const mapCornerLift = mapCornerLiftPx(sheetLiftPx)
  // What the map's camera must keep clear of the sheet. The RESTING lift, not
  // the live one above: a fit re-framed mid-drag would move the map under the
  // hand that is dragging it.
  const cameraPadBottomPx =
    isDesktop || !showTable
      ? 0
      : restingLiftPx({
          collapsed: resultsCollapsed,
          gripCount,
          chartShown: chartShowing,
          tableShown: tableShowing,
          chartPx: DEFAULT_CHART_HEIGHT,
          tablePx: DEFAULT_TABLE_HEIGHT,
          availPx: viewportH - bannerPx,
        })

  return (
    <div className="flex flex-col h-dvh w-screen overflow-hidden bg-slate-900">
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
        className={`absolute inset-y-0 left-0 ${LAYER.drawer} w-[calc(100vw-2rem)] max-w-90 transform transition-transform duration-300 ease-in-out flex-shrink-0 bg-slate-800 flex flex-col overflow-hidden border-r border-slate-700 ${
          sidebarOpen
            ? 'translate-x-0 lg:static lg:z-10 lg:w-90 lg:max-w-none lg:transition-none'
            : '-translate-x-full'
        }`}
      >
        {/* Close button — collapses the panel on both mobile and desktop */}
        <button
          onClick={() => setSidebarOpen(false)}
          aria-label="Close controls"
          // A drawn cross rather than the "×" character. That glyph is
          // centred on the font's own maths, not the button's, so it sat
          // visibly high in the circle however the line-height was nudged —
          // and it moves again with any font change. Two lines in a square
          // viewBox are centred by construction, and flex centres the box.
          className={`${TAP.action} absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center ${TEXT.control} ${RADIUS.pill} bg-slate-700/80 transition-colors hover:bg-slate-600 active:bg-slate-600`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
        <ControlPanel
          drawing={drawing}
          onStartDrawing={() => {
            setDrawing(true)
            // Editing a shape that has scrolled off screen is the one thing
            // the draw/idle split made easy to do by accident.
            mapRef.current?.framePolygon()
            // On a phone the panel is an off-canvas drawer covering the map,
            // so entering draw mode behind it leaves nothing to draw on. On
            // desktop it is docked beside the map and closing it would be
            // taking away the Done button you are about to need.
            if (!isDesktop) setSidebarOpen(false)
          }}
          onFinishDrawing={() => setDrawing(false)}
          drawPointCount={drawPointCount}
          polygonAreaKm2={polygonAreaKm2}
          onCancelDrawing={handleCancelDrawing}
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
          pointSample={pointSample}
          constraints={constraints}
          setConstraints={setConstraints}
          // Every knob the Metrics table's boxes hold, back to its default.
          // The results cap is one of them (#341): it bounds nothing, but it is
          // typed into the same column and the button that clears that column
          // cannot skip one box.
          onClearFilters={() => {
            setConstraints(NO_CONSTRAINTS)
            setLimit(DEFAULT_LIMIT)
          }}
          includeUnnamedPeaks={includeUnnamedPeaks}
          setIncludeUnnamedPeaks={setIncludeUnnamedPeaks}
          windowWarning={windowWarning}
          hasPins={searched.places.length > 0}
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
          aqiAllNull={
            response !== null &&
            results.length > 0 &&
            results.every((r) => r.aqi_avg == null)
          }
          onAnalyze={handleAnalyze}
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
            restoredCustomPoints={restoredCustomPoints}
            onPolygonChange={setPolygon}
            onDrawUpdate={handleDrawUpdate}
            results={results}
            sortBy={view.sortBy}
            modelId={analyzed?.forecastModel ?? forecastModel}
            times={response?.times ?? NO_TIMES}
            popupColumns={tableColumns}
            modelFallbackLabel={analysisModelLabel}
            fireWarnings={fire.warnings}
            showWildfires={showWildfires}
            showRadar={showRadar}
            showSmoke={showSmoke}
            radarIndex={radarIndex}
            gridSpec={grid.spec}
            gridCells={grid.cells}
            gridStyle={gridStyle}
            playbackIndex={playbackIndex}
            pending={pending}
            searchedPlaces={searched.places}
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
          {(hasColoredMarkers || gridPainted || gridCued || gridFailed || showWildfires || showSmoke || showRadar) && (
            <div
              // The inset clears the button column above, which is one row
              // taller while the panel is collapsed and the Controls button
              // stands in it. `LEGEND_TOP` carries both heights; picking
              // between them here is the only thing that knows which one is on
              // screen.
              className={`absolute ${MAP_EDGE.left} ${
                sidebarOpen ? LEGEND_TOP.compact : LEGEND_TOP.full
              } z-10 flex flex-col ${MAP_COL_GAP} overflow-y-auto [&>*]:flex-shrink-0`}
              // The floor of the scroll box, derived rather than chosen: the
              // transport's whole band while the bar is on screen and a plain
              // gap otherwise, measured from whatever stands on the map's
              // bottom edge — the edge itself where the results are docked, the
              // top of the sheet where they cover it (#249).
              style={{ bottom: legendBottomPx(sheetLiftPx, timelineAxis !== null) }}
            >
              {/* One row per layer: what it is, who it came from, and its key
                  on the right. The densities used to be three stacked rows
                  under a heading, the radar and fire keys a box each — about
                  a hundred pixels of chrome to say four short things.

                  Each row still carries its own source, which the licences ask
                  for and which keeps a credit beside the data it describes
                  rather than in a list somewhere else.

                  No heading over them either. Every row names its own layer, so
                  a "Map layers" line above would be a label for four labels —
                  and on a phone it is a whole row of the little map left. */}
              {(showSmoke || showRadar || showWildfires || gridPainted || gridCued || gridFailed) && (
                <div className={`${SURFACE_FLOATING} ${MAP_COL_W} px-2.5 py-2`}>
                  <div className="flex flex-col gap-1">
                    {showSmoke && (
                      <div className="flex items-center justify-between gap-2">
                        <span className={TEXT.control}>
                          Smoke (
                          <a href={HMS_HREF} target="_blank" rel="noopener noreferrer" className={LINK}>
                            NOAA
                          </a>
                          )
                        </span>
                        {/* One lettered chip per density rather than three
                            rows. Opacity is the whole encoding here, so the
                            three chips also read as a ramp side by side, which
                            they could not do stacked. The letter is what keeps
                            them nameable at 14px. */}
                        <span className="flex flex-shrink-0 gap-0.5">
                          {SMOKE_DENSITIES.map((density) => (
                            <span
                              key={density}
                              className={SWATCH_CHIP}
                              style={{ backgroundColor: smokeSwatch(density), borderColor: SMOKE_EDGE }}
                              // A letter is not nameable on sight. The word it
                              // stands for is the same one the plume popup and
                              // the layer use, so this names it rather than
                              // introducing a second vocabulary.
                              title={density}
                            >
                              {density[0]}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                    {showRadar && (
                      <div className="flex items-center justify-between gap-2">
                        <span className={TEXT.control}>
                          Rain radar (
                          <a href={IEM_HREF} target="_blank" rel="noopener noreferrer" className={LINK}>
                            IEM
                          </a>
                          )
                        </span>
                        {/* A gradient rather than banded swatches: NEXRAD's own
                            reflectivity ramp is continuous, and a legend that
                            invented boundaries would assert thresholds
                            Bluebird Forecast does not know. */}
                        <span
                          className={`inline-block h-3.5 w-3.5 flex-shrink-0 ${RADIUS.control} border`}
                          style={{
                            backgroundImage: 'linear-gradient(90deg,#1c8a3c,#40b450,#e7c000,#eb7814)',
                            borderColor: '#475569',
                          }}
                        />
                      </div>
                    )}
                    {showWildfires && (
                      // CC BY 3.0 wants the credit wherever the fire data is
                      // drawn, and section 4(b) lets it be "implemented in any
                      // reasonable manner" — so it is the row's own label. The
                      // licence URI section 4(a) asks for lives in
                      // DataSourceList, which both document pages render.
                      <div className="flex items-center justify-between gap-2">
                        <span className={TEXT.control}>
                          Active wildfire (
                          <a
                            href="https://data-nifc.opendata.arcgis.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={LINK}
                          >
                            NIFC
                          </a>
                          )
                        </span>
                        <span
                          className={`inline-block h-3.5 w-3.5 flex-shrink-0 ${RADIUS.control} border`}
                          style={{ backgroundColor: 'rgba(220,38,38,0.35)', borderColor: '#b91c1c' }}
                        />
                      </div>
                    )}
                    {(gridPainted || gridCued || gridFailed) && (
                      // No swatch: the grid's colours are the metric key below,
                      // which the markers share. What this row adds is the one
                      // thing that IS the grid's own — how far apart the
                      // samples are, or why it is not there yet. Every state
                      // right-justifies its value like every other row, statuses
                      // included: one row breaking the column reads as a fault
                      // rather than as a distinction.
                      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                        <span className={TEXT.control}>{gridLegend.label}</span>
                        {/* Colored by state (TJ, 2026-08-21): amber while the
                            grid is waiting or loading so a stall catches the
                            eye, red when it failed, and the accent once the
                            pitch is real. The size is the colorless
                            CONTROL_SIZE because a color beside TEXT.control's
                            own would resolve by stylesheet order. */}
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
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Keyed to the markers OR to the grid, because either can be
                  the only colored thing on screen: a live filter can empty the
                  table while the field still paints, and colors without their
                  key are noise. One box serves both — they are scored on the
                  same scale by construction (#246), which is also why the grid
                  has no swatch of its own in the layer rows above. */}
              {markerScale !== null &&
                rankedFieldHasValue &&
                (hasColoredMarkers || gridPainted || gridCued) && (
                <div className={`${SURFACE_FLOATING} ${MAP_COL_W} p-2.5`}>
                  {/* The bare metric only: which hour or window the colors
                      describe, how it was reduced, and — for wind — which
                      datum produced it (#361) are all stated by the results
                      header and the table's own column headers. */}
                  <p className={`${TEXT.overline} mb-1.5`}>
                    {NOUN[familyOf(view.sortBy)]}
                  </p>
                  {markerScale.colors.map((color, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5">
                      <span style={{ backgroundColor: color }} className={`flex-shrink-0 h-2.5 w-2.5 ${RADIUS.pill}`} aria-hidden="true" />
                      <span className={`${TEXT.control} font-mono`}>
                        {markerScale.legendLabels[i]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12,3 21,8 12,13 3,8" />
                  <polyline points="3,13 12,18 21,13" />
                </svg>
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
                    <span className={`${TEXT.caption} truncate`}>
                      {windowTitle}
                    </span>
                  )}
                  {/* The chevron rides the title row when the bar is folded so
                      collapsing never needs the second row; its wide twin sits
                      at the end of the actions row below. */}
                  <button
                    onClick={() => setResultsCollapsed((c) => !c)}
                    aria-label={resultsCollapsed ? 'Expand results' : 'Collapse results'}
                    className={`${ICON_BUTTON} ml-auto @4xl:hidden`}
                  >
                    <Chevron up={resultsCollapsed} />
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
                        <svg viewBox="0 0 16 16" strokeWidth={1.5} stroke="currentColor" fill="none" className={`${ICON} flex-shrink-0`} aria-hidden="true">
                          <rect x="2" y="2" width="12" height="12" />
                          <line x1="2" y1="6" x2="14" y2="6" />
                          <line x1="2" y1="10" x2="14" y2="10" />
                        </svg>
                        <span className="hidden sm:inline">Table</span>
                      </button>
                      <div className={SEGMENT_DIVIDER} />
                      <button
                        onClick={() => chooseResultsMode('chart')}
                        className={`${SEGMENT_ITEM} ${resultsMode === 'chart' ? ACCENT.fill : SEGMENT_IDLE}`}
                        aria-pressed={resultsMode === 'chart'}
                        aria-label="Show chart only"
                      >
                        <svg viewBox="0 0 16 16" strokeWidth={1.5} stroke="currentColor" fill="none" className={`${ICON} flex-shrink-0`} aria-hidden="true">
                          <polyline points="2,12 6,6 9,9 14,3" />
                        </svg>
                        <span className="hidden sm:inline">Chart</span>
                      </button>
                      <div className={SEGMENT_DIVIDER} />
                      <button
                        onClick={() => chooseResultsMode('both')}
                        className={`${SEGMENT_ITEM} ${resultsMode === 'both' ? ACCENT.fill : SEGMENT_IDLE}`}
                        aria-pressed={resultsMode === 'both'}
                        aria-label="Show chart and table"
                      >
                        <svg viewBox="0 0 16 16" strokeWidth={1.5} stroke="currentColor" fill="none" className={`${ICON} flex-shrink-0`} aria-hidden="true">
                          <rect x="2" y="2" width="12" height="5.5" />
                          <line x1="8" y1="7.5" x2="8" y2="14" />
                          <rect x="2" y="7.5" width="12" height="6.5" />
                        </svg>
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
                    onClick={() => setResultsCollapsed((c) => !c)}
                    aria-label={resultsCollapsed ? 'Expand results' : 'Collapse results'}
                    className={`${ICON_BUTTON} hidden @4xl:flex`}
                  >
                    <Chevron up={resultsCollapsed} />
                  </button>
                </div>
              </div>
            </div>
            {!resultsCollapsed && (
              <>
                {resultsMode !== 'table' && (
                  <>
                    {/* The map│chart grip, in Both AND chart-only mode: a
                        panel shown by itself is still resizable against the
                        map (#242 review). Only the reserved space differs —
                        the table's height counts only while it is rendered. */}
                    <div
                      onPointerDown={(e) => {
                        if (isDoublePress('chart', e.timeStamp)) {
                          if (resultsMode === 'both') setTableHeight(tablePanelPx)
                          setChartHeight(DEFAULT_CHART_HEIGHT)
                          // "Put it back" includes the resting height a phone
                          // sheet opens at, which a drag had handed over.
                          setHeightsChosen(false)
                          return
                        }
                        const reserved = (resultsMode === 'both' ? tablePanelPx : 0) + bannerPx
                        if (resultsMode === 'both') setTableHeight(tablePanelPx)
                        beginResize(e, (up) =>
                          setChartHeight(
                            clampPanelHeight(
                              chartPanelPx,
                              up,
                              reserved,
                              window.innerHeight,
                              dragFloorPx,
                            ),
                          ),
                        )
                      }}
                      className={`${TAP.grip} flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize touch-none bg-slate-700 border-t border-b border-slate-600 hover:bg-slate-600 transition-colors group`}
                    >
                      <div className={`w-10 h-0.5 ${RADIUS.pill} bg-slate-500 group-hover:bg-slate-300 transition-colors`} />
                    </div>
                    <div
                      className="flex min-h-0 flex-shrink-0 flex-col"
                      style={{ height: `${chartPanelPx}px` }}
                    >
                      <div className="min-h-0 flex-1">
                        <Suspense fallback={null}>
                          <TimeSeriesChart
                            times={chartTimes}
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
                            playheadMs={playbackIndex !== null ? chartTimes[playbackIndex] ?? null : null}
                            onPlayheadChange={
                              timelineAxes.includes('forecast') ? movePlayheadTo : undefined
                            }
                            extraLines={compare.lines}
                            cutAfterMs={compare.endMs}
                            controls={
                              compare.active ? (
                                <ModelCompare compared={compare.shown} />
                              ) : undefined
                            }
                          />
                        </Suspense>
                      </div>
                      {/* Chart-only legend. In Both mode the table's checkbox
                          column is the series picker and this would be a
                          second copy of it, so it exists exactly where that
                          column does not. Each chip toggles its line; the ×
                          is the same removal as the table row's and obeys the
                          same rules (searched places deregister, removals
                          survive live knobs). Two chip rows at most —
                          26px chips + the 6px gap = 58px — then it scrolls. */}
                      {resultsMode === 'chart' && chartCandidates.length > 0 && (
                        <div className="flex-shrink-0 border-t border-slate-600 bg-slate-900/50 px-3 py-1.5">
                          <div className="results-scrollbars flex max-h-[58px] flex-wrap gap-1.5 overflow-y-auto">
                            {chartCandidates.map((row) => {
                              const plotted = chart.isSelected(row)
                              return (
                                <span
                                  key={`${row.latitude},${row.longitude}`}
                                  className={`inline-flex max-w-56 items-center ${RADIUS.control} ${
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
                                      className={`h-2 w-2 flex-shrink-0 ${RADIUS.pill} ${plotted ? '' : 'opacity-40'}`}
                                      style={{ backgroundColor: chart.colorFor(row) }}
                                    />
                                    <span className={`truncate ${plotted ? '' : 'opacity-50'}`}>
                                      {row.name}
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => handleRemoveResult(row)}
                                    aria-label={`Remove ${row.name}`}
                                    className={`${ICON_ACTION} ${FOCUS_RING} cursor-pointer py-1 pl-1 pr-2 leading-none`}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                      <line x1="18" y1="6" x2="6" y2="18" />
                                      <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
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
                    {/* In Both mode this grip is the chart│table divider and
                        preserves the pair's sum; alone, there is no chart to
                        trade with, so it resizes the table against the map
                        exactly as the chart grip above does. */}
                    <div
                      onPointerDown={(e) => {
                        if (isDoublePress('table', e.timeStamp)) {
                          if (resultsMode === 'both') setChartHeight(chartPanelPx)
                          setTableHeight(DEFAULT_TABLE_HEIGHT)
                          setHeightsChosen(false)
                          return
                        }
                        if (resultsMode === 'both') {
                          beginResize(e, (up) => {
                            const next = splitChartTable(chartPanelPx, tablePanelPx, up)
                            setChartHeight(next.chart)
                            setTableHeight(next.table)
                          })
                        } else {
                          beginResize(e, (up) =>
                            setTableHeight(
                              clampPanelHeight(
                                tablePanelPx,
                                up,
                                bannerPx,
                                window.innerHeight,
                                dragFloorPx,
                              ),
                            ),
                          )
                        }
                      }}
                      className={`${TAP.grip} flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize touch-none bg-slate-700 border-t border-b border-slate-600 hover:bg-slate-600 transition-colors group`}
                    >
                      <div className={`w-10 h-0.5 ${RADIUS.pill} bg-slate-500 group-hover:bg-slate-300 transition-colors`} />
                    </div>
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
                        times={response?.times ?? NO_TIMES}
                        onToggleChart={chart.toggle}
                        isCharted={chart.isSelected}
                        chartColor={rowChartColor}
                        onChartRange={chart.setRange}
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
          onToggle={(id) => setHiddenModels((prev) => toggleHidden(prev, id))}
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
