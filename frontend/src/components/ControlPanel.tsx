import { useMemo, useRef } from 'react'
import { CustomDestination, DiscoveryType, SortBy } from '../types'
import { Refusal } from '../hooks/useAnalyze'
// Above this drawn area, an informational note warns that dense regions can
// exceed the destination limit and searches slow down. Advisory only: the hard
// gate is the deployment's published polygon cap, which arrives as maxAreaKm2.
// Sized to where Cascades-density terrain starts brushing the analysis cap
// (~26,000 km² held 1,117 peaks).
const AREA_NOTE_KM2 = 40_000
import ForecastCalendar from './ForecastCalendar'
import { parseCustomCsv } from '../utils/customDestinations'
import {
  ACCENT,
  BUTTON_ACCENT,
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CHOICE_INPUT,
  CHOICE_ROW,
  FIELD,
  LINK,
  NOTICE,
  SEGMENT,
  SEGMENT_DIVIDER,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  STATUS,
  TEXT,
} from '../styles'
import { AGGREGATE, NOUN, RANKING_KEYS, familyOf } from '../metrics'
import { analyzeBlockers, canAnalyze, type AnalyzeBlocker } from '../utils/analyzeGate'
import { classifyAqiCoverage, clampLimit } from '../utils/urlState'
import {
  AQI_LIMIT_DAYS,
  FUTURE_FORECAST_DAYS,
  ForecastSelection,
  PAST_LIMIT_DAYS,
  selectionLocalWindow,
} from '../utils/calendar'

// The app's core question: "top N peaks by <metric>, lowest or highest".
// Each metric ranks by one representative value — total precipitation,
// window-average wind/temperature/AQI. The finer min/avg/max detail stays
// visible (and click-sortable) in the results table.
const SORT_METRICS: { value: SortBy; label: string }[] = RANKING_KEYS.map((value) => ({
  value,
  label: NOUN[familyOf(value)],
}))

// Why a knob stopped applying live. Each case leads with the action, because
// that is what the reader wants first; the sentence after it is the reason the
// controls went quiet, which is the thing this cue exists to not leave unsaid.
const COMMIT_CUE: Record<'server-path' | 'elevation-widened' | 'window-changed', string> = {
  'elevation-widened': 'Press Analyze to apply. A wider elevation range needs a new search.',
  'window-changed': 'Press Analyze to apply. A different forecast window needs new forecasts.',
  // The overlay already announced the fallback itself ("Weather service
  // unreachable from this browser"), so this only has to name the consequence.
  'server-path': 'Press Analyze to apply. The server analysis returns only the rows shown.',
}

// What each Analyze blocker reads as. A function rather than a record because
// two of the four quote a number the panel holds, and the area cap in
// particular is published by /api/capabilities rather than written here.
//
// The destinations line names no method. It used to list all three ("Draw a
// search area, paste custom coordinates, or search for a place"), which is the
// panel's own table of contents read back to someone who is looking straight at
// it; what they are missing is a destination, not a menu.
function blockerText(blocker: AnalyzeBlocker, maxAreaKm2: number, pointsNeeded: number): string {
  switch (blocker) {
    case 'area':
      return `Area too large. Draw a smaller polygon (max ${maxAreaKm2.toLocaleString()} km²).`
    case 'window':
      return 'Adjust the forecast window to continue.'
    case 'destinations':
      return 'Provide at least one destination to analyze.'
    case 'polygon':
      return `Add ${pointsNeeded} more point${pointsNeeded !== 1 ? 's' : ''} to the polygon.`
    case 'types':
      return 'Pick what the polygon should find, or add a destination another way.'
  }
}

// What polygon discovery finds. Custom (CSV) is no longer a mode here — the
// always-visible Custom Destinations section below adds to any of these.
const DESTINATION_TYPES: { value: DiscoveryType; label: string; implemented: boolean }[] = [
  { value: 'peak', label: 'Peaks', implemented: true },
  { value: 'lake', label: 'Lakes', implemented: true },
  { value: 'trailhead', label: 'Trailheads', implemented: true },
]

interface Props {
  // Is the map in draw mode? Drawing is entered and left explicitly (#118) so
  // that outside it a click on the map belongs to whatever is under it — a
  // basemap peak, a result marker, or the pan itself.
  drawing: boolean
  onStartDrawing: () => void
  onFinishDrawing: () => void
  drawPointCount: number
  polygonAreaKm2: number | null
  onCancelDrawing: () => void
  // Hovering the Search by Name section rings the map's search box, the one
  // control this panel names but does not hold.
  onPointAtSearch: (on: boolean) => void
  // The same idea for the map's clickable peaks and lakes: hovering the
  // "Specify by Click" section makes them glow, so a method with no control
  // in this panel still has somewhere to point.
  onPointAtMapPois: (on: boolean) => void
  // A set: one polygon can look for several kinds at once, and none checked
  // means the polygon discovers nothing.
  destinationTypes: DiscoveryType[]
  setDestinationTypes: (t: DiscoveryType[]) => void
  // What the analysis asks about: the current hour, or days off the calendar.
  // One value rather than a mode plus three sets of timestamps (#166), so there
  // is no dormant state to preserve across a switch.
  selection: ForecastSelection
  setSelection: (s: ForecastSelection) => void
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
  // The selection is unservable, or its narrowed hours run backwards. A horizon
  // case only arrives through a shared link: the calendar draws those days
  // disabled.
  windowWarning: 'past' | 'future' | 'order' | null
  // Why a knob has stopped applying live, or null while they all do. Sort,
  // limit and elevation-narrowing normally re-present the held field with no
  // Analyze at all (#188), so this cue is the exception rather than the rule
  // and has to say which exception it is.
  commitReason?: 'server-path' | 'elevation-widened' | 'window-changed' | null
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
  // Live polygon-area gate from /api/capabilities, same contract as maxLimit
  // above: the deployment's number, with a compiled fallback behind it.
  maxAreaKm2: number
  resultCount?: number
  totalQueried?: number
  // Pre-truncation count when the shown analysis was an elected top-N.
  totalFound?: number | null
  truncated?: boolean
  // Every displayed row has null AQI although the window is inside the AQI
  // horizon: the best-effort fetch failed, and the dashes deserve one line
  // of explanation.
  aqiAllNull?: boolean
  // The wildfire proximity lookup failed for the displayed report, so no row
  // has been checked. A safety claim the UI must not make silently.
  wildfireCheckFailed?: boolean
}

export default function ControlPanel({
  drawing,
  onStartDrawing,
  onFinishDrawing,
  drawPointCount,
  polygonAreaKm2,
  onCancelDrawing,
  onPointAtSearch,
  onPointAtMapPois,
  destinationTypes,
  setDestinationTypes,
  selection,
  setSelection,
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
  commitReason,
  hasPins,
  loading,
  error,
  refusal,
  onAnalyze,
  onRetry,
  onRetryWithFloor,
  onRetryTopByElevation,
  maxLimit,
  maxAreaKm2,
  resultCount,
  totalQueried,
  totalFound,
  truncated,
  aqiAllNull,
  wildfireCheckFailed,
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
  const areaTooLarge = polygonAreaKm2 !== null && polygonAreaKm2 > maxAreaKm2

  const polygonReady = drawPointCount >= 3 && !areaTooLarge && destinationTypes.length > 0
  const gate = {
    hasWindowWarning: windowWarning !== null,
    loading,
    areaTooLarge,
    polygonReady,
    hasCustom,
    hasPins,
  }
  const analyzeEnabled = canAnalyze(gate)
  const blockers = analyzeBlockers({ ...gate, drawPointCount })

  // The selection as the datetime pair the warnings read. The calendar marks
  // days past the air-quality horizon in the grid; this is the sentence that
  // explains the mark once a selection actually crosses it.
  const window = selectionLocalWindow(selection, new Date())
  // Informational only — never blocks Analyze. AQI simply degrades to "—". The
  // current hour is always inside the ~5-day horizon.
  const aqiCoverage =
    selection.kind === 'now' ? 'full' : classifyAqiCoverage(window.start, window.end, new Date())

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
          <h2 className={`${TEXT.section} mb-2.5`}>
            1. Destinations
          </h2>

          {/* a. Search by name — the only method whose control is not in this
              panel; the search box floats on the map. Hovering the heading or
              its line rings that box, so the reader is shown where it is
              instead of told. Hover-only is fine here because it adds a cue to
              copy that already stands on its own. */}
          <div
            className="mb-3"
            onMouseEnter={() => onPointAtSearch(true)}
            onMouseLeave={() => onPointAtSearch(false)}
          >
            <h3 className={`${TEXT.subheading} mb-1`}>Search by Name</h3>
            <p className={TEXT.helper}>
              Search for a destination by name.
            </p>
          </div>

          {/* b. Search by polygon */}
          <div className="mb-3">
            <h3 className={`${TEXT.subheading} mb-1`}>Search by Polygon</h3>
            <p className={`${TEXT.helper} mb-1.5`}>
              Search for destinations by drawing a polygon.
            </p>
            {drawPointCount > 0 && (
              <div className="text-xs text-slate-300 space-y-0.5 mb-2">
                {/* Only while drawing does the status name a gesture: outside
                    the mode the handles are gone and none of them apply. */}
                {drawing && pointsNeeded > 0 ? (
                  <p className={STATUS.info}>
                    {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed,{' '}
                    {pointsNeeded} more needed. Click a point to remove it.
                  </p>
                ) : drawing ? (
                  <p className={`${STATUS.ok} font-medium`}>
                    {drawPointCount} points placed. Drag points to adjust, or press Done.
                  </p>
                ) : (
                  <p className={pointsNeeded > 0 ? STATUS.info : `${STATUS.ok} font-medium`}>
                    {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed
                    {pointsNeeded > 0 && `, ${pointsNeeded} more needed`}
                  </p>
                )}
                {polygonAreaKm2 !== null && (
                  <p className={areaTooLarge ? STATUS.error : 'text-slate-400'}>
                    ~{Math.round(polygonAreaKm2).toLocaleString()} km²
                    {areaTooLarge && ` (max ${maxAreaKm2.toLocaleString()} km²)`}
                  </p>
                )}
                {polygonAreaKm2 !== null &&
                  polygonAreaKm2 > AREA_NOTE_KM2 &&
                  !areaTooLarge && (
                    <p className={STATUS.warn}>
                      Large area: dense regions this size can exceed the
                      destination limit, and searches take longer.
                    </p>
                  )}
              </div>
            )}
            {/* The one control that switches the map between placing points
                and everything else. Drawing has to be left before a click on
                the map can mean anything but "another vertex", so this button
                is the whole of #118 in the panel: Draw/Edit to enter, Done to
                leave (Enter and Escape do the same on the map). */}
            <div className="flex flex-wrap gap-2">
              {drawing ? (
                <button onClick={onFinishDrawing} className={BUTTON_ACCENT}>
                  Done
                </button>
              ) : (
                <button onClick={onStartDrawing} className={BUTTON_SECONDARY}>
                  {drawPointCount > 0 ? 'Edit Polygon' : 'Draw Polygon'}
                </button>
              )}
              {drawPointCount > 0 && (
                <button onClick={onCancelDrawing} className={BUTTON_SECONDARY}>
                  Clear
                </button>
              )}
            </div>
            {/* Checkboxes, not radios: one polygon can look for several kinds
                at once, and they all come back from a single Overpass query,
                so asking for peaks and lakes together costs what peaks alone
                would. The "Find:" label that used to lead this row is gone —
                three checkboxes under a heading called "Search by Polygon"
                are not ambiguous about what they do. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
              {DESTINATION_TYPES.map(({ value, label, implemented }) => (
                <label key={value} className={CHOICE_ROW}>
                  <input
                    type="checkbox"
                    name="destination_types"
                    value={value}
                    checked={destinationTypes.includes(value)}
                    disabled={!implemented}
                    onChange={(e) =>
                      setDestinationTypes(
                        e.target.checked
                          ? [...destinationTypes, value]
                          : destinationTypes.filter((t) => t !== value),
                      )
                    }
                    className={CHOICE_INPUT}
                  />
                  <span>{label}</span>
                  {!implemented && <span className={TEXT.helper}>soon</span>}
                </label>
              ))}
            </div>
          </div>

          {/* c. Specify by coordinates. "Specify" rather than "Search"
              because nothing is being looked for: the two methods above go and
              find destinations, these last two name them outright. */}
          <div className="mb-3">
            <h3 className={`${TEXT.subheading} mb-1`}>Specify by Coordinates</h3>
            <p className={`${TEXT.helper} mb-1.5`}>
              Specify exact destinations using coordinate pairs.
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
              // The format states itself in the box rather than in a line above
              // it. Written as a "#" comment because parseCustomCsv skips those,
              // so it stays valid input if a paste ever lands beneath it.
              placeholder={`# Lat,Lon or Lat,Lon,Name\n46.8529,-121.7604,Mount Rainier\n46.2024,-121.4909`}
              rows={3}
              className={`${FIELD} w-full p-2 font-mono resize-y`}
            />
            {customCsv.trim() !== '' && (
              <p className={`${TEXT.helper} mt-1`}>
                {parsedCustom.length} destination{parsedCustom.length !== 1 ? 's' : ''} parsed
              </p>
            )}
          </div>

          {/* d. Specify by click — the second method whose control is not in
              this panel. Hovering it lights every clickable feature on the
              map, the same trick the Search by Name section uses to point at
              the search box: the reader is shown where it is instead of told. */}
          <div
            onMouseEnter={() => onPointAtMapPois(true)}
            onMouseLeave={() => onPointAtMapPois(false)}
          >
            <h3 className={`${TEXT.subheading} mb-1`}>Specify by Click</h3>
            <p className={TEXT.helper}>Select a destination from the map.</p>
          </div>
        </section>

        {/* Step 2: Forecast window — one calendar, replacing the three
            mutually exclusive modes and their four date/time pairs (#166) */}
        <section>
          <h2 className={`${TEXT.section} mb-2.5`}>
            2. Forecast Window
          </h2>

          <ForecastCalendar selection={selection} onChange={setSelection} />

          {windowWarning && (
            <p className={`mt-2 ${STATUS.warn} ${NOTICE.warn}`}>
              {windowWarning === 'order'
                ? 'The narrowed hours end before they start. Adjust them to run an analysis.'
                : windowWarning === 'past'
                ? `This window starts before the ${PAST_LIMIT_DAYS}-day history limit. Pick days inside the calendar's range to run an analysis.`
                : `This window extends beyond the ${FUTURE_FORECAST_DAYS}-day forecast horizon. Pick days inside the calendar's range to run an analysis.`}
            </p>
          )}
          {/* One sentence for both the partial and the fully-past-horizon case.
              They used to be two, each spelling out which columns would be
              empty and reassuring the reader that weather was unaffected — but
              the calendar above already dims the days past the horizon, so the
              only thing left to say is where that edge is. `aqiCoverage` still
              distinguishes the two states; the footer's "air quality
              unavailable" line reads it. */}
          {!windowWarning && aqiCoverage !== 'full' && (
            <p className={`mt-2 ${STATUS.info} ${NOTICE.info}`}>
              {NOUN.aqi} forecasts only extend {AQI_LIMIT_DAYS} days.
            </p>
          )}
        </section>

        {/* Step 4: Rank by — metric radio + Lowest/Highest toggle per row. The
            toggle stays clickable on inactive rows so any ranking is one click;
            selecting a metric via its radio keeps the current direction. */}
        <section>
          <h2 className={`${TEXT.section} mb-2.5`}>
            3. Result Ranking
          </h2>
          <div className="space-y-1.5">
            {SORT_METRICS.map((metric) => {
              const isActive = sortBy === metric.value
              return (
                <div
                  key={metric.value}
                  className="flex items-center justify-between gap-2"
                >
                  <label className={`${CHOICE_ROW} min-w-0`}>
                    <input
                      type="radio"
                      name="sort_metric"
                      checked={isActive}
                      onChange={() => setSortBy(metric.value)}
                      className={CHOICE_INPUT}
                    />
                    <span className="truncate">{metric.label}</span>
                  </label>
                  <div
                    className={`${SEGMENT} flex-shrink-0 ${isActive ? '' : 'opacity-50'}`}
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
                        className={`${SEGMENT_ITEM} ${i > 0 ? SEGMENT_DIVIDER : ''} ${
                          isActive && sortDesc === dir.desc
                            ? ACCENT.fill
                            : SEGMENT_IDLE
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
        </section>

        {/* Step 4: Additional options — result filters, count, and map overlays */}
        <section>
          <h2 className={`${TEXT.section} mb-2.5`}>
            4. Options
          </h2>
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
                onChange={(e) => setLimit(clampLimit(parseInt(e.target.value) || 200, maxLimit))}
                className={`${FIELD} w-24 px-2 py-1.5`}
              />
              {/* The knob reads like a cap on the work, and users have taken it
                  for one (#205): a list longer than this looks half-fetched.
                  The API description and the comment above say it the same way.
                  Keep it under ~50 characters or the sidebar wraps it to a
                  second line, which is why the count itself is not named here. */}
              <p className={`${TEXT.helper} mt-1`}>
                Number of results shown. All points are analyzed.
              </p>
            </div>

            {/* Show wildfires — live NIFC perimeter overlay, off by default */}
            <div>
              <label className={CHOICE_ROW}>
                <input
                  type="checkbox"
                  checked={showWildfires}
                  onChange={(e) => setShowWildfires(e.target.checked)}
                  className={CHOICE_INPUT}
                />
                <span>Show Wildfires</span>
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

        {commitReason && !loading && (
          <p className={`text-xs ${STATUS.warn} text-center`}>{COMMIT_CUE[commitReason]}</p>
        )}

        {/* Every reason Analyze is disabled, one box each, rather than the
            first reason as italic subtext. Two changes in one: the reasons
            stack (a chain showed one, so fixing it revealed a second that had
            been true all along), and each wears the same amber box the panel's
            other bad news does, because "the app will not do the thing you
            asked" is a warning and was being typeset as a footnote. */}
        {blockers.map((blocker) => (
          <p key={blocker} className={`${STATUS.warn} ${NOTICE.warn}`}>
            {blockerText(blocker, maxAreaKm2, pointsNeeded)}
          </p>
        ))}

        {refusal && !loading && (
          <div className={`${NOTICE.warn} space-y-2`}>
            <p className={STATUS.warn}>{refusal.message}</p>
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

        {/* Sits below a failed analysis and above the row count, because it
            qualifies a report that did arrive rather than reporting that one
            did not. Amber, not red: the forecasts are sound and only the fire
            check is missing. */}
        {wildfireCheckFailed && !loading && (
          <p className={`${STATUS.warn} ${NOTICE.warn}`}>
            NIFC could not be reached to provide wildfire data so no proximity information is
            available.
          </p>
        )}

        {error && !refusal && (
          <div className={`${STATUS.error} ${NOTICE.error} space-y-2`}>
            <p>{error}</p>
            <button onClick={onRetry} disabled={loading} className={BUTTON_DANGER}>
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
