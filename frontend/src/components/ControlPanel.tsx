import { GeoPolygon, DestinationType, CustomDestination, SortBy } from '../types'
import { MAX_AREA_KM2 } from './MapView'
import {
  classifyAqiCoverage,
  AQI_LIMIT_DAYS,
  PAST_LIMIT_DAYS,
  FUTURE_LIMIT_DAYS,
} from '../utils/urlState'

// Constrain the native date pickers to Open-Meteo's servable range so an
// unservable window (e.g. a year ahead) can't be picked in the first place.
// Typed-in dates can still exceed this — classifyWindow blocks those.
function pickableDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Ranking = metric × window-aggregation, but each metric only offers the
// aggregations that discriminate for it: min hourly precip is ~0 everywhere,
// and precip's natural pair is Total/Peak rather than Avg/Max. Every combo
// still composes into the flat SortBy key the backend and URL already speak.
const SORT_METRICS: {
  label: string
  defaultSort: SortBy
  options: { value: SortBy; label: string }[]
}[] = [
  {
    label: 'Precipitation',
    defaultSort: 'precip_total_in',
    options: [
      { value: 'precip_total_in', label: 'Total' },
      { value: 'precip_max_in_hr', label: 'Peak hour' },
    ],
  },
  {
    label: 'Wind',
    defaultSort: 'wind_avg_mph',
    options: [
      { value: 'wind_avg_mph', label: 'Avg' },
      { value: 'wind_max_mph', label: 'Max' },
    ],
  },
  {
    label: 'Temperature',
    defaultSort: 'temp_avg_f',
    options: [
      { value: 'temp_min_f', label: 'Min' },
      { value: 'temp_avg_f', label: 'Avg' },
      { value: 'temp_max_f', label: 'Max' },
    ],
  },
  {
    label: 'AQI (PM2.5)',
    defaultSort: 'aqi_avg',
    options: [
      { value: 'aqi_avg', label: 'Avg' },
      { value: 'aqi_max', label: 'Max' },
    ],
  },
]

const DESTINATION_TYPES: { value: DestinationType; label: string; implemented: boolean }[] = [
  { value: 'peak', label: 'Peaks', implemented: true },
  { value: 'trailhead', label: 'Trailheads', implemented: false },
  { value: 'lake', label: 'Lakes', implemented: false },
  { value: 'custom', label: 'Custom (CSV)', implemented: true },
]

interface Props {
  polygon: GeoPolygon | null
  drawMode: boolean
  drawPointCount: number
  polygonAreaKm2: number | null
  onStartDrawing: () => void
  onCancelDrawing: () => void
  destinationType: DestinationType
  setDestinationType: (t: DestinationType) => void
  startDatetime: string
  setStartDatetime: (s: string) => void
  endDatetime: string
  setEndDatetime: (s: string) => void
  limit: number
  setLimit: (n: number) => void
  customCsv: string
  setCustomCsv: (s: string) => void
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  minElevationFt: number | null
  setMinElevationFt: (v: number | null) => void
  maxElevationFt: number | null
  setMaxElevationFt: (v: number | null) => void
  windowWarning: 'past' | 'future' | null
  loading: boolean
  error: string | null
  onAnalyze: () => void
  onRetry: () => void
  resultCount?: number
  totalQueried?: number
}

export default function ControlPanel({
  polygon,
  drawMode,
  drawPointCount,
  polygonAreaKm2,
  onStartDrawing,
  onCancelDrawing,
  destinationType,
  setDestinationType,
  startDatetime,
  setStartDatetime,
  endDatetime,
  setEndDatetime,
  limit,
  setLimit,
  customCsv,
  setCustomCsv,
  sortBy,
  setSortBy,
  minElevationFt,
  setMinElevationFt,
  maxElevationFt,
  setMaxElevationFt,
  windowWarning,
  loading,
  error,
  onAnalyze,
  onRetry,
  resultCount,
  totalQueried,
}: Props) {
  const needsPolygon = destinationType !== 'custom'
  const hasPolygon = polygon !== null
  const hasCustom = destinationType === 'custom' && parseCustomCsv(customCsv).length > 0
  const hasDates = startDatetime !== '' && endDatetime !== ''
  const areaTooLarge = polygonAreaKm2 !== null && polygonAreaKm2 > MAX_AREA_KM2

  const polygonReady = drawMode ? drawPointCount >= 3 && !areaTooLarge : hasPolygon
  const canAnalyze =
    hasDates &&
    !windowWarning &&
    !loading &&
    (needsPolygon ? polygonReady : hasCustom) &&
    !areaTooLarge

  // Informational only — never blocks Analyze. AQI simply degrades to "—".
  const aqiCoverage = classifyAqiCoverage(startDatetime, endDatetime, new Date())

  const minPickable = pickableDate(-PAST_LIMIT_DAYS)
  const maxPickable = pickableDate(FUTURE_LIMIT_DAYS)

  const pointsNeeded = Math.max(0, 3 - drawPointCount)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-slate-700 flex">
        <img src="/icon.png" alt="" className="w-20 object-cover flex-shrink-0" />
        <div className="px-3 py-4 flex flex-col justify-center">
          <h1 className="text-lg font-bold text-white leading-tight">Bluebird</h1>
          <p className="text-xs text-slate-400">Weather Window Finder</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Step 1: Draw area */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            1. Draw Search Area
          </h2>

          {destinationType === 'custom' ? (
            <p className="text-xs text-slate-500 italic">Not needed — using CSV destinations.</p>
          ) : drawMode ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-300 space-y-0.5">
                {drawPointCount === 0 ? (
                  <p className="text-slate-400 italic">Click anywhere on the map to start drawing.</p>
                ) : pointsNeeded > 0 ? (
                  <p className="text-sky-300">
                    {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed —{' '}
                    {pointsNeeded} more needed. Click a point to remove it.
                  </p>
                ) : (
                  <p className="text-green-400 font-medium">
                    {drawPointCount} points placed — click Analyze when ready.
                  </p>
                )}
                {polygonAreaKm2 !== null && (
                  <p className={areaTooLarge ? 'text-red-400' : 'text-slate-400'}>
                    ~{Math.round(polygonAreaKm2).toLocaleString()} km²
                    {areaTooLarge && ` (max ${MAX_AREA_KM2.toLocaleString()} km²)`}
                  </p>
                )}
              </div>
              {drawPointCount > 0 && (
                <button
                  onClick={onCancelDrawing}
                  className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
          ) : hasPolygon ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <span>✓</span>
                  <span>Polygon ready</span>
                </div>
                <button
                  onClick={onStartDrawing}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >
                  Redraw
                </button>
              </div>
              {polygonAreaKm2 !== null && (
                <p className="text-xs text-slate-500">
                  ~{Math.round(polygonAreaKm2).toLocaleString()} km²
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Click anywhere on the map to start drawing.</p>
          )}
        </section>

        {/* Step 2: Destination type */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            2. Destination Type
          </h2>
          <div className="space-y-2 lg:space-y-1.5">
            {DESTINATION_TYPES.map(({ value, label, implemented }) => (
              <label
                key={value}
                className={`flex items-center gap-2.5 py-1 lg:py-0 ${implemented ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
              >
                <input
                  type="radio"
                  name="destination_type"
                  value={value}
                  checked={destinationType === value}
                  disabled={!implemented}
                  onChange={() => setDestinationType(value)}
                  className="accent-sky-500 h-4 w-4"
                />
                <span className="text-sm text-slate-200">{label}</span>
                {!implemented && <span className="text-xs text-slate-500 italic">soon</span>}
              </label>
            ))}
          </div>
        </section>

        {/* Custom CSV */}
        {destinationType === 'custom' && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Custom Destinations
            </h2>
            <p className="text-xs text-slate-500 mb-1.5">
              Format: <code className="text-slate-300">Lat,Lon</code> — one coordinate pair per line.
            </p>
            <textarea
              value={customCsv}
              onChange={(e) => setCustomCsv(e.target.value)}
              placeholder={`# One coordinate pair per line\n46.8529,-121.7604\n46.2024,-121.4909\n48.1122,-121.1139`}
              rows={7}
              className="w-full text-xs bg-slate-900 border border-slate-600 rounded p-2 text-slate-200 placeholder-slate-600 font-mono resize-y focus:outline-none focus:border-sky-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              {parseCustomCsv(customCsv).length} destinations parsed
            </p>
          </section>
        )}

        {/* Step 3: Forecast window */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            3. Forecast Window
          </h2>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Start</label>
              <div className="flex gap-1">
                <input
                  type="date"
                  value={startDatetime.split('T')[0] ?? ''}
                  min={minPickable}
                  max={maxPickable}
                  onChange={(e) => {
                    const d = e.target.value
                    const t = startDatetime.split('T')[1] ?? '00:00'
                    setStartDatetime(d ? `${d}T${t}` : '')
                  }}
                  className="flex-1 min-w-0 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                />
                <input
                  type="time"
                  value={startDatetime.split('T')[1] ?? '00:00'}
                  disabled={!startDatetime}
                  onChange={(e) => {
                    const d = startDatetime.split('T')[0]
                    if (d) setStartDatetime(`${d}T${e.target.value}`)
                  }}
                  className="w-24 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-40"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">End</label>
              <div className="flex gap-1">
                <input
                  type="date"
                  value={endDatetime.split('T')[0] ?? ''}
                  min={minPickable}
                  max={maxPickable}
                  onChange={(e) => {
                    const d = e.target.value
                    const t = endDatetime.split('T')[1] ?? '00:00'
                    setEndDatetime(d ? `${d}T${t}` : '')
                  }}
                  className="flex-1 min-w-0 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                />
                <input
                  type="time"
                  value={endDatetime.split('T')[1] ?? '00:00'}
                  disabled={!endDatetime}
                  onChange={(e) => {
                    const d = endDatetime.split('T')[0]
                    if (d) setEndDatetime(`${d}T${e.target.value}`)
                  }}
                  className="w-24 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-40"
                />
              </div>
            </div>
          </div>
          {windowWarning && (
            <p className="mt-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded p-2">
              {windowWarning === 'past'
                ? `This forecast window starts before the ~${PAST_LIMIT_DAYS}-day history limit — adjust the dates to run an analysis.`
                : `This forecast window extends beyond the ~${FUTURE_LIMIT_DAYS}-day forecast horizon — adjust the dates to run an analysis.`}
            </p>
          )}
          {!windowWarning && aqiCoverage !== 'full' && (
            <p className="mt-2 text-xs text-sky-300 bg-sky-950/40 border border-sky-800/60 rounded p-2">
              {aqiCoverage === 'partial'
                ? `Air-quality (PM2.5 AQI) forecasts only extend ~${AQI_LIMIT_DAYS} days out, so AQI may cover just the start of this window. Weather data covers all of it.`
                : `Air-quality (PM2.5 AQI) forecasts only extend ~${AQI_LIMIT_DAYS} days out — AQI columns will be empty for this window. Weather data is unaffected.`}
            </p>
          )}
        </section>

        {/* Step 4: Rank by — metric radio + aggregation toggle per row. The
            toggle stays clickable on inactive rows so any combo is one click. */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            4. Rank Results By
          </h2>
          <div className="space-y-2 lg:space-y-1.5">
            {SORT_METRICS.map((metric) => {
              const isActive = metric.options.some((o) => o.value === sortBy)
              return (
                <div
                  key={metric.label}
                  className="flex items-center justify-between gap-2 py-1 lg:py-0"
                >
                  <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                    <input
                      type="radio"
                      name="sort_metric"
                      checked={isActive}
                      onChange={() => setSortBy(metric.defaultSort)}
                      className="accent-sky-500 h-4 w-4 flex-shrink-0"
                    />
                    <span className="text-sm text-slate-200 truncate">{metric.label}</span>
                  </label>
                  <div
                    className={`flex rounded border border-slate-600 overflow-hidden flex-shrink-0 ${
                      isActive ? '' : 'opacity-50'
                    }`}
                  >
                    {metric.options.map((opt, i) => (
                      <button
                        key={opt.value}
                        onClick={() => setSortBy(opt.value)}
                        className={`px-2 py-0.5 text-xs transition-colors ${
                          i > 0 ? 'border-l border-slate-600' : ''
                        } ${
                          sortBy === opt.value
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Lowest values rank first — driest, calmest, coldest, cleanest.
          </p>
        </section>

        {/* Step 5: Constraints */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            5. Constraints <span className="normal-case font-normal text-slate-500">(optional)</span>
          </h2>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Elevation range (ft)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={minElevationFt ?? ''}
                  min={0}
                  max={30000}
                  onChange={(e) =>
                    setMinElevationFt(e.target.value === '' ? null : Number(e.target.value))
                  }
                  className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
                <span className="text-slate-500 flex-shrink-0">–</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxElevationFt ?? ''}
                  min={0}
                  max={30000}
                  onChange={(e) =>
                    setMaxElevationFt(e.target.value === '' ? null : Number(e.target.value))
                  }
                  className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>
              {(minElevationFt !== null || maxElevationFt !== null) && (
                <button
                  onClick={() => { setMinElevationFt(null); setMaxElevationFt(null) }}
                  className="mt-1 text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Step 6: Result count */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            6. Max Results
          </h2>
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(e) =>
              setLimit(Math.max(1, Math.min(200, parseInt(e.target.value) || 10)))
            }
            className="w-24 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          />
        </section>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-700 space-y-3">
        <button
          onClick={onAnalyze}
          disabled={!canAnalyze}
          className="w-full py-3 lg:py-2.5 rounded font-semibold text-sm transition-colors
            bg-sky-600 hover:bg-sky-500 text-white
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>

        {!canAnalyze && !loading && (
          <p className="text-xs text-slate-500 text-center">
            {areaTooLarge
              ? `Area too large — draw a smaller polygon (max ${MAX_AREA_KM2.toLocaleString()} km²).`
              : !hasDates
              ? 'Set a forecast window to continue.'
              : windowWarning
              ? 'Adjust the forecast window dates to continue.'
              : needsPolygon && drawMode && drawPointCount < 3
              ? `Add ${pointsNeeded} more point${pointsNeeded !== 1 ? 's' : ''} to the polygon.`
              : needsPolygon && !hasPolygon && !drawMode
              ? 'Draw a polygon on the map to continue.'
              : !hasCustom
              ? 'Enter at least one valid destination.'
              : ''}
          </p>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded p-2 space-y-2">
            <p>{error}</p>
            <button
              onClick={onRetry}
              disabled={loading}
              className="w-full py-1.5 rounded font-medium text-red-200
                bg-red-900/60 hover:bg-red-800 border border-red-700
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {resultCount !== undefined && !loading && !error && (
          <p className="text-xs text-slate-400 text-center">
            Showing {resultCount} of {totalQueried} destinations
          </p>
        )}

        <p className="text-xs text-slate-600 text-center">
          Data: OpenStreetMap · Open-Meteo · CAMS
        </p>
      </div>
    </div>
  )
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
