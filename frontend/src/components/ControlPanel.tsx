import { Fragment, useMemo, useRef } from 'react'
import { AnalysisMode, CustomDestination, DiscoveryType, SortBy } from '../types'
import { Refusal } from '../hooks/useAnalyze'
import { MAX_AREA_KM2 } from './MapView'

// Above this drawn area, an informational note warns that dense regions can
// exceed the destination limit and searches slow down. Advisory only — the
// hard gate stays MAX_AREA_KM2 — sized to where Cascades-density terrain
// starts brushing the analysis cap (~26,000 km² held 1,117 peaks).
const AREA_NOTE_KM2 = 40_000
import { parseCustomCsv } from '../utils/customDestinations'
import { DATA_SOURCES } from '../utils/dataSources'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, LINK, TEXT } from '../styles'
import { AGGREGATE, NOUN, familyOf } from '../metrics'
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
const SORT_METRICS: { value: SortBy; label: string }[] = (
  ['precip_total_in', 'wind_avg_mph', 'temp_avg_f', 'aqi_avg'] as const
).map((value) => ({ value, label: NOUN[familyOf(value)] }))

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
  // A paste landed in the CSV box and parsed to at least one destination —
  // App frames the list on the map. Paste only: typing never moves the camera.
  onCsvPasted: (points: CustomDestination[]) => void
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
  // An over-limit refusal with its remedy fields. Rendered as an action
  // panel, never with "Try again": retrying a deterministic refusal verbatim
  // re-buys the same 10-40s map query for the same answer.
  refusal: Refusal | null
  onAnalyze: () => void
  onRetry: () => void
  // Remedies: re-run with the suggested elevation floor / elect the top-N cut.
  onRetryWithFloor: (minElevationFt: number) => void
  onRetryTopByElevation: () => void
  // Live ceiling for the results knob, from /api/capabilities (falls back to
  // the compiled analysis cap).
  maxLimit: number
  resultCount?: number
  totalQueried?: number
  // Pre-truncation count when the shown analysis was an elected top-N.
  totalFound?: number | null
  truncated?: boolean
  // Every displayed row has null AQI although the window is inside the AQI
  // horizon: the best-effort fetch failed, and the dashes deserve one line
  // of explanation.
  aqiAllNull?: boolean
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
  onCsvPasted,
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
  refusal,
  onAnalyze,
  onRetry,
  onRetryWithFloor,
  onRetryTopByElevation,
  maxLimit,
  resultCount,
  totalQueried,
  totalFound,
  truncated,
  aqiAllNull,
}: Props) {
  // Parse the CSV once per change rather than twice on every render (this and the
  // "N destinations parsed" count below both used to call parseCustomCsv directly).
  const parsedCustom = useMemo(() => parseCustomCsv(customCsv), [customCsv])
  const hasCustom = parsedCustom.length > 0
  // True between a paste into the CSV box and the change event it produces —
  // how onChange tells a pasted list (frame it on the map) from typing (leave
  // the camera alone). A keydown always precedes the input event it causes
  // (cmd+V's keydown fires before its paste event), so the flag is freshly
  // true exactly when a change came from a paste — including a paste that
  // replaces existing text — and stale flags can't survive into typing.
  const csvPasteRef = useRef(false)
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
          <h1 className={TEXT.appTitle}>Bluebird Forecast</h1>
          <p className={TEXT.caption}>Weather Window Finder</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Step 1: Destinations — one list, defined via any of three methods
            that union into a single ranked report */}
        <section>
          <h2 className={`${TEXT.section} mb-1`}>
            1. Destinations
          </h2>
          <p className={`${TEXT.helper} mb-2.5`}>
            Define a list of destinations to analyze using one or all of the following methods:
          </p>

          {/* a. Search by name — the search box lives on the map itself */}
          <div className="mb-3">
            <h3 className={`${TEXT.subheading} mb-1`}>Search by Name</h3>
            <p className={TEXT.helper}>
              Search for a destination by name on the map.
            </p>
          </div>

          {/* b. Search by polygon */}
          <div className="mb-3">
            <h3 className={`${TEXT.subheading} mb-1`}>Search by Polygon</h3>
            <p className={`${TEXT.helper} mb-1.5`}>
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
                  {polygonAreaKm2 !== null &&
                    polygonAreaKm2 > AREA_NOTE_KM2 &&
                    !areaTooLarge && (
                      <p className="text-amber-300/90">
                        Large area: dense regions this size can exceed the
                        destination limit, and searches take longer.
                      </p>
                    )}
                </div>
                <button
                  onClick={onCancelDrawing}
                  className={BUTTON_SECONDARY}
                >
                  Clear
                </button>
              </div>
            )}
            {/* Panel-wide label convention, first established here: something
                you pick is text-xs/slate-200, something that names a field is
                text-xs/slate-400. Hierarchy is the section heading's job — a
                bolder choice label just competes with it. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
              <span className={TEXT.subheading}>Find:</span>
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
                  <span className={TEXT.control}>{label}</span>
                  {!implemented && <span className={TEXT.helper}>soon</span>}
                </label>
              ))}
            </div>
          </div>

          {/* c. Search by coordinates */}
          <div>
            <h3 className={`${TEXT.subheading} mb-1`}>Search by Coordinates</h3>
            <p className={TEXT.helper}>
              Search for destinations with coordinate pairs.
            </p>
            <p className={`${TEXT.helper} mb-1.5`}>
              Format: <code className="text-slate-300">Lat,Lon</code> or{' '}
              <code className="text-slate-300">Lat,Lon,Name</code>
            </p>
            <textarea
              aria-label="Custom destination coordinates, one per line as latitude, longitude, optional name"
              value={customCsv}
              onKeyDown={() => (csvPasteRef.current = false)}
              onPaste={() => (csvPasteRef.current = true)}
              onChange={(e) => {
                const wasPaste = csvPasteRef.current
                csvPasteRef.current = false
                setCustomCsv(e.target.value)
                if (wasPaste) {
                  const points = parseCustomCsv(e.target.value)
                  if (points.length > 0) onCsvPasted(points)
                }
              }}
              placeholder={`46.8529,-121.7604,Mount Rainier\n46.2024,-121.4909\n48.1122,-121.1139,Glacier Peak`}
              rows={3}
              className={`${FIELD} w-full p-2 font-mono resize-y`}
            />
            {customCsv.trim() !== '' && (
              <p className={`${TEXT.helper} mt-1`}>
                {parsedCustom.length} destination{parsedCustom.length !== 1 ? 's' : ''} parsed
              </p>
            )}
          </div>
        </section>

        {/* Step 2: Forecast window */}
        <section>
          <h2 className={`${TEXT.section} mb-1`}>
            2. Forecast Window
          </h2>
          <p className={`${TEXT.helper} mb-2.5`}>
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
              <span className={TEXT.control}>Current Conditions</span>
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
              <span className={TEXT.control}>Future Day/Time</span>
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
                className={`${FIELD} flex-1 min-w-0 px-2 py-1.5`}
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
                className={`${FIELD} w-28 px-2 py-1.5 disabled:opacity-40`}
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
              <span className={TEXT.control}>Multi-Hour Window</span>
            </label>
            <div className={`space-y-2 ${forecastMode !== 'window' ? 'opacity-40' : ''}`}>
              <div>
                <label htmlFor="window-start-date" className={`${TEXT.subheading} block mb-1`}>Start</label>
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
                    className={`${FIELD} flex-1 min-w-0 px-2 py-1.5`}
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
                    className={`${FIELD} w-28 px-2 py-1.5 disabled:opacity-40`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="window-end-date" className={`${TEXT.subheading} block mb-1`}>End</label>
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
                    className={`${FIELD} flex-1 min-w-0 px-2 py-1.5`}
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
                    className={`${FIELD} w-28 px-2 py-1.5 disabled:opacity-40`}
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
          <h2 className={`${TEXT.section} mb-1`}>
            3. Result Ranking
          </h2>
          <p className={`${TEXT.helper} mb-2.5`}>
            Set the metric used to find the top destinations.
          </p>
          <div className="space-y-1.5">
            {SORT_METRICS.map((metric) => {
              const isActive = sortBy === metric.value
              return (
                <div
                  key={metric.value}
                  className="flex items-center justify-between gap-2"
                >
                  <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                    <input
                      type="radio"
                      name="sort_metric"
                      checked={isActive}
                      onChange={() => setSortBy(metric.value)}
                      className="accent-sky-500 h-3.5 w-3.5 flex-shrink-0"
                    />
                    <span className={`${TEXT.control} truncate`}>{metric.label}</span>
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
          <p className={`${TEXT.helper} mt-2`}>
            {forecastMode === 'now'
              ? 'Ranks by conditions at the current hour.'
              : forecastMode === 'at'
              ? 'Ranks by conditions at the chosen hour.'
              : 'Precipitation ranks by window total; wind, temperature, and AQI by window average.'}
          </p>
        </section>

        {/* Step 4: Additional options — result filters, count, and map overlays */}
        <section>
          <h2 className={`${TEXT.section} mb-1`}>
            4. Options
          </h2>
          <p className={`${TEXT.helper} mb-2.5`}>
            Apply constraints and enable extra features.
          </p>
          <div className="space-y-4">
            {/* Elevation band — filters candidates server-side before the fetch */}
            <div>
              <label className={`${TEXT.subheading} block mb-1`}>Elevation range (ft)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={AGGREGATE.minimum}
                  value={minElevationFt ?? ''}
                  min={0}
                  max={30000}
                  onChange={(e) =>
                    setMinElevationFt(e.target.value === '' ? null : Number(e.target.value))
                  }
                  className={`${FIELD} w-full px-2 py-1.5`}
                />
                <span className={`${TEXT.caption} flex-shrink-0`}>–</span>
                <input
                  type="number"
                  placeholder={AGGREGATE.maximum}
                  value={maxElevationFt ?? ''}
                  min={0}
                  max={30000}
                  onChange={(e) =>
                    setMaxElevationFt(e.target.value === '' ? null : Number(e.target.value))
                  }
                  className={`${FIELD} w-full px-2 py-1.5`}
                />
              </div>
              {/* Many OSM features carry no elevation tag; silently dropping
                  them would be surprising, so the filter lets them through —
                  say so where the band is set. */}
              <p className={`${TEXT.helper} mt-1`}>
                Destinations with unknown elevation are included.
              </p>
              {(minElevationFt !== null || maxElevationFt !== null) && (
                <button
                  onClick={() => { setMinElevationFt(null); setMaxElevationFt(null) }}
                  className={`${BUTTON_SECONDARY} mt-2`}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Result-count cap. The ceiling is the live analysis cap from
                /api/capabilities: `limit` trims what is shown, never what is
                analyzed, so there is no cheaper number to protect. */}
            <div>
              <label className={`${TEXT.subheading} block mb-1`}>{AGGREGATE.maximum} results</label>
              <input
                type="number"
                min={1}
                max={maxLimit}
                value={limit}
                onChange={(e) =>
                  setLimit(Math.max(1, Math.min(maxLimit, parseInt(e.target.value) || 100)))
                }
                className={`${FIELD} w-24 px-2 py-1.5`}
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
                <span className={TEXT.control}>Show Wildfires</span>
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
          className={`${BUTTON_PRIMARY} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>

        {rankingChanged && !loading && (
          <p className="text-xs text-amber-300 text-center whitespace-nowrap">
            Ranking changed. Press Analyze to update.
          </p>
        )}

        {!analyzeEnabled && !loading && (
          <p className={`${TEXT.helper} text-center`}>
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

        {refusal && !loading && (
          <div className="text-xs bg-amber-950/40 border border-amber-800/60 rounded p-2 space-y-2">
            <p className="text-amber-300">{refusal.message}</p>
            {refusal.suggestedMinElevationFt !== null && (
              <button
                onClick={() => onRetryWithFloor(refusal.suggestedMinElevationFt as number)}
                className={`${BUTTON_SECONDARY} w-full`}
              >
                Set min elevation to{' '}
                {refusal.suggestedMinElevationFt.toLocaleString()} ft and analyze
              </button>
            )}
            {refusal.limit !== null && (
              <button
                onClick={onRetryTopByElevation}
                className={`${BUTTON_SECONDARY} w-full`}
              >
                Analyze the {refusal.limit.toLocaleString()} highest instead
              </button>
            )}
          </div>
        )}

        {error && !refusal && (
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

        {resultCount !== undefined && !loading && !error && !refusal && (
          <div className="text-xs text-slate-400 text-center space-y-0.5">
            <p>
              {truncated && totalFound != null
                ? `Showing ${resultCount} of the ${totalQueried} highest destinations (${totalFound.toLocaleString()} found)`
                : `Showing ${resultCount} of ${totalQueried} destinations`}
            </p>
            {aqiAllNull && aqiCoverage !== 'none' && (
              <p>Air quality data unavailable for this forecast window.</p>
            )}
          </div>
        )}

        <p className={`${TEXT.caption} text-center leading-relaxed`}>
          Data:{' '}
          {DATA_SOURCES.map((source, i) => (
            <Fragment key={source.name}>
              {i > 0 && ' · '}
              <a href={source.href} target="_blank" rel="noreferrer" className={LINK}>
                {source.name}
              </a>
            </Fragment>
          ))}
        </p>
        {/* Two labels, two pages, and each label goes where it says. The
            privacy copy used to open a dialog here, which meant it had no URL
            and the Terms link next to it pointed at the privacy page anyway.
            Both open in a new tab so reading either never costs you a drawn
            polygon and its results. */}
        <p className={`${TEXT.caption} text-center`}>
          <a href="/privacy" target="_blank" rel="noreferrer" className={LINK}>
            Privacy
          </a>
          {' · '}
          <a href="/terms" target="_blank" rel="noreferrer" className={LINK}>
            Terms
          </a>
        </p>
      </div>
    </div>
  )
}
