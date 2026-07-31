import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView, { MapViewHandle } from './components/MapView'
import ControlPanel from './components/ControlPanel'
import SearchBox from './components/SearchBox'
import ResultsTable from './components/ResultsTable'
import TimeSeriesChart from './components/TimeSeriesChart'
import WelcomeModal from './components/WelcomeModal'
import PreviewBanner from './components/PreviewBanner'
import { useAnalyze } from './hooks/useAnalyze'
import { useCapabilities } from './hooks/useCapabilities'
import { useChartSelection } from './hooks/useChartSelection'
import { useFireProximity } from './hooks/useFireProximity'
import { useSearchedPlaces } from './hooks/useSearchedPlaces'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import { CustomDestination, DestinationResult, DiscoveryType, GeoPolygon, SortBy } from './types'
import { BUTTON_SECONDARY, LINK, PROSE, RADIUS, SURFACE_CARD, SURFACE_FLOATING, TEXT } from './styles'
import { NOUN, familyOf, rankedNoun } from './metrics'
import { METRIC_CONFIG } from './utils/colors'
import { refreshEchoRows } from './utils/clientAnalyze'
import { parseCustomCsv } from './utils/customDestinations'
import { buildCustomList, pendingDestinations, pinKey } from './utils/customList'
import { clampPanelHeight, resolvePanelHeights, splitChartTable } from './utils/layout'
import { composeOverlay } from './utils/analyzeOverlay'
import { Place, isPeakKind } from './utils/geocode'
import { encodeState, decodeState, classifyWindow, clampLimit } from './utils/urlState'
import { UrlWriter, debounceUrlWrite, urlNeedsSync } from './utils/urlSync'
import {
  DEFAULT_SELECTION,
  ForecastSelection,
  selectionLocalWindow,
  windowCaption,
} from './utils/calendar'
import { isPointSample } from './utils/forecastWindow'
import { PresentationKnobs, bandNarrows, commitNeeded, presentResults } from './utils/present'
import { SortDir, SortKey, displayedColumns } from './utils/tableColumns'
import { compareValues } from './utils/sortResults'
import { buildResultsCsv, csvFilename } from './utils/resultsCsv'

// Both map legends, sized as one: they stack in a single column, so differing
// widths would read as a ragged edge rather than as two boxes. The step is a
// measured magic number, and with the legend titling only the bare metric
// (≤ 85px at TEXT.overline) the governor is the wildfire credit line —
// "Fire data: NIFC (CC BY 3.0)", 131px at TEXT.micro — then the widest AQI
// band row at 113px. w-40 leaves 140px inside the p-2.5 padding, ~9px of
// slack on macOS's SF, the widest face in the stack. Re-measure before adding
// a longer line to either box, or it wraps.
const LEGEND_WIDTH = 'w-40'

// Stands in for the analysis snapshot's covered set before the first analysis.
// A module constant rather than an inline `new Set()`, which would be a fresh
// identity on every render and rebuild the pending list underneath the map.
const NO_CUSTOM: ReadonlySet<string> = new Set()

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

  // The discovery inputs behind the results currently on screen: `base` covers
  // the user-authored inputs (polygon + type + CSV rows + elevation + limit +
  // sort) and `searchedKeys` the searched places that competed. An Analyze
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
  // Rows the user ×-removed from the current report, by coordinate key. Scoped
  // to the user-authored discovery inputs (removalScopeRef): removing a row —
  // even a searched place, which shrinks the custom list — must not count as
  // changing them. Only a polygon/type/elevation/CSV edit starts a clean slate
  // where removed destinations may legitimately return.
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set())
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
  // The polygon is always editable on the map — no draw/ready mode split. A
  // restored polygon seeds the count so Analyze unlocks before the map loads
  // (MapView re-emits the authoritative count+area once its points hydrate).
  const [drawPointCount, setDrawPointCount] = useState(
    () => Math.max(0, (restored?.polygon?.coordinates[0]?.length ?? 1) - 1),
  )
  const [polygonAreaKm2, setPolygonAreaKm2] = useState<number | null>(null)
  const [destinationType, setDestinationType] = useState<DiscoveryType>(
    () => restored?.destinationType ?? 'peak',
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
  // first analysis, which is what made #205 visible. Mirrored by DEFAULT_LIMIT
  // in urlState.ts.
  const [limit, setLimit] = useState(() => clampLimit(restored?.limit ?? 200, caps.maxLimit))
  // The initializer above clamps against the compiled fallback, because at
  // first render that is all useCapabilities has. Re-clamp once the real
  // ceiling lands so a deployment that publishes a lower one is honored on a
  // restored link too. Only ever lowers, so it cannot fight the knob.
  useEffect(() => {
    setLimit((prev) => clampLimit(prev, caps.maxLimit))
  }, [caps.maxLimit])
  const [customCsv, setCustomCsv] = useState(() => restored?.customCsv ?? '')
  // Parsed once per edit and shared by the pending markers and the Analyze
  // request, so what the map shows and what gets ranked can't drift apart.
  const csvRows = useMemo(() => parseCustomCsv(customCsv), [customCsv])
  const [sortBy, setSortBy] = useState<SortBy>(() => restored?.sortBy ?? 'precip_total_in')
  const [sortDesc, setSortDesc] = useState(() => restored?.sortDesc ?? false)
  const [minElevationFt, setMinElevationFt] = useState<number | null>(
    () => restored?.minElevationFt ?? null,
  )
  const [maxElevationFt, setMaxElevationFt] = useState<number | null>(
    () => restored?.maxElevationFt ?? null,
  )
  // A live map overlay, not part of the analyze request, but persisted to the
  // URL so a shared link reproduces it. Defaults off; toggling queries NIFC for
  // the current viewport.
  const [showWildfires, setShowWildfires] = useState(() => restored?.showWildfires ?? false)
  const [showResults, setShowResults] = useState(false)
  const [tableHeight, setTableHeight] = useState(280)
  const [chartHeight, setChartHeight] = useState(288)
  // Chevron-collapsed panels: the header bar stays docked at the bottom (the
  // panel never unmounts); expanding restores the previous height.
  const [chartCollapsed, setChartCollapsed] = useState(false)
  const [tableCollapsed, setTableCollapsed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('bluebird_welcomed'))
  // The controls panel is docked on desktop and an off-canvas drawer on phones.
  // It starts open on both; a close button collapses it to widen the map.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const isDesktop = useIsDesktop()

  function dismissWelcome() {
    localStorage.setItem('bluebird_welcomed', '1')
    setShowWelcome(false)
  }
  // Pointer-driven vertical resize, shared by mouse and touch (Pointer Events)
  // and by both breakpoints. `onDrag` receives the drag distance with up
  // positive; the handles below feed it the map│chart or chart│table geometry.
  function beginResize(e: React.PointerEvent, onDrag: (dragUpPx: number) => void) {
    e.preventDefault()
    const startY = e.clientY
    setIsDragging(true)

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
    retryWithFloor,
    retryTopByElevation,
    reset,
    analyzed,
    analysisSeq,
    loading,
    error,
    refusal,
    response,
    universe,
    statusMessage,
    statusDetail,
    progress,
    paceEndMs,
  } = useAnalyze(caps.maxDestinations)

  // Places searched by name — the third destination input. Searching registers
  // the place (map dot + URL persistence); its forecast joins the next Analyze,
  // where the list folds into the ranked request alongside the CSV.
  const searched = useSearchedPlaces()

  // Repopulate searched places restored from the URL, once at mount. They show
  // as pending dots until the user runs an Analyze — nothing fetches on load.
  useEffect(() => {
    if (restored?.pins?.length) searched.restore(restored.pins)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearchSelect(place: Place) {
    mapRef.current?.flyToPlace(place)
    searched.addPlace(place)
    // Re-searching a previously ×-removed spot is an explicit re-request —
    // drop the stale removal so the place isn't filtered out of its next report.
    setRemovedKeys((prev) => {
      const key = pinKey(place.lat, place.lon)
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  // Naming a destination — by search or by pasting CSV — opens the results
  // panel immediately: it appears as an un-forecasted row, so there's feedback
  // before any analysis runs. Keyed on the inputs rather than the derived
  // `pending` list, which is declared further down.
  useEffect(() => {
    if (searched.places.length > 0 || csvRows.length > 0) setShowResults(true)
  }, [searched.places, csvRows])

  // The selection resolved to the datetime-local pair the rest of the app reads:
  // the horizon and air-quality warnings, the staleness comparison below, and the
  // ISO conversion in handleAnalyze. Recomputed per render rather than memoized,
  // since for the current-hour selection it moves with the clock.
  const panelWindow = selectionLocalWindow(selection, new Date())
  const panelWindowMs = {
    startMs: Date.parse(panelWindow.start),
    endMs: Date.parse(panelWindow.end),
  }

  // The knobs the displayed report is rendered under: markers, legend, results
  // header, and table column order all read from here.
  //
  // With a field held, the panel's ranking IS the displayed ranking — the rows
  // below are re-derived from it on every change, so reading the snapshot here
  // would show a legend that disagreed with the table. The window stays
  // from the snapshot either way: it is a data knob, and a point sample cannot
  // become a range without a new analysis. Without a field (the SSE fallback, or before
  // the first analysis) this is the pre-#188 behavior unchanged.
  const liveKnobs: PresentationKnobs = useMemo(
    () => ({ sortBy, sortDesc, limit, band: { min: minElevationFt, max: maxElevationFt } }),
    [sortBy, sortDesc, limit, minElevationFt, maxElevationFt],
  )
  const view =
    universe !== null && analyzed !== null
      ? { sortBy, sortDesc, kind: analyzed.kind, window: analyzed.window }
      : analyzed ?? {
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
  // A knob that has stopped being live, and why. Null while everything applies
  // instantly, which is the normal case: the cue exists so the controls never
  // feel dead, and showing it when they are in fact live would ask for an
  // Analyze that changes nothing.
  const commitReason =
    !loading && response !== null
      ? commitNeeded(analyzed, liveKnobs, universe !== null, windowChanged)
      : null
  const preview = usePreview()

  // Elapsed-time counter for phases with no countable progress (the OSM search,
  // and the pins-only refresh). Declared before the overlay composition, which
  // reads it to stage the "Still searching…" reassurance line.
  const [elapsed, setElapsed] = useState(0)

  // The loading overlay for the one ranked streaming analysis — searched
  // places ride inside it as custom destinations, so there is no separate pin
  // refresh to fold in anymore.
  const overlay = composeOverlay({
    analyzeLoading: loading,
    statusMessage,
    statusDetail,
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
      destinationType,
      selection,
      sortBy,
      sortDesc,
      minElevationFt,
      maxElevationFt,
      limit,
      customCsv,
      showWildfires,
      pins: searched.places,
    })

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
  }, [
    polygon,
    destinationType,
    selection,
    sortBy,
    sortDesc,
    minElevationFt,
    maxElevationFt,
    limit,
    customCsv,
    showWildfires,
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
  const windowStatus = classifyWindow(panelWindow.start, panelWindow.end, new Date())
  const windowWarning =
    selection.kind === 'now' || windowStatus === 'ok' ? null : windowStatus

  const handleDrawUpdate = useCallback((count: number, areaKm2: number | null) => {
    setDrawPointCount(count)
    setPolygonAreaKm2(areaKm2)
  }, [])

  function handleCancelDrawing() {
    mapRef.current?.cancelDrawing()
    // cancelDrawing fires onDrawUpdate(0, null) to reset counts
  }


  // The user-authored discovery inputs as a stable string. Everything that
  // changes which destinations are FOUND belongs here — the CSV as parsed rows
  // (a comment or whitespace edit doesn't needlessly bust the refresh) but NOT
  // the searched places, which are compared separately so removals stay
  // refresh-eligible.
  //
  // Ranking and limit used to be in here, which is what made every sort or
  // limit change a full rediscovery. They re-present the held field now
  // (#188), so they never reach this function at all. The elevation band DOES
  // stay: a narrowing is likewise handled live and never gets here, but a
  // WIDENING needs candidates outside the held field, and letting it take the
  // refresh path would echo the narrower field and silently ignore the request.
  function discoveryBase(poly: GeoPolygon | null, csvRows: CustomDestination[]): string {
    return JSON.stringify({
      ring: poly?.coordinates[0] ?? null,
      type: destinationType,
      csv: csvRows,
      minEl: minElevationFt,
      maxEl: maxElevationFt,
    })
  }

  async function handleAnalyze() {
    // The one conversion from a local selection to the UTC instants the API
    // takes. Equal timestamps are how a point sample travels — the current hour,
    // or a day narrowed to a single hour — and the backend normalizes them to
    // the hour containing the moment.
    const kind = selection.kind
    const local = selectionLocalWindow(selection, new Date())
    const start = new Date(local.start).toISOString()
    const end = new Date(local.end).toISOString()

    const constraints = { min_elevation_ft: minElevationFt, max_elevation_ft: maxElevationFt }

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
    // The elevation band is compared by DIRECTION rather than by equality. It
    // used to sit in the hash, which was harmless while every band change
    // forced an analysis; now that narrowing is live, a user who narrows and
    // then changes the forecast window would arrive here with a band that
    // differs from the last analysis and lose their × removals for a reason
    // nothing on screen explains. A narrowing keeps them (the same field, fewer
    // rows); only a widening starts a fresh report, since it readmits
    // destinations this report never ranked.
    const removalScope = JSON.stringify({
      ring: resolvedPolygon?.coordinates[0] ?? null,
      type: destinationType,
      csv: customCsv.trim(),
    })
    const widened =
      analyzed !== null && !bandNarrows(analyzed.band, { min: minElevationFt, max: maxElevationFt })
    if (removalScopeRef.current !== removalScope || widened) {
      removalScopeRef.current = removalScope
      setRemovedKeys(new Set())
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
        destination_type: 'custom',
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        custom_destinations: refreshEchoRows(universe, results, removedKeys),
        ...constraints,
      }, kind)
    } else if (resolvedPolygon) {
      // Discovery — with the custom list riding along so the backend ranks the
      // polygon ∪ CSV union as one report.
      await analyze({
        polygon: resolvedPolygon,
        destination_type: destinationType,
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        ...(custom.length > 0 ? { custom_destinations: custom } : {}),
        ...constraints,
      }, kind)
      // Remember these discovery inputs so the next compatible Analyze refreshes.
      discoveryRef.current = { base, searchedKeys }
    } else if (custom.length > 0) {
      // Custom-only (CSV and/or searched places). Not a refreshable polygon
      // discovery — clear the record so a later identical polygon Analyze
      // can't mistake these rows for that polygon's discovered set.
      discoveryRef.current = null
      await analyze({
        destination_type: 'custom',
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        custom_destinations: custom,
        ...constraints,
      }, kind)
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
        type: isPeakKind(p.kind) ? 'peak' : 'custom',
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
    () => presentResults(universe, response, liveKnobs, removedKeys),
    [universe, response, liveKnobs, removedKeys],
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

  // The detail-column sort, held here rather than inside ResultsTable (#125).
  //
  // Clicking one of the four ranking columns re-cuts the whole field through
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
  // live limit or elevation change and would otherwise throw away a sort the
  // user just asked for.
  useEffect(() => {
    setDetailSort({ key: view.sortBy, dir: view.sortDesc ? 'desc' : 'asc' })
  }, [view.sortBy, view.sortDesc, analysisSeq])

  // Nulls sort last in both directions; string columns use numeric collation so
  // a pasted list numbered 1..100 reads in order. See compareValues.
  const tableRows = useMemo(
    () => [...results].sort((a, b) => compareValues(a[detailSort.key], b[detailSort.key], detailSort.dir)),
    [results, detailSort],
  )
  const tableColumns = useMemo(
    () => displayedColumns(pointSample, view.sortBy),
    [pointSample, view.sortBy],
  )

  // × on a table row. Removing a searched place also deregisters it — else the
  // next analysis would simply rediscover it from the searched list.
  function handleRemoveResult(row: DestinationResult) {
    setRemovedKeys((prev) => new Set(prev).add(pinKey(row.latitude, row.longitude)))
    searched.removePlace(row.latitude, row.longitude)
  }

  // Custom destinations no analysis has covered yet — drawn as neutral pending
  // dots and un-forecasted rows. Pasted CSV rows count: a list should show up
  // the moment it's pasted, not only once an analysis returns.
  //
  // Measured against the analysis snapshot, never against `results`: those are
  // the top-`limit` rows, so asking them turned every added destination below
  // the cut back into an un-forecasted row (#205). Before the first analysis
  // there is no snapshot, so everything named is pending, which is the point.
  const pending = useMemo(
    () =>
      pendingDestinations(csvRows, searched.places, analyzed?.customKeys ?? NO_CUSTOM, removedKeys),
    [csvRows, searched.places, analyzed, removedKeys],
  )
  const hasColoredMarkers = showResults && results.length > 0
  const showTable = showResults && (results.length > 0 || pending.length > 0)

  // Flags destinations within 10 mi of an active US wildfire; independent of the
  // map overlay toggle. Empty (no ⚠️) when best-effort NIFC data is unavailable.
  // Fed the whole analyzed field so live knobs re-present rows without
  // re-querying NIFC; falls back to the displayed rows on the server path.
  const fire = useFireProximity(universe ?? results, analysisSeq)

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
      tableColumns,
      fire.status === 'ready' ? fire.warnings : null,
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
  const chartTimes = response?.times ?? []
  const chartable = chartTimes.length > 0
  const chart = useChartSelection(
    results,
    view.sortBy,
    searched.places.map((p) => pinKey(p.lat, p.lon)),
  )
  const chartShown = chartable && chart.selectedRows.length > 0

  // Space below the map that a resize must leave alone: the preview banner (when
  // present) sits above the map, so the map + chart + table share the rest.
  const bannerPx = preview.enabled ? 32 : 0

  // Applied panel heights, re-derived every render from the desired (state)
  // heights and the live viewport. Chart-priority: enabling the chart shrinks an
  // over-tall table to fit rather than pushing the map's legends off-screen, and
  // the map always keeps its floor. Drives both breakpoints — mobile is resizable
  // too, so it can no longer rely on Tailwind's fixed panel heights.
  const viewportH = useViewportHeight()
  // A collapsed panel is just its header bar — it takes no share of the band.
  const chartExpanded = chartShown && !chartCollapsed
  const tableExpanded = showTable && !tableCollapsed
  const { chart: chartPanelPx, table: tablePanelPx } = resolvePanelHeights(
    chartHeight,
    tableHeight,
    { chartShown: chartExpanded, tableShown: tableExpanded, availPx: viewportH - bannerPx },
  )

  return (
    <div className="flex flex-col h-dvh w-screen overflow-hidden bg-slate-900">
      {preview.enabled && <PreviewBanner pr={preview.pr} commit={preview.commit} />}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
      {showWelcome && <WelcomeModal onDismiss={dismissWelcome} />}
      {isDragging && <div className="fixed inset-0 z-50 cursor-ns-resize touch-none" />}

      {/* Mobile: dim backdrop behind the open drawer */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden absolute inset-0 z-30 bg-black/50"
        />
      )}

      {/* Controls panel — docked on desktop when open, off-canvas otherwise.
          When closed it stays absolute + translated off-screen so it leaves the
          layout and the map fills the full width on every breakpoint. */}
      <aside
        className={`absolute inset-y-0 left-0 z-40 w-[85vw] max-w-xs transform transition-transform duration-300 ease-in-out flex-shrink-0 bg-slate-800 flex flex-col overflow-hidden border-r border-slate-700 ${
          sidebarOpen
            ? 'translate-x-0 lg:static lg:z-10 lg:w-80 lg:max-w-none lg:transition-none'
            : '-translate-x-full'
        }`}
      >
        {/* Close button — collapses the panel on both mobile and desktop */}
        <button
          onClick={() => setSidebarOpen(false)}
          aria-label="Close controls"
          className={`absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center ${RADIUS.pill} bg-slate-700/80 text-slate-200 text-xl leading-none hover:bg-slate-600 active:bg-slate-600`}
        >
          ×
        </button>
        <ControlPanel
          drawPointCount={drawPointCount}
          polygonAreaKm2={polygonAreaKm2}
          onCancelDrawing={handleCancelDrawing}
          destinationType={destinationType}
          setDestinationType={setDestinationType}
          selection={selection}
          setSelection={setSelection}
          limit={limit}
          setLimit={setLimit}
          customCsv={customCsv}
          setCustomCsv={setCustomCsv}
          onCsvPasted={(points) => mapRef.current?.fitToPoints(points)}
          commitReason={commitReason}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortDesc={sortDesc}
          setSortDesc={setSortDesc}
          minElevationFt={minElevationFt}
          setMinElevationFt={setMinElevationFt}
          maxElevationFt={maxElevationFt}
          setMaxElevationFt={setMaxElevationFt}
          showWildfires={showWildfires}
          setShowWildfires={setShowWildfires}
          windowWarning={windowWarning}
          hasPins={searched.places.length > 0}
          // A pins-only Analyze refresh keeps useAnalyze.loading false, so fold
          // in the pin-refresh flag to disable the button (and show "Analyzing…")
          // while it runs. Searches don't announce, so this stays false for them.
          loading={loading}
          error={error}
          refusal={refusal}
          onRetryWithFloor={(ft) => {
            // Sync the panel/URL state so the applied floor is visible and
            // survives, then re-run from the request snapshot (state updates
            // land asynchronously, so the re-run cannot read them).
            setMinElevationFt(ft)
            retryWithFloor(ft)
          }}
          onRetryTopByElevation={retryTopByElevation}
          maxLimit={caps.maxLimit}
          maxAreaKm2={caps.maxPolygonAreaKm2}
          totalFound={response?.total_found}
          truncated={response?.truncated}
          aqiAllNull={
            response !== null &&
            results.length > 0 &&
            results.every((r) => r.aqi_avg == null)
          }
          onAnalyze={() => {
            // On mobile the controls are an off-canvas drawer — close it so the
            // user sees the map/results. On desktop the panel is docked; leave it.
            if (!isDesktop) setSidebarOpen(false)
            handleAnalyze()
          }}
          onRetry={retry}
          resultCount={response ? results.length : undefined}
          // What the current elevation band admits, not what the analysis
          // fetched: narrowing the band live has to move the "of M" or the
          // count describes a field the table no longer shows.
          totalQueried={response ? presented.eligible : undefined}
        />
      </aside>

      {/* Map + results column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 relative">
          {overlay.visible && (
            <div className="absolute inset-0 bg-slate-900/60 z-20 flex items-center justify-center">
              <div className={`${SURFACE_CARD} px-6 py-5 text-center w-[280px]`}>
                <img
                  src="/icon.png"
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
                        className="h-full bg-sky-500 transition-all duration-300 ease-out"
                        style={{ width: `${overlay.progress.percent}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400 font-mono">
                      {overlay.progress.percent}%
                    </p>
                  </div>
                ) : (
                  // Search / analyzing phase — no countable progress; show activity.
                  <div className="mt-3">
                    <div className={`h-2 w-full ${RADIUS.pill} bg-slate-700 overflow-hidden`}>
                      <div className={`h-full w-1/3 ${RADIUS.pill} bg-sky-500 animate-indeterminate`} />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400 font-mono">
                      Elapsed {elapsed}s
                    </p>
                  </div>
                )}
                <button
                  onClick={cancel}
                  className={`${BUTTON_SECONDARY} mt-4`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <MapView
            ref={mapRef}
            polygon={polygon}
            restoredCustomPoints={restoredCustomPoints}
            onPolygonChange={setPolygon}
            onDrawUpdate={handleDrawUpdate}
            results={results}
            sortBy={view.sortBy}
            fireWarnings={fire.warnings}
            showWildfires={showWildfires}
            pending={pending}
            minElevationFt={minElevationFt}
            maxElevationFt={maxElevationFt}
          />
          {/* Top-left map cluster — reopen-controls button (only while the
              panel is collapsed) + place search. z-10 keeps it under the
              loading overlay (z-20) and the mobile drawer backdrop (z-30). */}
          <div className="absolute top-3 left-3 z-10 flex items-start gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open controls"
                className={`${SURFACE_FLOATING} ${TEXT.cta} flex flex-shrink-0 items-center gap-2 px-3 py-2 text-white transition-colors hover:border-sky-400 hover:text-sky-400 active:bg-slate-700`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
                Controls
              </button>
            )}
            <SearchBox onSelect={handleSearchSelect} />
          </div>
          {/* Bottom-anchored legends. On mobile the top edge is clamped below
              the Controls/search cluster (top-16) and the stack scrolls if it
              can't fit, so a short map can never let the legends ride up over
              those buttons. justify-end keeps them pinned to the bottom when
              there is room. Desktop has ample height, so the clamp lifts. */}
          {(hasColoredMarkers || showWildfires) && (
            <div className="absolute bottom-8 left-2 top-16 z-10 flex flex-col justify-end gap-2 overflow-y-auto lg:top-auto lg:overflow-visible">
              {showWildfires && (
                <div className={`${SURFACE_FLOATING} ${LEGEND_WIDTH} px-2.5 py-2`}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block w-3 h-3 ${RADIUS.control} border`}
                      style={{ backgroundColor: 'rgba(220,38,38,0.35)', borderColor: '#b91c1c' }}
                    />
                    <span className={TEXT.control}>Active Wildfire</span>
                  </div>
                  {/* CC BY 3.0 requires a visible credit wherever the fire data
                      is displayed, not just a source-code comment. */}
                  <p className={`${TEXT.micro} mt-1`}>
                    Fire data:{' '}
                    <a
                      href="https://data-nifc.opendata.arcgis.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={LINK}
                    >
                      NIFC
                    </a>{' '}
                    (CC BY 3.0)
                  </p>
                </div>
              )}
              {hasColoredMarkers && (
                <div className={`${SURFACE_FLOATING} ${LEGEND_WIDTH} p-2.5`}>
                  {/* The bare metric only: which hour or window the colors
                      describe, and how it was reduced, is stated by the
                      results header and the table's own column headers. */}
                  <p className={`${TEXT.overline} mb-1.5`}>
                    {NOUN[familyOf(view.sortBy)]}
                  </p>
                  {METRIC_CONFIG[view.sortBy].colors.map((color, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5">
                      <span style={{ color }} className="text-sm leading-none">●</span>
                      <span className={`${TEXT.control} font-mono`}>
                        {METRIC_CONFIG[view.sortBy].legendLabels[i]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {chartShown && (
          <div
            className="flex flex-shrink-0 flex-col bg-slate-800"
            style={chartCollapsed ? undefined : { height: `${chartPanelPx}px` }}
          >
            {!chartCollapsed && (
              /* Drag handle — the map│chart divider. Dragging up grows the chart,
                 stealing height from the map above; the table below stays put
                 (tablePanelPx is 0 when the table is closed). Pointer events +
                 touch-none so a finger resizes it on mobile too. */
              <div
                onPointerDown={(e) => {
                  // Pin the table's desired height to its applied value first, so a
                  // stale (larger) desired height can't soak up space freed by
                  // shrinking the chart — that space belongs to the map here.
                  setTableHeight(tablePanelPx)
                  beginResize(e, (up) =>
                    setChartHeight(
                      clampPanelHeight(chartPanelPx, up, tablePanelPx + bannerPx, window.innerHeight),
                    ),
                  )
                }}
                className="flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize touch-none bg-slate-700 border-t border-b border-slate-600 hover:bg-slate-600 transition-colors group"
              >
                <div className={`w-10 h-0.5 ${RADIUS.pill} bg-slate-500 group-hover:bg-slate-300 transition-colors`} />
              </div>
            )}
            {/* Untitled: the chart names itself with its own metric radios,
                and the button's tooltip and label still say what it collapses. */}
            <div
              className={`flex flex-shrink-0 items-center justify-end border-b border-slate-600 bg-slate-700 px-3 py-1 ${chartCollapsed ? 'border-t' : ''}`}
            >
              <button
                onClick={() => setChartCollapsed((c) => !c)}
                title={chartCollapsed ? 'Expand the chart' : 'Collapse the chart'}
                aria-label={chartCollapsed ? 'Expand the forecast chart' : 'Collapse the forecast chart'}
                className="px-1 text-slate-400 hover:text-white"
              >
                <Chevron up={chartCollapsed} />
              </button>
            </div>
            {!chartCollapsed && (
              <div className="min-h-0 flex-1">
                <TimeSeriesChart
                  times={chartTimes}
                  rows={chart.selectedRows}
                  metric={chart.metric}
                  onMetricChange={chart.setMetric}
                  colorFor={chart.colorFor}
                />
              </div>
            )}
          </div>
        )}
        {showTable && (
          <div
            className="flex-shrink-0 bg-slate-800 flex flex-col"
            style={tableCollapsed ? undefined : { height: `${tablePanelPx}px` }}
          >
            {!tableCollapsed && (
              /* Drag handle. With the chart above, this is the chart│table divider:
                 dragging up grows the table by shrinking the chart, leaving the map
                 untouched. With no chart it steals from the map like the chart
                 handle. Pointer events + touch-none for mobile. */
              <div
                onPointerDown={(e) =>
                  beginResize(e, (up) => {
                    if (chartExpanded) {
                      const next = splitChartTable(chartPanelPx, tablePanelPx, up)
                      setChartHeight(next.chart)
                      setTableHeight(next.table)
                    } else {
                      setTableHeight(clampPanelHeight(tablePanelPx, up, bannerPx, window.innerHeight))
                    }
                  })
                }
                className="flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize touch-none bg-slate-700 border-t border-b border-slate-600 hover:bg-slate-600 transition-colors group"
              >
                <div className={`w-10 h-0.5 ${RADIUS.pill} bg-slate-500 group-hover:bg-slate-300 transition-colors`} />
              </div>
            )}
            {/* Header */}
            <div
              className={`flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-slate-700 border-b border-slate-600 ${tableCollapsed ? 'border-t' : ''}`}
            >
              {/* The ranking and the window it covers, and nothing else. The
                  bar used to lead with a name for the analysis ("Current
                  Conditions:", "Forecast Table:") that changed with the
                  selection shape, so the same report renamed itself when you
                  moved the window. The caption beside it already says which
                  shape it is. With no rows there is no ranking to state, and
                  the bar carries its credit and controls regardless. */}
              <span className={TEXT.subheading}>
                {results.length > 0 &&
                  `${view.sortDesc ? 'Highest' : 'Lowest'} ${rankedNoun(view.sortBy, pointSample)}`}
                {/* Which window these rows describe. A multi-hour analysis used
                    to say nothing at all here, so someone opening a shared link
                    had no on-screen statement of the days they were reading. */}
                {results.length > 0 && analyzed !== null && (
                  <span className="ml-1.5 font-normal text-slate-400">
                    {windowCaption(
                      analyzed.kind,
                      analyzed.window.startMs,
                      analyzed.window.endMs,
                      pointSample,
                    )}
                  </span>
                )}
              </span>
              {/* The fire check is best-effort, and every way it can fail used
                  to render as an all-clear: no ⚠️ on any row, and since #125 an
                  empty column in the download. For a safety warning that is the
                  wrong way round, so a failed lookup says so. Status text sits
                  outside the type ramp by styles.ts's own rule, wearing the
                  base size and a semantic color; it cannot compose TEXT.micro
                  because that role carries slate-300 and two color utilities
                  would resolve by stylesheet order rather than by intent. */}
              {fire.status === 'unavailable' && results.length > 0 && (
                <span
                  className="ml-2 text-xs text-amber-300"
                  title="The wildfire service could not be reached, so no destination has been checked for fire proximity. Rows are not flagged, and the downloaded CSV leaves the wildfire column out rather than reporting every row as clear."
                >
                  Wildfire check unavailable
                </span>
              )}
              {/* CC-BY 4.0 requires this credit beside the data itself, not
                  just in the privacy modal; the docked header bar keeps it
                  visible whenever forecasts are on screen. */}
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noopener noreferrer"
                // Both roles carry a color, and they carry the same one. That
                // is deliberate rather than redundant: two colors here would
                // be resolved by stylesheet order, not by the order written.
                className={`${TEXT.micro} ${LINK} ml-auto mr-2`}
              >
                Weather data by Open-Meteo.com
              </a>
              {/* Sits after the credit rather than before it so the credit
                  keeps the one ml-auto in this bar: two of them would split the
                  free space between the pair instead of pushing both right, and
                  the credit has to survive on its own when there is nothing to
                  download. Which is the other condition here — the panel also
                  opens for un-forecasted pending rows, and a file of empty
                  cells is not a report. Wearing the same two roles as the
                  credit because it is the same kind of thing: a quiet aside in
                  a bar whose subject is the title on its left. */}
              {results.length > 0 && (
                <button
                  onClick={handleDownloadCsv}
                  title="Download these results as a CSV file"
                  aria-label="Download these results as a CSV file"
                  className={`${TEXT.micro} ${LINK} mr-2 cursor-pointer`}
                >
                  Download CSV
                </button>
              )}
              <button
                onClick={() => setTableCollapsed((c) => !c)}
                title={tableCollapsed ? 'Expand the table' : 'Collapse the table'}
                aria-label={tableCollapsed ? 'Expand the forecast table' : 'Collapse the forecast table'}
                className="px-1 text-slate-400 hover:text-white"
              >
                <Chevron up={tableCollapsed} />
              </button>
            </div>
            {/* Scrollable table. One container owns BOTH axes: if a nested
                element scrolled horizontally instead, its scrollbar would sit
                below the full table height — off-screen until the user
                scrolled to the last row. results-scrollbars keeps the bars
                visible (macOS overlay scrollbars hide the sideways hint).
                The panel has a drag-resized height on every breakpoint now, so
                the body just fills it (flex-1) and scrolls a long ranking. */}
            {!tableCollapsed && (
              <div className="overflow-auto min-h-0 results-scrollbars flex-1">
                <ResultsTable
                  results={tableRows}
                  sortBy={view.sortBy}
                  sortDesc={view.sortDesc}
                  // A header click on a ranking metric IS the panel knob, so
                  // the two cannot mean different things. Only offered when a
                  // field is held to re-rank.
                  onRank={
                    universe !== null
                      ? (key, desc) => {
                          setSortBy(key)
                          setSortDesc(desc)
                        }
                      : undefined
                  }
                  detailSortKey={detailSort.key}
                  detailSortDir={detailSort.dir}
                  onDetailSort={(key, dir) => setDetailSort({ key, dir })}
                  pointSample={pointSample}
                  fireWarnings={fire.warnings}
                  pending={pending}
                  onRemove={handleRemoveResult}
                  onRemovePending={(d) => searched.removePlace(d.latitude, d.longitude)}
                  onFocusResult={(row) => mapRef.current?.focusResult(row)}
                  onToggleChart={chartable ? chart.toggle : undefined}
                  isCharted={chart.isSelected}
                  chartColor={chart.colorFor}
                  onChartRange={chartable ? chart.setRange : undefined}
                />
              </div>
            )}
          </div>
        )}

        {showResults && response && results.length === 0 && !loading && (
          <div className={`${PROSE.body} flex-shrink-0 border-t border-slate-600 bg-slate-800 px-4 py-3`}>
            {removedKeys.size > 0
              ? 'All rows have been removed from this analysis. Add destinations or adjust the inputs, then Analyze again.'
              : 'No destinations found. Try a larger polygon or different time window.'}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
