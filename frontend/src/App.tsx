import { useCallback, useRef, useState } from 'react'
import MapView, { MapViewHandle } from './components/MapView'
import ControlPanel from './components/ControlPanel'
import ResultsTable from './components/ResultsTable'
import { useAnalyze } from './hooks/useAnalyze'
import { GeoPolygon, DestinationType, CustomDestination, SortBy } from './types'
import { METRIC_CONFIG, MARKER_COLORS } from './utils/colors'

const SORT_LABELS: Record<SortBy, string> = {
  precip_total_in: 'least total precipitation',
  precip_max_in_hr: 'least peak precipitation',
  wind_avg_mph: 'least average wind',
  wind_max_mph: 'least max wind',
  temp_avg_f: 'coldest average temperature',
}

function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseCustomCsv(csv: string): CustomDestination[] {
  const results: CustomDestination[] = []
  let idx = 1
  for (const raw of csv.split('\n')) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const parts = l.split(',').map((p) => p.trim())
    if (parts.length < 2) continue
    const lat = parseFloat(parts[0])
    const lon = parseFloat(parts[1])
    if (isNaN(lat) || isNaN(lon)) continue
    results.push({ name: `Location ${idx++}`, latitude: lat, longitude: lon })
  }
  return results
}

export default function App() {
  const mapRef = useRef<MapViewHandle>(null)

  const [polygon, setPolygon] = useState<GeoPolygon | null>(null)
  const [drawMode, setDrawMode] = useState(true)
  const [drawPointCount, setDrawPointCount] = useState(0)
  const [polygonAreaKm2, setPolygonAreaKm2] = useState<number | null>(null)
  const [destinationType, setDestinationType] = useState<DestinationType>('peak')
  const [startDatetime, setStartDatetime] = useState(nowLocal())
  const [endDatetime, setEndDatetime] = useState('')
  const [limit, setLimit] = useState(10)
  const [customCsv, setCustomCsv] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('precip_total_in')
  const [minElevationFt, setMinElevationFt] = useState<number | null>(null)
  const [maxElevationFt, setMaxElevationFt] = useState<number | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [tableHeight, setTableHeight] = useState(280)
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef<{ startY: number; startH: number } | null>(null)

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault()
    dragState.current = { startY: e.clientY, startH: tableHeight }
    setIsDragging(true)

    function onMove(e: MouseEvent) {
      if (!dragState.current) return
      const delta = dragState.current.startY - e.clientY
      const next = Math.max(120, Math.min(dragState.current.startH + delta, window.innerHeight - 150))
      setTableHeight(next)
    }

    function onUp() {
      dragState.current = null
      setIsDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const { analyze, loading, error, response, statusMessage } = useAnalyze()

  const handleDrawUpdate = useCallback((count: number, areaKm2: number | null) => {
    setDrawPointCount(count)
    setPolygonAreaKm2(areaKm2)
  }, [])

  function handleStartDrawing() {
    mapRef.current?.cancelDrawing()
    setDrawMode(true)
    setDrawPointCount(0)
    setPolygonAreaKm2(null)
  }

  function handleCancelDrawing() {
    mapRef.current?.cancelDrawing()
    // Stay in draw mode — cancelDrawing fires onDrawUpdate(0, null) to reset counts
  }

  async function handleAnalyze() {
    const start = new Date(startDatetime).toISOString()
    const end = new Date(endDatetime).toISOString()

    const constraints = { min_elevation_ft: minElevationFt, max_elevation_ft: maxElevationFt }

    if (destinationType === 'custom') {
      await analyze({
        destination_type: 'custom',
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        custom_destinations: parseCustomCsv(customCsv),
        ...constraints,
      })
    } else {
      // Auto-close the polygon if the user is still in draw mode.
      // finishDrawing() returns the closed GeoPolygon synchronously so we
      // don't have to wait for the React state update.
      let resolvedPolygon: GeoPolygon | null = polygon
      if (drawMode) {
        resolvedPolygon = mapRef.current?.finishDrawing() ?? null
        if (!resolvedPolygon) return
        setDrawMode(false)
        setDrawPointCount(0)
      }
      if (!resolvedPolygon) return
      await analyze({
        polygon: resolvedPolygon,
        destination_type: destinationType,
        start_datetime: start,
        end_datetime: end,
        limit,
        sort_by: sortBy,
        ...constraints,
      })
    }

    setShowResults(true)
  }

  const results = response?.results ?? []
  const hasResults = showResults && results.length > 0

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-900">
      {isDragging && <div className="fixed inset-0 z-50 cursor-ns-resize" />}
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 bg-slate-800 flex flex-col overflow-hidden border-r border-slate-700 z-10">
        <ControlPanel
          polygon={polygon}
          drawMode={drawMode}
          drawPointCount={drawPointCount}
          polygonAreaKm2={polygonAreaKm2}
          onStartDrawing={handleStartDrawing}
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
          minElevationFt={minElevationFt}
          setMinElevationFt={setMinElevationFt}
          maxElevationFt={maxElevationFt}
          setMaxElevationFt={setMaxElevationFt}
          loading={loading}
          error={error}
          onAnalyze={handleAnalyze}
          resultCount={response?.results.length}
          totalQueried={response?.total_queried}
        />
      </aside>

      {/* Map + results column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 bg-slate-900/60 z-20 flex items-center justify-center">
              <div className="bg-slate-800 border border-slate-600 rounded-lg px-6 py-5 text-center shadow-xl max-w-[260px]">
                <img
                  src="/icon.png"
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover mx-auto mb-3 animate-pulse"
                />
                <p className="text-white font-semibold text-sm leading-snug">
                  {statusMessage ?? 'Starting…'}
                </p>
              </div>
            </div>
          )}
          <MapView
            ref={mapRef}
            polygon={polygon}
            drawMode={drawMode}
            onPolygonChange={setPolygon}
            onDrawUpdate={handleDrawUpdate}
            results={results}
            sortBy={sortBy}
          />
          {hasResults && (
            <div className="absolute bottom-8 left-2 z-10 bg-slate-900/85 border border-slate-700 rounded-lg p-2.5 shadow-lg backdrop-blur-sm">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {METRIC_CONFIG[sortBy].label}
              </p>
              {MARKER_COLORS.map((color, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  <span style={{ color }} className="text-sm leading-none">●</span>
                  <span className="text-[11px] text-slate-300 font-mono">
                    {METRIC_CONFIG[sortBy].legendLabels[i]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasResults && (
          <div
            className="flex-shrink-0 bg-slate-800 flex flex-col"
            style={{ height: `${tableHeight}px` }}
          >
            {/* Drag handle */}
            <div
              onMouseDown={handleDragStart}
              className="flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize bg-slate-700 border-t border-b border-slate-600 hover:bg-slate-600 transition-colors group"
            >
              <div className="w-10 h-0.5 rounded-full bg-slate-500 group-hover:bg-slate-300 transition-colors" />
            </div>
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-slate-700 border-b border-slate-600">
              <span className="text-xs font-semibold text-white">
                Results — sorted by {SORT_LABELS[sortBy]}
              </span>
              <button
                onClick={() => setShowResults(false)}
                className="text-slate-400 hover:text-white text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
            {/* Scrollable table */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <ResultsTable results={results} sortBy={sortBy} />
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
  )
}
