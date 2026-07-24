import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView, { MapViewHandle } from './components/MapView'
import ControlPanel from './components/ControlPanel'
import SearchBox from './components/SearchBox'
import ResultsTable from './components/ResultsTable'
import TimeSeriesChart from './components/TimeSeriesChart'
import WelcomeModal from './components/WelcomeModal'
import PrivacyModal from './components/PrivacyModal'
import PreviewBanner from './components/PreviewBanner'
import { useAnalyze } from './hooks/useAnalyze'
import { useChartSelection } from './hooks/useChartSelection'
import { useFireProximity } from './hooks/useFireProximity'
import { useSearchedPlaces } from './hooks/useSearchedPlaces'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import { CustomDestination, DestinationResult, DiscoveryType, GeoPolygon, SortBy } from './types'
import { METRIC_CONFIG, MARKER_COLORS } from './utils/colors'
import { parseCustomCsv } from './utils/customDestinations'
import { buildCustomList, pinKey } from './utils/customList'
import { clampPanelHeight, resolvePanelHeights, splitChartTable } from './utils/layout'
import { composeOverlay } from './utils/analyzeOverlay'
import { Place, isPeakKind } from './utils/geocode'
import { encodeState, decodeState, classifyWindow } from './utils/urlState'

// Composed with the direction into e.g. "lowest total precipitation" /
// "highest average temperature" for the results header.
const SORT_NOUNS: Record<SortBy, string> = {
  precip_total_in: 'total precipitation',
  wind_avg_mph: 'average wind',
  temp_avg_f: 'average temperature',
  aqi_avg: 'average AQI (PM2.5)',
}

function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

  // The discovery inputs (polygon + type + CSV + elevation + limit + sort)
  // behind the results currently on screen. An Analyze whose inputs still match
  // this skips Overpass and just refreshes the known destinations' weather; any
  // change forces a fresh discovery. Updated only on a real discovery run.
  const discoverySignatureRef = useRef<string | null>(null)
  // Remembers each row's real identity (type + osm_id) by coordinate — from
  // discovered rows (which carry an osm_id) and from searched places (whose
  // geocoding knew their kind and OSM id). Rows echoed through the custom path
  // come back as type "custom" with no osm_id; this map restores them so a
  // peak still links to Peakbagger and shows the right badge.
  const identityMapRef = useRef<Map<string, { type: string; osm_id: string | null }>>(new Map())
  // Rows the user ×-removed from the current report, by coordinate key. A
  // same-inputs refresh echoes only the surviving rows so removals stick; any
  // fresh analysis clears this — changed inputs may bring a destination back.
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set())

  // Restore any prior session encoded in the URL once, at mount. Feeding each
  // useState a lazy initializer avoids a redraw flash — the restored values are
  // the initial render, not a post-mount setState.
  const restoredRef = useRef(decodeState(window.location.search))
  const restored = restoredRef.current

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
  const [startDatetime, setStartDatetime] = useState(() => restored?.startDatetime ?? nowLocal())
  // End pre-fills to "now" like Start: an equal window is valid ("the current
  // forecast" — the backend analyzes the hour at hand), so a fresh load can
  // Analyze immediately once any destination input exists.
  const [endDatetime, setEndDatetime] = useState(() => restored?.endDatetime ?? nowLocal())
  const [limit, setLimit] = useState(() => restored?.limit ?? 100)
  const [customCsv, setCustomCsv] = useState(() => restored?.customCsv ?? '')
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
  const [isDragging, setIsDragging] = useState(false)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('bluebird_welcomed'))
  // Privacy notice, opened from the controls footer. Rendered at the App root
  // (not inside the panel) because the panel's `transform` would otherwise
  // become the containing block for the modal's `position: fixed`.
  const [showPrivacy, setShowPrivacy] = useState(false)
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

  const { analyze, cancel, retry, reset, analyzed, loading, error, response, statusMessage, progress } = useAnalyze()

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
  }

  // Everything derived from the results renders from the snapshot of the
  // ranking that produced them — panel knobs only affect the NEXT Analyze.
  // Falls back to the live knobs before the first analysis (nothing shown yet).
  const view = analyzed ?? { sortBy, sortDesc }
  const preview = usePreview()

  // The loading overlay for the one ranked streaming analysis — searched
  // places ride inside it as custom destinations, so there is no separate pin
  // refresh to fold in anymore.
  const overlay = composeOverlay({
    analyzeLoading: loading,
    statusMessage,
    rankedProgress: progress ? { processed: progress.processed, total: progress.total } : null,
  })

  // Elapsed-time counter for phases with no countable progress (the OSM search,
  // and the pins-only refresh). Runs whenever the overlay is up but no batch
  // progress is reported yet.
  const [elapsed, setElapsed] = useState(0)
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
  useEffect(() => {
    const qs = encodeState({
      polygon,
      destinationType,
      startDatetime,
      endDatetime,
      sortBy,
      sortDesc,
      minElevationFt,
      maxElevationFt,
      limit,
      customCsv,
      showWildfires,
      pins: searched.places,
    })
    const url = qs ? `?${qs}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [
    polygon,
    destinationType,
    startDatetime,
    endDatetime,
    sortBy,
    sortDesc,
    minElevationFt,
    maxElevationFt,
    limit,
    customCsv,
    showWildfires,
    searched.places,
  ])

  // Warn when a restored/edited window falls outside Open-Meteo's servable
  // range. Blocks Analyze (in ControlPanel): Open-Meteo rejects out-of-range
  // dates outright, so submitting would only produce an upstream error.
  const windowStatus = classifyWindow(startDatetime, endDatetime, new Date())
  const windowWarning = windowStatus === 'ok' ? null : windowStatus

  const handleDrawUpdate = useCallback((count: number, areaKm2: number | null) => {
    setDrawPointCount(count)
    setPolygonAreaKm2(areaKm2)
  }, [])

  function handleCancelDrawing() {
    mapRef.current?.cancelDrawing()
    // cancelDrawing fires onDrawUpdate(0, null) to reset counts
  }


  // The discovery inputs behind the on-screen results, as a stable string. Two
  // Analyzes with equal signatures discovered the same set, so the second can
  // skip Overpass and just refetch weather. Everything that changes which
  // destinations are found or how they're ranked/truncated belongs here — the
  // custom list included (parsed, so a comment or whitespace edit in the
  // textarea doesn't needlessly bust the refresh).
  function discoverySignature(poly: GeoPolygon | null, custom: CustomDestination[]): string {
    return JSON.stringify({
      ring: poly?.coordinates[0] ?? null,
      type: destinationType,
      custom,
      minEl: minElevationFt,
      maxEl: maxElevationFt,
      limit,
      sortBy,
      sortDesc,
    })
  }

  async function handleAnalyze() {
    const start = new Date(startDatetime).toISOString()
    const end = new Date(endDatetime).toISOString()

    const constraints = { min_elevation_ft: minElevationFt, max_elevation_ft: maxElevationFt }

    // Resolve the ranked inputs first. The custom side of the analysis is the
    // pasted CSV ∪ the searched places — with a *complete* polygon (>= 3
    // points) the backend unions discovery in too. An incomplete ring is
    // ignored so a mid-draw Analyze doesn't fire a bogus discovery.
    // finishDrawing() snapshots the map's always-editable ring synchronously
    // (and closes it), falling back to the restored polygon before the map has
    // loaded.
    const custom = buildCustomList(parseCustomCsv(customCsv), searched.places)
    const resolvedPolygon =
      drawPointCount >= 3 ? mapRef.current?.finishDrawing() ?? polygon : null

    // A polygon run whose discovery inputs are unchanged, with results still on
    // screen, is a pure refresh: skip Overpass and refetch just those
    // destinations' weather through the custom path. Any change to the inputs
    // (polygon, type, CSV, elevation, limit, sort) falls through to a fresh
    // discovery.
    const signature = discoverySignature(resolvedPolygon, custom)
    const isRefresh =
      resolvedPolygon !== null &&
      response !== null &&
      response.results.length > 0 &&
      discoverySignatureRef.current === signature

    const willRank = resolvedPolygon !== null || custom.length > 0

    if (isRefresh && response) {
      // Refresh: weather-only over the known destinations (no Overpass). They
      // come back as type "custom" with no osm_id; the results memo restores
      // each row's real identity by coordinate. The discovery signature stays
      // put — the discovered set didn't change. Echoing the *displayed* rows
      // (not the raw response) is what keeps ×-removed destinations gone.
      await analyze({
        destination_type: 'custom',
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        custom_destinations: results.map((r) => ({
          name: r.name,
          latitude: r.latitude,
          longitude: r.longitude,
          elevation_ft: r.elevation_ft ?? undefined,
        })),
        ...constraints,
      })
    } else if (resolvedPolygon) {
      // A fresh analysis re-opens the field: rows the user removed from the
      // previous report may legitimately return under the changed inputs.
      setRemovedKeys(new Set())
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
      })
      // Remember these discovery inputs so the next identical Analyze refreshes.
      discoverySignatureRef.current = signature
    } else if (custom.length > 0) {
      // Custom-only (CSV and/or searched places). Not a refreshable polygon
      // discovery — clear the signature so a later identical polygon Analyze
      // can't mistake these rows for that polygon's discovered set.
      discoverySignatureRef.current = null
      setRemovedKeys(new Set())
      await analyze({
        destination_type: 'custom',
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        custom_destinations: custom,
        ...constraints,
      })
    }

    // Nothing to rank (unreachable through the gate, which requires an input,
    // but kept as a safety net): drop any stale report.
    if (!willRank) reset()

    setShowResults(true)
  }

  // Record every discovered row's OSM identity (rows that carry an osm_id) so a
  // later refresh — which comes back through the custom path with osm_id null —
  // can have its identity restored below. Runs after each response lands.
  useEffect(() => {
    if (!response) return
    for (const r of response.results) {
      if (r.osm_id) identityMapRef.current.set(pinKey(r.latitude, r.longitude), { type: r.type, osm_id: r.osm_id })
    }
  }, [response])

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

  // Memoized so its reference is stable between renders — the fire-proximity
  // effect keys off it and would otherwise re-run (and refetch) every render.
  // Rows returned without an osm_id (a refresh's custom echo) are re-tagged from
  // the remembered discovery identities by coordinate; genuine custom-CSV rows
  // simply have no match and pass through unchanged.
  const results = useMemo(
    () =>
      (response?.results ?? [])
        .filter((r) => !removedKeys.has(pinKey(r.latitude, r.longitude)))
        .map((r) => {
          if (r.osm_id) return r
          const id = identityMapRef.current.get(pinKey(r.latitude, r.longitude))
          return id ? { ...r, type: id.type, osm_id: id.osm_id } : r
        }),
    [response, removedKeys],
  )

  // × on a table row. Removing a searched place also deregisters it — else the
  // next analysis would simply rediscover it from the searched list.
  function handleRemoveResult(row: DestinationResult) {
    setRemovedKeys((prev) => new Set(prev).add(pinKey(row.latitude, row.longitude)))
    searched.removePlace(row.latitude, row.longitude)
  }

  // Searched places absent from the displayed report — not yet analyzed, ranked
  // below the cutoff, or awaiting a fresh run — drawn as neutral pending dots.
  const pendingPlaces = useMemo(() => {
    const shown = new Set(results.map((r) => pinKey(r.latitude, r.longitude)))
    return searched.places.filter((p) => !shown.has(pinKey(p.lat, p.lon)))
  }, [results, searched.places])
  const hasColoredMarkers = showResults && results.length > 0
  const showTable = showResults && results.length > 0

  // Flags results within 10 mi of an active US wildfire; independent of the map
  // overlay toggle. Empty (no ⚠️) when best-effort NIFC data is unavailable.
  const fireWarnings = useFireProximity(results)

  // Comparison-chart selection (checkboxes in the table → lines in the chart).
  // Every row shares the analysis's hourly grid.
  const chartTimes = response?.times ?? []
  const chartable = chartTimes.length > 0
  const chart = useChartSelection(results, view.sortBy)
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
  const { chart: chartPanelPx, table: tablePanelPx } = resolvePanelHeights(
    chartHeight,
    tableHeight,
    { chartShown, tableShown: showTable, availPx: viewportH - bannerPx },
  )

  return (
    <div className="flex flex-col h-dvh w-screen overflow-hidden bg-slate-900">
      {preview.enabled && <PreviewBanner pr={preview.pr} commit={preview.commit} />}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
      {showWelcome && <WelcomeModal onDismiss={dismissWelcome} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
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
          className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-700/80 text-slate-200 text-xl leading-none hover:bg-slate-600 active:bg-slate-600"
        >
          ×
        </button>
        <ControlPanel
          drawPointCount={drawPointCount}
          polygonAreaKm2={polygonAreaKm2}
          onCancelDrawing={handleCancelDrawing}
          destinationType={destinationType}
          setDestinationType={setDestinationType}
          startDatetime={startDatetime}
          setStartDatetime={setStartDatetime}
          endDatetime={endDatetime}
          setEndDatetime={setEndDatetime}
          limit={limit}
          setLimit={setLimit}
          customCsv={customCsv}
          setCustomCsv={setCustomCsv}
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
          onAnalyze={() => {
            // On mobile the controls are an off-canvas drawer — close it so the
            // user sees the map/results. On desktop the panel is docked; leave it.
            if (!isDesktop) setSidebarOpen(false)
            handleAnalyze()
          }}
          onRetry={retry}
          onShowPrivacy={() => setShowPrivacy(true)}
          resultCount={response ? results.length : undefined}
          totalQueried={response?.total_queried}
        />
      </aside>

      {/* Map + results column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 relative">
          {overlay.visible && (
            <div className="absolute inset-0 bg-slate-900/60 z-20 flex items-center justify-center">
              <div className="bg-slate-800 border border-slate-600 rounded-lg px-6 py-5 text-center shadow-xl w-[280px]">
                <img
                  src="/icon.png"
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover mx-auto mb-3 animate-pulse"
                />
                <p className="text-white font-semibold text-sm leading-snug">
                  {overlay.message}
                </p>
                {overlay.progress ? (
                  // Weather phase — countable batch progress (the union count is
                  // already in the "(x/y)" headline, so the bar just visualizes it).
                  <div className="mt-3">
                    <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
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
                    <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
                      <div className="h-full w-1/3 rounded-full bg-sky-500 animate-indeterminate" />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400 font-mono">
                      Elapsed {elapsed}s
                    </p>
                  </div>
                )}
                <button
                  onClick={cancel}
                  className="mt-4 text-xs font-medium text-slate-400 hover:text-white
                    border border-slate-600 hover:border-slate-400 rounded px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <MapView
            ref={mapRef}
            polygon={polygon}
            onPolygonChange={setPolygon}
            onDrawUpdate={handleDrawUpdate}
            results={results}
            sortBy={view.sortBy}
            fireWarnings={fireWarnings}
            showWildfires={showWildfires}
            pendingPlaces={pendingPlaces}
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
                className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-slate-800/95 border border-slate-600 px-3 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-sm transition-colors hover:border-sky-400 hover:text-sky-400 active:bg-slate-700"
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
                <div className="bg-slate-900/85 border border-slate-700 rounded-lg px-2.5 py-2 shadow-lg backdrop-blur-sm">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-3 h-3 rounded-sm border"
                      style={{ backgroundColor: 'rgba(220,38,38,0.35)', borderColor: '#b91c1c' }}
                    />
                    <span className="text-[11px] text-slate-300">Active Wildfire</span>
                  </div>
                </div>
              )}
              {hasColoredMarkers && (
                <div className="bg-slate-900/85 border border-slate-700 rounded-lg p-2.5 shadow-lg backdrop-blur-sm">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {METRIC_CONFIG[view.sortBy].label}
                  </p>
                  {MARKER_COLORS.map((color, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5">
                      <span style={{ color }} className="text-sm leading-none">●</span>
                      <span className="text-[11px] text-slate-300 font-mono">
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
            style={{ height: `${chartPanelPx}px` }}
          >
            {/* Drag handle — the map│chart divider. Dragging up grows the chart,
                stealing height from the map above; the table below stays put
                (tablePanelPx is 0 when the table is closed). Pointer events +
                touch-none so a finger resizes it on mobile too. */}
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
              <div className="w-10 h-0.5 rounded-full bg-slate-500 group-hover:bg-slate-300 transition-colors" />
            </div>
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-600 bg-slate-700 px-3 py-1">
              <span className="text-xs font-semibold text-white">
                Forecast comparison — {chart.selectedRows.length} selected
              </span>
              <button
                onClick={chart.clear}
                className="px-1 text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <TimeSeriesChart
                times={chartTimes}
                rows={chart.selectedRows}
                metric={chart.metric}
                onMetricChange={chart.setMetric}
                colorFor={chart.colorFor}
              />
            </div>
          </div>
        )}
        {showTable && (
          <div
            className="flex-shrink-0 bg-slate-800 flex flex-col"
            style={{ height: `${tablePanelPx}px` }}
          >
            {/* Drag handle. With the chart above, this is the chart│table divider:
                dragging up grows the table by shrinking the chart, leaving the map
                untouched. With no chart it steals from the map like the chart
                handle. Pointer events + touch-none for mobile. */}
            <div
              onPointerDown={(e) =>
                beginResize(e, (up) => {
                  if (chartShown) {
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
              <div className="w-10 h-0.5 rounded-full bg-slate-500 group-hover:bg-slate-300 transition-colors" />
            </div>
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-slate-700 border-b border-slate-600">
              <span className="text-xs font-semibold text-white">
                {results.length > 0
                  ? `Results — ${view.sortDesc ? 'highest' : 'lowest'} ${SORT_NOUNS[view.sortBy]} first`
                  : 'Pinned location forecasts'}
              </span>
              <button
                onClick={() => setShowResults(false)}
                className="text-slate-400 hover:text-white text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
            {/* Scrollable table. One container owns BOTH axes: if a nested
                element scrolled horizontally instead, its scrollbar would sit
                below the full table height — off-screen until the user
                scrolled to the last row. results-scrollbars keeps the bars
                visible (macOS overlay scrollbars hide the sideways hint).
                The panel has a drag-resized height on every breakpoint now, so
                the body just fills it (flex-1) and scrolls a long ranking. */}
            <div className="overflow-auto min-h-0 results-scrollbars flex-1">
              <ResultsTable
                results={results}
                sortBy={view.sortBy}
                sortDesc={view.sortDesc}
                fireWarnings={fireWarnings}
                onRemove={handleRemoveResult}
                onFocusResult={(row) => mapRef.current?.focusResult(row)}
                onToggleChart={chartable ? chart.toggle : undefined}
                isCharted={chart.isSelected}
                chartColor={chart.colorFor}
                onChartRange={chartable ? chart.setRange : undefined}
              />
            </div>
          </div>
        )}

        {showResults && response && results.length === 0 && !loading && (
          <div className="flex-shrink-0 border-t border-slate-600 bg-slate-800 px-4 py-3 text-sm text-slate-400">
            No destinations found. Try a larger polygon or different time window.
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
