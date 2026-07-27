import { useMemo } from 'react'
import { AnalysisMode, DiscoveryType, SortBy } from '../types'
import { MAX_AREA_KM2 } from './MapView'
import { parseCustomCsv } from '../utils/customDestinations'
import { canAnalyze } from '../utils/analyzeGate'
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

// The app's core question: "top N peaks by <metric>, lowest or highest".
// Each metric ranks by one representative value — total precipitation,
// window-average wind/temperature/AQI. The finer min/avg/max detail stays
// visible (and click-sortable) in the results table.
const SORT_METRICS: { value: SortBy; label: string }[] = [
  { value: 'precip_total_in', label: 'Precipitation' },
  { value: 'wind_avg_mph', label: 'Wind' },
  { value: 'temp_avg_f', label: 'Temperature' },
  { value: 'aqi_avg', label: 'AQI' },
]

// What polygon discovery finds. Custom (CSV) is no longer a mode here — the
// always-visible Custom Destinations section below adds to any of these.
const DESTINATION_TYPES: { value: DiscoveryType; label: string; implemented: boolean }[] = [
  { value: 'peak', label: 'Peaks', implemented: true },
  { value: 'lake', label: 'Lakes', implemented: true },
  { value: 'trailhead', label: 'Trailheads', implemented: true },
]

interface Props {
  drawPointCount: number
  polygonAreaKm2: number | null
  onCancelDrawing: () => void
  destinationType: DiscoveryType
  setDestinationType: (t: DiscoveryType) => void
  startDatetime: string
  setStartDatetime: (s: string) => void
  endDatetime: string
  setEndDatetime: (s: string) => void
  // Forecast-time mode: Current Conditions ('now'), Future Day/Time ('at'),
  // or Multi-Hour Window ('window'). The inactive modes' pickers stay mounted
  // but disabled so their values survive a round trip through another mode.
  forecastMode: AnalysisMode
  setForecastMode: (m: AnalysisMode) => void
  atDatetime: string
  setAtDatetime: (s: string) => void
  limit: number
  setLimit: (n: number) => void
  customCsv: string
  setCustomCsv: (s: string) => void
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  sortDesc: boolean
  setSortDesc: (d: boolean) => void
  minElevationFt: number | null
  setMinElevationFt: (v: number | null) => void
  maxElevationFt: number | null
  setMaxElevationFt: (v: number | null) => void
  showWildfires: boolean
  setShowWildfires: (v: boolean) => void
  windowWarning: 'past' | 'future' | 'order' | 'equal' | null
  // Out-of-range warning for the Future Day/Time moment (only ever non-null
  // while that mode is selected).
  momentWarning: 'past' | 'future' | null
  // The ranking knobs no longer match the analysis on screen (the displayed
  // report is a snapshot) — show the "press Analyze to apply" cue.
  rankingChanged?: boolean
  // At least one place has been searched by name. Searched places are a ranked
  // input like the CSV, so one alone enables Analyze with no polygon drawn.
  hasPins: boolean
  loading: boolean
  error: string | null
  onAnalyze: () => void
  onRetry: () => void
  onShowPrivacy: () => void
  resultCount?: number
  totalQueried?: number
}

export default function ControlPanel({
  drawPointCount,
  polygonAreaKm2,
  onCancelDrawing,
  destinationType,
  setDestinationType,
  startDatetime,
  setStartDatetime,
  endDatetime,
  setEndDatetime,
  forecastMode,
  setForecastMode,
  atDatetime,
  setAtDatetime,
  limit,
  setLimit,
  customCsv,
  setCustomCsv,
  sortBy,
  setSortBy,
  sortDesc,
  setSortDesc,
  minElevationFt,
  setMinElevationFt,
  maxElevationFt,
  setMaxElevationFt,
  showWildfires,
  setShowWildfires,
  windowWarning,
  momentWarning,
  rankingChanged,
  hasPins,
  loading,
  error,
  onAnalyze,
  onRetry,
  onShowPrivacy,
  resultCount,
  totalQueried,
}: Props) {
  // Parse the CSV once per change rather than twice on every render (this and the
  // "N destinations parsed" count below both used to call parseCustomCsv directly).
  const parsedCustom = useMemo(() => parseCustomCsv(customCsv), [customCsv])
  const hasCustom = parsedCustom.length > 0
  // Each mode gates Analyze on its own inputs: Current Conditions needs no
  // dates at all (the click time is the moment), Future Day/Time needs its
  // moment picked, Multi-Hour Window needs both ends.
  const hasDates =
    forecastMode === 'now' ||
    (forecastMode === 'at' ? atDatetime !== '' : startDatetime !== '' && endDatetime !== '')
  const areaTooLarge = polygonAreaKm2 !== null && polygonAreaKm2 > MAX_AREA_KM2

  const polygonReady = drawPointCount >= 3 && !areaTooLarge
  const analyzeEnabled = canAnalyze({
    hasDates,
    hasWindowWarning: windowWarning !== null || momentWarning !== null,
    loading,
    areaTooLarge,
    polygonReady,
    hasCustom,
    hasPins,
  })

  // Informational only — never blocks Analyze. AQI simply degrades to "—".
  // 'now' is always inside the ~5-day AQI horizon; 'at' checks its single
  // moment (a zero-length span is either fully covered or not at all).
  const aqiCoverage =
    forecastMode === 'now'
      ? 'full'
      : forecastMode === 'at'
      ? classifyAqiCoverage(atDatetime, atDatetime, new Date())
      : classifyAqiCoverage(startDatetime, endDatetime, new Date())

  const minPickable = pickableDate(-PAST_LIMIT_DAYS)
  const maxPickable = pickableDate(FUTURE_LIMIT_DAYS)

  const pointsNeeded = Math.max(0, 3 - drawPointCount)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-slate-700 flex">
        <img src="/icon.png" alt="" className="w-20 object-cover flex-shrink-0" />
        <div className="px-3 py-4 flex flex-col justify-center">
          <h1 className="text-lg font-bold text-white leading-tight">Bluebird Forecast</h1>
          <p className="text-xs text-slate-400">Weather Window Finder</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Step 1: Destinations — one list, defined via any of three methods
            that union into a single ranked report */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            1. Destinations
          </h2>
          <p className="text-xs text-slate-500 mb-2.5">
            Define a list of destinations to analyze using one or all of the following methods:
          </p>

          {/* a. Search by name — the search box lives on the map itself */}
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-slate-300 mb-1">Search by Name</h3>
            <p className="text-xs text-slate-500 italic">
              Search for a destination by name on the map.
            </p>
          </div>

          {/* b. Search by polygon */}
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-slate-300 mb-1">Search by Polygon</h3>
            <p className="text-xs text-slate-500 italic mb-1.5">
              Search for destinations by drawing a polygon around an area.
            </p>
            {drawPointCount > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-300 space-y-0.5">
                  {pointsNeeded > 0 ? (
                    <p className="text-sky-300">
                      {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed,{' '}
                      {pointsNeeded} more needed. Click a point to remove it.
                    </p>
                  ) : (
                    <p className="text-green-400 font-medium">
                      {drawPointCount} points placed. Drag points to adjust, or click Analyze.
                    </p>
                  )}
                  {polygonAreaKm2 !== null && (
                    <p className={areaTooLarge ? 'text-red-400' : 'text-slate-400'}>
                      ~{Math.round(polygonAreaKm2).toLocaleString()} km²
                      {areaTooLarge && ` (max ${MAX_AREA_KM2.toLocaleString()} km²)`}
                    </p>
                  )}
                </div>
                <button
                  onClick={onCancelDrawing}
                  className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
              <span className="text-xs text-slate-400">Find:</span>
              {DESTINATION_TYPES.map(({ value, label, implemented }) => (
                <label
                  key={value}
                  className={`flex items-center gap-1.5 ${implemented ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                >
                  <input
                    type="radio"
                    name="destination_type"
                    value={value}
                    checked={destinationType === value}
                    disabled={!implemented}
                    onChange={() => setDestinationType(value)}
                    className="accent-sky-500 h-3.5 w-3.5"
                  />
                  <span className="text-xs text-slate-200">{label}</span>
                  {!implemented && <span className="text-xs text-slate-500 italic">soon</span>}
                </label>
              ))}
            </div>
          </div>

          {/* c. Search by coordinates */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 mb-1">Search by Coordinates</h3>
            <p className="text-xs text-slate-500 italic">
              Search for destinations with coordinate pairs.
            </p>
            <p className="text-xs text-slate-500 italic mb-1.5">
              Format: <code className="text-slate-300">Lat,Lon</code> or{' '}
              <code className="text-slate-300">Lat,Lon,Name</code>
            </p>
            <textarea
              aria-label="Custom destination coordinates — one per line as latitude, longitude, optional name"
              value={customCsv}
              onChange={(e) => setCustomCsv(e.target.value)}
              placeholder={`46.8529,-121.7604,Mount Rainier\n46.2024,-121.4909\n48.1122,-121.1139,Glacier Peak`}
              rows={3}
              className="w-full text-xs bg-slate-900 border border-slate-600 rounded p-2 text-slate-200 placeholder-slate-600 font-mono resize-y focus:outline-none focus:border-sky-500"
            />
            {customCsv.trim() !== '' && (
              <p className="text-xs text-slate-500 mt-1">
                {parsedCustom.length} destination{parsedCustom.length !== 1 ? 's' : ''} parsed
              </p>
            )}
          </div>
        </section>

        {/* Step 2: Forecast window */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            2. Forecast Window
          </h2>
          <p className="text-xs text-slate-500 mb-2.5">
            Analyze conditions now, later, or for a window
          </p>

          {/* a. Current Conditions — a point-in-time sample of the moment
              Analyze is clicked. No inputs of its own. */}
          <div className="mb-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="forecast_mode"
                checked={forecastMode === 'now'}
                onChange={() => setForecastMode('now')}
                className="accent-sky-500 h-3.5 w-3.5"
              />
              <span className="text-xs font-semibold text-slate-300">Current Conditions</span>
            </label>
          </div>

          {/* b. Future Day/Time — a point sample of one chosen hour. The
              picker stays mounted but disabled while another mode is
              selected, so its value is preserved. */}
          <div className="mb-3">
            <label className="flex items-center gap-2.5 cursor-pointer mb-1.5">
              <input
                type="radio"
                name="forecast_mode"
                checked={forecastMode === 'at'}
                onChange={() => setForecastMode('at')}
                className="accent-sky-500 h-3.5 w-3.5"
              />
              <span className="text-xs font-semibold text-slate-300">Future Day/Time</span>
            </label>
            <div className={`flex gap-1 ${forecastMode !== 'at' ? 'opacity-40' : ''}`}>
              <input
                type="date"
                aria-label="Forecast date"
                value={atDatetime.split('T')[0] ?? ''}
                min={minPickable}
                max={maxPickable}
                disabled={forecastMode !== 'at'}
                onChange={(e) => {
                  const d = e.target.value
                  const t = atDatetime.split('T')[1] ?? '00:00'
                  setAtDatetime(d ? `${d}T${t}` : '')
                }}
                className="flex-1 min-w-0 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
              />
              <input
                type="time"
                aria-label="Forecast time"
                value={atDatetime.split('T')[1] ?? '00:00'}
                disabled={forecastMode !== 'at' || !atDatetime}
                onChange={(e) => {
                  const d = atDatetime.split('T')[0]
                  if (d) setAtDatetime(`${d}T${e.target.value}`)
                }}
                className="w-28 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-40"
              />
            </div>
          </div>

          {/* c. Multi-Hour Window — the classic start–end forecast window.
              Pickers disabled (values preserved) while another mode is on. */}
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer mb-1.5">
              <input
                type="radio"
                name="forecast_mode"
                checked={forecastMode === 'window'}
                onChange={() => setForecastMode('window')}
                className="accent-sky-500 h-3.5 w-3.5"
              />
              <span className="text-xs font-semibold text-slate-300">Multi-Hour Window</span>
            </label>
            <div className={`space-y-2 ${forecastMode !== 'window' ? 'opacity-40' : ''}`}>
              <div>
                <label htmlFor="window-start-date" className="text-xs text-slate-400 block mb-1">Start</label>
                <div className="flex gap-1">
                  <input
                    id="window-start-date"
                    type="date"
                    value={startDatetime.split('T')[0] ?? ''}
                    min={minPickable}
                    max={maxPickable}
                    disabled={forecastMode !== 'window'}
                    onChange={(e) => {
                      const d = e.target.value
                      const t = startDatetime.split('T')[1] ?? '00:00'
                      setStartDatetime(d ? `${d}T${t}` : '')
                    }}
                    className="flex-1 min-w-0 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                  <input
                    type="time"
                    aria-label="Start time"
                    value={startDatetime.split('T')[1] ?? '00:00'}
                    disabled={forecastMode !== 'window' || !startDatetime}
                    onChange={(e) => {
                      const d = startDatetime.split('T')[0]
                      if (d) setStartDatetime(`${d}T${e.target.value}`)
                    }}
                    className="w-28 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-40"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="window-end-date" className="text-xs text-slate-400 block mb-1">End</label>
                <div className="flex gap-1">
                  <input
                    id="window-end-date"
                    type="date"
                    value={endDatetime.split('T')[0] ?? ''}
                    min={startDatetime.split('T')[0] || minPickable}
                    max={maxPickable}
                    disabled={forecastMode !== 'window'}
                    onChange={(e) => {
                      const d = e.target.value
                      const t = endDatetime.split('T')[1] ?? '00:00'
                      setEndDatetime(d ? `${d}T${t}` : '')
                    }}
                    className="flex-1 min-w-0 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                  <input
                    type="time"
                    aria-label="End time"
                    value={endDatetime.split('T')[1] ?? '00:00'}
                    disabled={forecastMode !== 'window' || !endDatetime}
                    onChange={(e) => {
                      const d = endDatetime.split('T')[0]
                      if (d) setEndDatetime(`${d}T${e.target.value}`)
                    }}
                    className="w-28 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-40"
                  />
                </div>
              </div>
            </div>
          </div>

          {forecastMode === 'window' && windowWarning && (
            <p className="mt-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded p-2">
              {windowWarning === 'equal'
                ? 'Start and end are the same. Use Current Conditions or Future Day/Time to analyze a single hour.'
                : windowWarning === 'order'
                ? `The window's end must be after its start. Adjust the dates to run an analysis.`
                : windowWarning === 'past'
                ? `This forecast window starts before the ${PAST_LIMIT_DAYS}-day history limit. Adjust the dates to run an analysis.`
                : `This forecast window extends beyond the ${FUTURE_LIMIT_DAYS}-day forecast horizon. Adjust the dates to run an analysis.`}
            </p>
          )}
          {forecastMode === 'at' && momentWarning && (
            <p className="mt-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded p-2">
              {momentWarning === 'past'
                ? `This time is before the ${PAST_LIMIT_DAYS}-day history limit. Pick a later time to run an analysis.`
                : `This time is beyond the ${FUTURE_LIMIT_DAYS}-day forecast horizon. Pick an earlier time to run an analysis.`}
            </p>
          )}
          {forecastMode !== 'now' && !windowWarning && !momentWarning && aqiCoverage !== 'full' && (
            <p className="mt-2 text-xs text-sky-300 bg-sky-950/40 border border-sky-800/60 rounded p-2">
              {aqiCoverage === 'partial'
                ? `Air-quality (AQI) forecasts only extend ${AQI_LIMIT_DAYS} days out, so AQI may cover just the start of this window. Weather data covers all of it.`
                : `Air-quality (AQI) forecasts only extend ${AQI_LIMIT_DAYS} days out. AQI columns will be empty for this analysis. Weather data is unaffected.`}
            </p>
          )}
        </section>

        {/* Step 4: Rank by — metric radio + Lowest/Highest toggle per row. The
            toggle stays clickable on inactive rows so any ranking is one click;
            selecting a metric via its radio keeps the current direction. */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            3. Result Ranking
          </h2>
          <p className="text-xs text-slate-500 mb-2.5">
            Set the metric used to find the top destinations.
          </p>
          <div className="space-y-2 lg:space-y-1.5">
            {SORT_METRICS.map((metric) => {
              const isActive = sortBy === metric.value
              return (
                <div
                  key={metric.value}
                  className="flex items-center justify-between gap-2 py-1 lg:py-0"
                >
                  <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                    <input
                      type="radio"
                      name="sort_metric"
                      checked={isActive}
                      onChange={() => setSortBy(metric.value)}
                      className="accent-sky-500 h-4 w-4 flex-shrink-0"
                    />
                    <span className="text-sm text-slate-200 truncate">{metric.label}</span>
                  </label>
                  <div
                    className={`flex rounded border border-slate-600 overflow-hidden flex-shrink-0 ${
                      isActive ? '' : 'opacity-50'
                    }`}
                  >
                    {[
                      { desc: false, label: 'Lowest' },
                      { desc: true, label: 'Highest' },
                    ].map((dir, i) => (
                      <button
                        key={dir.label}
                        aria-pressed={isActive && sortDesc === dir.desc}
                        onClick={() => {
                          setSortBy(metric.value)
                          setSortDesc(dir.desc)
                        }}
                        className={`px-2 py-0.5 text-xs transition-colors ${
                          i > 0 ? 'border-l border-slate-600' : ''
                        } ${
                          isActive && sortDesc === dir.desc
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {dir.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {forecastMode === 'now'
              ? 'Ranks by conditions at the current hour.'
              : forecastMode === 'at'
              ? 'Ranks by conditions at the chosen hour.'
              : 'Precipitation ranks by window total; wind, temperature, and AQI by window average.'}
          </p>
        </section>

        {/* Step 4: Additional options — result filters, count, and map overlays */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            4. Options
          </h2>
          <p className="text-xs text-slate-500 mb-2.5">
            Apply constraints and enable extra features.
          </p>
          <div className="space-y-4">
            {/* Elevation band — filters candidates server-side before the fetch */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Elevation range (ft)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min (ft)"
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
                  placeholder="Max (ft)"
                  value={maxElevationFt ?? ''}
                  min={0}
                  max={30000}
                  onChange={(e) =>
                    setMaxElevationFt(e.target.value === '' ? null : Number(e.target.value))
                  }
                  className="w-full text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>
              {/* Many OSM features carry no elevation tag; silently dropping
                  them would be surprising, so the filter lets them through —
                  say so where the band is set. */}
              <p className="mt-1 text-[11px] text-slate-500">
                Destinations with unknown elevation are included.
              </p>
              {(minElevationFt !== null || maxElevationFt !== null) && (
                <button
                  onClick={() => { setMinElevationFt(null); setMaxElevationFt(null) }}
                  className="mt-1 text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Max results */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Max results</label>
              <input
                type="number"
                min={1}
                max={200}
                value={limit}
                onChange={(e) =>
                  setLimit(Math.max(1, Math.min(200, parseInt(e.target.value) || 100)))
                }
                className="w-24 text-sm bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Show wildfires — live NIFC perimeter overlay, off by default */}
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showWildfires}
                  onChange={(e) => setShowWildfires(e.target.checked)}
                  className="accent-sky-500 h-3.5 w-3.5"
                />
                <span className="text-xs text-slate-400">Show Wildfires</span>
              </label>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-700 space-y-3">
        <button
          onClick={onAnalyze}
          disabled={!analyzeEnabled}
          className="w-full py-3 lg:py-2.5 rounded font-semibold text-sm transition-colors
            bg-sky-600 hover:bg-sky-500 text-white
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>

        {rankingChanged && !loading && (
          <p className="text-xs text-amber-300 text-center whitespace-nowrap">
            Ranking changed. Press Analyze to update.
          </p>
        )}

        {!analyzeEnabled && !loading && (
          <p className="text-xs text-slate-500 text-center">
            {areaTooLarge
              ? `Area too large. Draw a smaller polygon (max ${MAX_AREA_KM2.toLocaleString()} km²).`
              : !hasDates
              ? forecastMode === 'at'
                ? 'Pick a forecast time to continue.'
                : 'Set a forecast window to continue.'
              : windowWarning
              ? 'Adjust the forecast window dates to continue.'
              : momentWarning
              ? 'Adjust the forecast time to continue.'
              : drawPointCount === 0
              ? 'Draw a search area, paste custom coordinates, or search for a place to continue.'
              : `Add ${pointsNeeded} more point${pointsNeeded !== 1 ? 's' : ''} to the polygon.`}
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

        <p className="text-[11px] text-slate-600 text-center leading-relaxed">
          Data:{' '}
          <a href="https://www.openstreetmap.org" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-sky-400 underline">OpenStreetMap</a>
          {' · '}
          <a href="https://open-meteo.com" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-sky-400 underline">Open-Meteo</a>
          {' · '}
          <a href="https://atmosphere.copernicus.eu" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-sky-400 underline">CAMS</a>
          {' · '}
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-sky-400 underline">OpenFreeMap</a>
          {' · '}
          <a href="https://nominatim.org" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-sky-400 underline">Nominatim</a>
          {' · '}
          <a href="https://www.nifc.gov" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-sky-400 underline">NIFC</a>
        </p>
        <p className="text-[11px] text-slate-600 text-center">
          <button onClick={onShowPrivacy} className="text-slate-500 hover:text-slate-300 underline">
            Privacy
          </button>
        </p>
      </div>
    </div>
  )
}
