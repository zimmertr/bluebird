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
import { usePinnedForecasts } from './hooks/usePinnedForecasts'
import { usePreview } from './hooks/usePreview'
import { useIsDesktop } from './hooks/useIsDesktop'
import { GeoPolygon, DestinationType, SortBy } from './types'
import { METRIC_CONFIG, MARKER_COLORS } from './utils/colors'
import { parseCustomCsv } from './utils/customDestinations'
import { Place } from './utils/geocode'
import { encodeState, decodeState, classifyWindow, resolveSearchWindow } from './utils/urlState'

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

export default function App() {
  const mapRef = useRef<MapViewHandle>(null)

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
  const [destinationType, setDestinationType] = useState<DestinationType>(
    () => restored?.destinationType ?? 'peak',
  )
  const [startDatetime, setStartDatetime] = useState(() => restored?.startDatetime ?? nowLocal())
  const [endDatetime, setEndDatetime] = useState(() => restored?.endDatetime ?? '')
  const [limit, setLimit] = useState(() => restored?.limit ?? 10)
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
  // A vertical resize handle: drag up to grow the panel (stealing height from
  // the map above), down to shrink. Shared by the results table and the chart
  // band above it — each handle drags its own panel, the map absorbs the rest.
  function resizeHandler(current: number, setHeight: (h: number) => void) {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      setIsDragging(true)

      function onMove(ev: MouseEvent) {
        const next = Math.max(120, Math.min(current + (startY - ev.clientY), window.innerHeight - 150))
        setHeight(next)
      }

      function onUp() {
        setIsDragging(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }

  const { analyze, cancel, retry, analyzed, loading, error, response, statusMessage, progress } = useAnalyze()

  // Searched locations pinned to the map and table. Each search adds (or
  // refreshes) a pin; pins persist until their 📍 is clicked in the table.
  const pinnedForecasts = usePinnedForecasts()
  const pinnedRows = pinnedForecasts.rows

  // A pinned forecast opens the results panel so the rows are visible even
  // before any analysis has run (or after the panel was closed).
  useEffect(() => {
    if (pinnedRows.length > 0) setShowResults(true)
  }, [pinnedRows])

  function handleSearchSelect(place: Place) {
    mapRef.current?.flyToPlace(place)
    const searchWindow = resolveSearchWindow(startDatetime, endDatetime, new Date())
    pinnedForecasts.addPlace(place, searchWindow.start, searchWindow.end)
  }

  // Everything derived from the results renders from the snapshot of the
  // ranking that produced them — panel knobs only affect the NEXT Analyze.
  // Falls back to the live knobs before the first analysis (nothing shown yet).
  const view = analyzed ?? { sortBy, sortDesc }
  const preview = usePreview()

  // Elapsed-time counter for phases with no countable progress (the OSM search).
  // Runs while loading but before the weather phase reports batch progress.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!loading) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250)
    return () => clearInterval(id)
  }, [loading])

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

  async function handleAnalyze() {
    const start = new Date(startDatetime).toISOString()
    const end = new Date(endDatetime).toISOString()

    const constraints = { min_elevation_ft: minElevationFt, max_elevation_ft: maxElevationFt }

    // The pinned rows join every analysis, refetched together with the same
    // window so they stay comparable with the report they sit above.
    if (destinationType === 'custom') {
      pinnedForecasts.refetchAll(start, end)
      await analyze({
        destination_type: 'custom',
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        custom_destinations: parseCustomCsv(customCsv),
        ...constraints,
      })
    } else {
      // Snapshot the map's current (always-editable) ring. finishDrawing()
      // returns the closed GeoPolygon synchronously so we don't have to wait
      // for the React state update; falls back to the restored polygon if the
      // map hasn't loaded yet.
      const resolvedPolygon = mapRef.current?.finishDrawing() ?? polygon
      if (!resolvedPolygon) return
      pinnedForecasts.refetchAll(start, end)
      await analyze({
        polygon: resolvedPolygon,
        destination_type: destinationType,
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        sort_desc: sortDesc,
        ...constraints,
      })
    }

    setShowResults(true)
  }

  // Memoized so its reference is stable between renders — the fire-proximity
  // effect keys off it and would otherwise re-run (and refetch) every render.
  const results = useMemo(() => response?.results ?? [], [response])
  const hasResults = showResults && results.length > 0
  // The table panel also opens for pinned search forecasts alone; the map
  // legend stays tied to actual analysis results (hasResults).
  const showTable = showResults && (results.length > 0 || pinnedRows.length > 0)

  // Flags results within 10 mi of an active US wildfire; independent of the map
  // overlay toggle. Empty (no ⚠️) when best-effort NIFC data is unavailable.
  // Pinned search rows are checked right alongside the ranked rows.
  const fireCheckRows = useMemo(() => [...results, ...pinnedRows], [results, pinnedRows])
  const fireWarnings = useFireProximity(fireCheckRows)

  // Comparison-chart selection (checkboxes in the table → lines in the chart).
  // The shared hourly grid comes from the analysis, or — when only searched
  // places are pinned — from the pins themselves, so pins are chartable alone.
  const analysisTimes = response?.times ?? []
  const pinnedTimes = pinnedRows.find((r) => r.series_times?.length)?.series_times ?? []
  const chartTimes = analysisTimes.length ? analysisTimes : pinnedTimes
  const chartable = chartTimes.length > 0
  const chart = useChartSelection(results, pinnedRows, view.sortBy)

  return (
    <div className="flex flex-col h-dvh w-screen overflow-hidden bg-slate-900">
      {preview.enabled && <PreviewBanner pr={preview.pr} commit={preview.commit} />}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
      {showWelcome && <WelcomeModal onDismiss={dismissWelcome} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      {isDragging && <div className="fixed inset-0 z-50 cursor-ns-resize" />}

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
          resultCount={response?.results.length}
          totalQueried={response?.total_queried}
        />
      </aside>

      {/* Map + results column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 bg-slate-900/60 z-20 flex items-center justify-center">
              <div className="bg-slate-800 border border-slate-600 rounded-lg px-6 py-5 text-center shadow-xl w-[280px]">
                <img
                  src="/icon.png"
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover mx-auto mb-3 animate-pulse"
                />
                <p className="text-white font-semibold text-sm leading-snug">
                  {statusMessage ?? 'Starting…'}
                </p>
                {progress ? (
                  // Weather phase — countable batch progress.
                  <div className="mt-3">
                    <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-sky-500 transition-all duration-300 ease-out"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400 font-mono">
                      {progress.processed} of {progress.total} destinations · {progress.percent}%
                    </p>
                  </div>
                ) : (
                  // Search phase — no countable progress; show activity + elapsed.
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
            showWildfires={showWildfires}
            searchPins={pinnedForecasts.places}
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
          {(hasResults || showWildfires) && (
            <div className="absolute bottom-8 left-2 z-10 flex flex-col gap-2">
              {showWildfires && (
                <div className="bg-slate-900/85 border border-slate-700 rounded-lg px-2.5 py-2 shadow-lg backdrop-blur-sm">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-3 h-3 rounded-sm border"
                      style={{ backgroundColor: 'rgba(220,38,38,0.35)', borderColor: '#b91c1c' }}
                    />
                    <span className="text-[11px] text-slate-300">Active wildfire (NIFC)</span>
                  </div>
                </div>
              )}
              {hasResults && (
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

        {chartable && chart.selectedRows.length > 0 && (
          <div
            className="flex h-56 flex-shrink-0 flex-col bg-slate-800 lg:h-auto"
            style={isDesktop ? { height: `${chartHeight}px` } : undefined}
          >
            {/* Drag handle — mouse-only, so desktop only. Resizes the chart band
                against the map above it, mirroring the results table below. */}
            {isDesktop && (
              <div
                onMouseDown={resizeHandler(chartHeight, setChartHeight)}
                className="flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize bg-slate-700 border-t border-b border-slate-600 hover:bg-slate-600 transition-colors group"
              >
                <div className="w-10 h-0.5 rounded-full bg-slate-500 group-hover:bg-slate-300 transition-colors" />
              </div>
            )}
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
                onSetColor={chart.setColor}
                onRemove={chart.toggle}
              />
            </div>
          </div>
        )}
        {showTable && (
          <div
            className="flex-shrink-0 bg-slate-800 flex flex-col h-[55dvh] lg:h-auto"
            style={isDesktop ? { height: `${tableHeight}px` } : undefined}
          >
            {/* Drag handle — mouse-only, so desktop only */}
            {isDesktop && (
              <div
                onMouseDown={resizeHandler(tableHeight, setTableHeight)}
                className="flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize bg-slate-700 border-t border-b border-slate-600 hover:bg-slate-600 transition-colors group"
              >
                <div className="w-10 h-0.5 rounded-full bg-slate-500 group-hover:bg-slate-300 transition-colors" />
              </div>
            )}
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
                visible (macOS overlay scrollbars hide the sideways hint). */}
            <div className="flex-1 overflow-auto min-h-0 results-scrollbars">
              <ResultsTable
                results={results}
                sortBy={view.sortBy}
                sortDesc={view.sortDesc}
                fireWarnings={fireWarnings}
                pinned={pinnedRows}
                onUnpin={(row) => pinnedForecasts.removePlace(row.latitude, row.longitude)}
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
