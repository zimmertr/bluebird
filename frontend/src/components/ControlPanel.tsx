import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { CustomDestination, DiscoveryType, SortBy } from '../types'
import { Refusal } from '../hooks/useAnalyze'
import { FIRE_UNAVAILABLE_NOTE } from '../utils/fireProximity'
// Above this drawn area, an informational note warns that dense regions can
// exceed the destination limit and searches slow down. Advisory only: the hard
// gate is the deployment's published polygon cap, which arrives as maxAreaKm2.
// Sized to where Cascades-density terrain starts brushing the analysis cap
// (~26,000 km² held 1,117 peaks).
const AREA_NOTE_KM2 = 40_000
import ForecastCalendar from './ForecastCalendar'
import ModelPicker from './ModelPicker'
import { parseCustomCsv } from '../utils/customDestinations'
import {
  ACCENT,
  BUTTON_ACCENT,
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CHOICE_INPUT,
  CHOICE_ROW,
  CONTROL_W,
  DISABLED,
  FIELD,
  FIELD_NUMERIC,
  LINK,
  NOTICE,
  NOTICE_DIVIDER,
  NOTICE_DISMISS,
  PANEL_EDGE,
  PANEL_RULE,
  ICON_ADORNMENT,
  METRICS_GRID,
  METRICS_RULE,
  METRIC_BOX_W,
  SEGMENT,
  SEGMENT_DIVIDER,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SELECT,
  SELECT_W_AGGREGATE,
  STATUS,
  TEXT,
} from '../styles'
import {
  AGGREGATE,
  FAMILY_KEYS,
  MetricFamily,
  NOUN,
  RANKED_FAMILIES,
  UNIT,
  familyOf,
  windowAggregate,
} from '../metrics'
import { Constraints, hasConstraints } from '../utils/clientAnalyze'
import type { CommitReason } from '../utils/present'
import { analyzeBlockers, canAnalyze, type AnalyzeBlocker } from '../utils/analyzeGate'
import {
  BLOCKER_SEVERITY,
  type FooterMessage,
  type NoticeSeverity,
  isDismissed,
  noticeBoxes,
  noticeKey,
  pruneDismissals,
} from '../utils/notices'
import { DEFAULT_LIMIT, classifyAqiCoverage, clampLimit } from '../utils/urlState'
import {
  AQI_LIMIT_DAYS,
  ForecastSelection,
  archiveSeamPhrase,
  hasDates,
  selectionLocalWindow,
} from '../utils/calendar'
import { windowSource } from '../utils/forecastWindow'
import { modelForecastHours, type ForecastModelOption } from '../hooks/useCapabilities'

// The app's core question: "top N peaks by <metric's aggregate>, lowest or
// highest". Each row is a metric; which of its aggregate columns it ranks by
// is the row's dropdown (#291), so the label is the bare noun and the
// reduction lives in the control beside it.

// Why a knob stopped applying live. Each case names the reason the
// controls went quiet, which is the thing this cue exists to not leave unsaid.
//
// One frame, three subjects (TJ, 2026-08-22): the sentence is spelled once so
// the cues cannot drift apart word by word, and a reword is one edit rather
// than three. The run errors are deliberately NOT this pattern — they are
// defined at their sources (the backend's SSE strings, the Open-Meteo
// client), and only share the "Try again later." tail as a convention.
const commitCue = (subject: string) => `A new ${subject} requires a new analysis.`
const COMMIT_CUE: Record<CommitReason, string> = {
  'elevation-widened': commitCue('elevation range'),
  'window-changed': commitCue('forecast range'),
  'model-changed': commitCue('forecast model'),
  'polygon-changed': commitCue('search area'),
  'types-changed': commitCue('destination type'),
  'destination-added': commitCue('destination'),
}

// The AQI info line's dismissal key (#253): a condition, not a message, like
// every derived line's.
const AQI_NOTE_KEY = 'aqi:none'

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
      return `The polygon is too large. The maximum supported size is ${maxAreaKm2.toLocaleString()} km².`
    case 'window':
      return 'Adjust the forecast window to continue.'
    case 'dates':
      return 'Select at least one date to analyze.'
    case 'destinations':
      return 'Provide at least one destination to analyze.'
    case 'polygon':
      return `Add at least ${pointsNeeded} more point${pointsNeeded !== 1 ? 's' : ''} to the polygon to continue.`
    case 'types':
      return 'Select at least one destination type for the polygon search.'
  }
}

// The two cells of a filter row, and what an empty one says it is for.
//
// The bounds label themselves rather than sitting under a heading row: that row
// cost a line of vertical space and pushed the first control twice as far below
// the section heading as every other section's, and the elevation band already
// used this idiom before the grid existed. A filled cell drops its placeholder,
// by which point its position has said the same thing four rows running.
// Why raising this costs nothing: the cap trims what is LISTED, never what is
// fetched. Every destination in the area is forecast either way, which is also
// why the table's header can say "N of M" without a second analysis.
const LIMIT_NOTE =
  'Only limits how many destinations are added to the results. All destinations are still forecasted.'

const EDGES = [
  ['lower', AGGREGATE.minimum],
  ['upper', AGGREGATE.maximum],
] as const

// What each bound box compares, per ranked metric. The box columns are headed
// with the two aggregate names because for most rows that is literally what
// they are: the wind, temperature and freezing-level rows bound each row's own
// extremes, so a ceiling of 20 on the wind row holds the table's gustiest-hour
// column at or below 20. Two cells stretch that reading, deliberately.
// Precipitation is bounded on the window TOTAL in both columns, because a
// per-hour floor would be 0.000 almost everywhere and the noun already means
// the total in its aggregate dropdown. And the air-quality floor reads the
// worst hour too, there being no other aggregate to read.
//
// The hint is the accessible name's second sentence: a floor reads the window's
// best hour and a ceiling its worst, which is the whole design and also the
// thing that looks like a bug the first time a wind floor of 15 empties the
// table — nowhere is continuously windy. The mapping is fixed for the life of
// the app, so it is stated rather than computed.
//
// `note` is the tooltip on the one row whose value can genuinely be missing —
// air quality past its ~5-day horizon. The absence is no evidence of bad
// conditions, so the row is not filtered out. Read the tooltip note in
// docs/STYLES.md before copying this pattern: an approved exception, not a
// new tool.
const BOUNDS: Record<
  MetricFamily,
  {
    id: string
    step: number
    hint: readonly [string, string]
    lower: keyof Constraints
    upper: keyof Constraints
    note?: string
  }
> = {
  precip: {
    id: 'precipitation',
    step: 0.01,
    hint: ['The total over the window must be at least this.', 'The total over the window must be at most this.'],
    lower: 'minPrecipTotalIn',
    upper: 'maxPrecipTotalIn',
  },
  wind: {
    id: 'wind',
    step: 1,
    hint: ['The calmest hour must be at least this.', 'The gustiest hour must be at most this.'],
    lower: 'minWindMph',
    upper: 'maxWindMph',
  },
  temp: {
    id: 'temperature',
    step: 1,
    hint: ['The coldest hour must be at least this.', 'The hottest hour must be at most this.'],
    lower: 'minTempF',
    upper: 'maxTempF',
  },
  freeze: {
    id: 'freezing-level',
    step: 100,
    hint: ['The lowest hour must be at least this.', 'The highest hour must be at most this.'],
    lower: 'minFreezeFt',
    upper: 'maxFreezeFt',
  },
  aqi: {
    id: 'air-quality',
    note: 'Destinations with no air quality forecast are included.',
    hint: ['The worst hour must be at least this.', 'The worst hour must be at most this.'],
    step: 1,
    lower: 'minAqi',
    upper: 'maxAqi',
  },
}

// The elevation band is the one bound that is not a Constraints key: it gates
// discovery rather than the display, so it rides on its own props. Same unit
// and datum as the freezing level, because the whole reading is the comparison
// between the two. The note is the other genuinely-missing case: an OSM
// feature with no elevation.
const ELEVATION_UNIT = 'ft'
const ELEVATION_NOTE = 'Destinations with no elevation are included.'
const ELEVATION_HINT = ['The elevation must be at least this.', 'The elevation must be at most this.'] as const

// Every numeric box in the Metrics grid: the ten bounds and the results cap. One
// recipe so a new box cannot pick its own width or height; py-0.5 matches the
// dropdown and the segment beside it.
const METRIC_BOX = `${FIELD_NUMERIC} ${METRIC_BOX_W} px-2 py-0.5 text-center`

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
  // Hovering the Map group rings the map's search box and glows its
  // clickable peaks and lakes together: the two methods whose control is
  // the map itself share one subsection, so its cue lights everything the
  // map offers at once.
  onPointAtSearch: (on: boolean) => void
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
  // Each metric row's aggregate choice (#291), active row included. App owns
  // the invariant that the active family's entry equals sortBy; changing any
  // row's dropdown goes through setSortBy, which is what makes a dropdown
  // change activate its row the way the direction toggle always has.
  rowKeys: Record<MetricFamily, SortBy>
  // Whether the window the report ranks is a single hourly stamp. The
  // aggregate dropdowns hide then — min, average and maximum of one hour are
  // the same number — the same way the calendar's Hours row hides under a
  // selection that takes no hours.
  pointSample: boolean
  minElevationFt: number | null
  setMinElevationFt: (v: number | null) => void
  maxElevationFt: number | null
  setMaxElevationFt: (v: number | null) => void
  constraints: Constraints
  setConstraints: (c: Constraints) => void
  // Clears the whole grid, elevation included. Elevation is the one row whose
  // clearing widens rather than narrows, so this can leave the report needing
  // an Analyze — which the commit cue above the button then says.
  onClearFilters: () => void
  // Summits OSM knows only by their height, discovered as `Peak 5961`.
  // A polygon knob rather than a map one, and off by default, because it
  // roughly triples the candidate count.
  includeUnnamedPeaks: boolean
  setIncludeUnnamedPeaks: (v: boolean) => void
  // Which weather model answers, and the set this deployment offers, from
  // /api/capabilities. A data knob: models disagree, so changing one needs new
  // forecasts rather than a re-presentation of held ones.
  forecastModel: string
  setForecastModel: (id: string) => void
  forecastModels: readonly ForecastModelOption[]
  // The extra models the chart draws beside the ranking one (#232). Ticked in
  // the same list the ranking model is chosen from, because it is the same
  // reading: which model answers, and which others to see it against.
  comparedModels: readonly string[]
  setComparedModels: (ids: string[]) => void
  // Which of them the server would use if asked for none. Marked in the list so
  // a reader who has wandered off it can find the way back; the ordering alone
  // cannot say it, since best-first and default-first need not agree.
  defaultForecastModel: string
  // The last model change moved the far edge in under the chosen window and
  // trimmed it. Worth saying out loud: the calendar redrawing is visible, but a
  // selection quietly losing days is the kind of thing a reader discovers in
  // the results instead.
  modelClamped: boolean
  // The selection is unservable, or its narrowed hours run backwards. A horizon
  // case only arrives through a shared link: the calendar draws those days
  // disabled. A window crossing the archive boundary is NOT one of these since
  // #123 — both endpoints answer it, and the seam notice below the button names
  // where the join falls.
  windowWarning: 'past' | 'future' | 'order' | null
  // Why a knob has stopped applying live, or null while they all do. Sort,
  // limit and elevation-narrowing normally re-present the held field with no
  // Analyze at all (#188), so this cue is the exception rather than the rule
  // and has to say which exception it is.
  // Every knob that has stopped applying live, in `commitNeeded`'s fixed
  // order (model, window, elevation, polygon, types, destination). One warn
  // bullet each.
  commitReasons?: CommitReason[]
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
  // Live ceiling for the results knob, from /api/capabilities (falls back to
  // the compiled analysis cap).
  maxLimit: number
  // Live polygon-area gate from /api/capabilities, same contract as maxLimit
  // above: the deployment's number, with a compiled fallback behind it.
  maxAreaKm2: number
  // How far back the calendar may reach, from /api/capabilities: the archive
  // endpoint's reach, same contract as the two ceilings above.
  archiveDays: number
  // Whether a report is on screen at all — the counts themselves moved to the
  // table's own header bar.
  resultCount?: number
  // Every displayed row has null AQI although the window is inside the AQI
  // horizon: the best-effort fetch failed, and the dashes deserve one line
  // of explanation.
  aqiAllNull?: boolean
  // The wildfire proximity lookup failed for the displayed report, so no row
  // has been checked. A safety claim the UI must not make silently.
  wildfireCheckFailed?: boolean
}

/**
 * One shape for every message under the Analyze button.
 *
 * There were two shapes and the difference said nothing. A commit cue was
 * centred, unboxed, amber text; a blocker was a left-aligned amber box; the two
 * appeared together, so the panel showed one warning as a caption and the next
 * as a notice for no reason a reader could act on. Severity is the only thing
 * that varies now, and it varies by hue, which is what hue means everywhere
 * else in this app.
 *
 * The colour lives on the box rather than on each line inside it, so a notice
 * that grows a second paragraph cannot forget it. `NOTICE` sets a size and no
 * colour and `STATUS` sets a colour and no size, which is what lets the two
 * compose without the stylesheet-order collision this file keeps warning about.
 */
function NoticeMessage({
  text,
  onDismiss,
}: {
  text: string
  onDismiss: () => void
}) {
  return (
    <div className={NOTICE_DISMISS.row}>
      <span className="flex-1">{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice"
        className={NOTICE_DISMISS.button}
      >
        <span className={NOTICE_DISMISS.pill}>
          {/* A drawn cross rather than the "×" character, for the reason
              the panel's own close button documents: that glyph centres on
              the font's maths, where two lines in a square viewBox centre
              by construction. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-2.5 w-2.5"
            aria-hidden="true"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </span>
      </button>
    </div>
  )
}

function FooterNotice({
  severity,
  messages,
  children,
  onDismiss,
}: {
  severity: NoticeSeverity
  // Whatever this severity currently has to say, one entry per message. Each
  // message carries its own X (`NoticeMessage`); `children` is the box-wide
  // action below them all — the error box's retry.
  messages: readonly FooterMessage[]
  children?: React.ReactNode
  // Dismisses ONE message by its key — a message for the event notices, a
  // condition for the derived lines — which `utils/notices.ts` owns.
  onDismiss: (key: string) => void
}) {
  return (
    <div className={`${NOTICE[severity]} ${STATUS[severity]} space-y-2`} role="status">
      {/* Every message renders the same way, alone or one of several: a row
          under a row, separated by the rule `NOTICE_DIVIDER` draws in the box's
          own border tint. A bulleted list did the separating before and spent
          16px of the text column on the indent and the marker, which is more
          than a message written to fit one line at 360px can give up — so the
          second message arriving used to wrap the first. A lone message gets no
          rule, because there is nothing to separate it from. */}
      <div className={NOTICE_DIVIDER[severity]}>
        {messages.map((m) => (
          <NoticeMessage key={m.key} text={m.text} onDismiss={() => onDismiss(m.key)} />
        ))}
      </div>
      {children}
    </div>
  )
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
  rowKeys,
  pointSample,
  minElevationFt,
  setMinElevationFt,
  maxElevationFt,
  setMaxElevationFt,
  constraints,
  setConstraints,
  onClearFilters,
  includeUnnamedPeaks,
  setIncludeUnnamedPeaks,
  forecastModel,
  setForecastModel,
  forecastModels,
  comparedModels,
  setComparedModels,
  defaultForecastModel,
  modelClamped,
  windowWarning,
  commitReasons,
  hasPins,
  loading,
  error,
  refusal,
  onAnalyze,
  onRetry,
  maxLimit,
  maxAreaKm2,
  archiveDays,
  resultCount,
  aqiAllNull,
  wildfireCheckFailed,
}: Props) {
  // Parse the CSV once per change rather than twice on every render (this and the
  // "N destinations parsed" count below both used to call parseCustomCsv directly).
  // Falls back to the id so a link naming a model this deployment stopped
  // publishing still reads as something rather than as an empty gap in a
  // sentence.
  const modelLabel =
    forecastModels.find((m) => m.id === forecastModel)?.label ?? forecastModel
  const forecastHours = modelForecastHours(forecastModels, forecastModel)
  // Memoized because the calendar's grid hangs off it: a new object on every
  // render would rebuild the month grid on every keystroke in the panel.
  const band = useMemo(
    () => ({ forecastHours, pastDays: archiveDays }),
    [forecastHours, archiveDays],
  )
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
    // The Dates arm is live with no day picked yet (#242 review): there is no
    // window to analyze, and the blocker says so.
    datesPending: selection.kind === 'days' && !hasDates(selection),
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
  // current hour is always inside the ~5-day horizon, and a dateless Dates arm
  // has no window to warn about.
  const aqiCoverage =
    selection.kind === 'now' || window === null
      ? 'full'
      : classifyAqiCoverage(window.start, window.end, new Date())
  // Which endpoint answers the SELECTED window (#123), which decides two things
  // in this panel. A window the archive answers names no model — its default is
  // a reanalysis, one dataset everywhere, and the picker's models are forecast
  // models that do not run over the past — so the picker does not apply and is
  // disabled rather than left looking like an input to a fetch that ignores it.
  // A window crossing the boundary keeps the picker: the forecast half is the
  // chosen model's, and the seam notice says where that half begins.
  const selectedSource =
    window === null
      ? null
      : windowSource(
          new Date(window.start).getTime(),
          new Date(window.end).getTime(),
        )
  const archiveWindow = selectedSource === 'archive'

  const pointsNeeded = Math.max(0, 3 - drawPointCount)

  // The event keys: the run error and the refusal key on their MESSAGE,
  // because each new message is a new fact the reader has not seen.
  const refusalKey = refusal ? noticeKey('refusal', refusal.message) : null
  const errorKey = error ? noticeKey('error', error) : null
  // The AQI line qualifies the ANALYSIS rather than the view of it: every
  // displayed row has null AQI although the window is inside the horizon.
  const aqiNoteActive =
    resultCount !== undefined &&
    !loading &&
    !error &&
    !refusal &&
    Boolean(aqiAllNull) &&
    aqiCoverage !== 'none'

  // Everything the Forecast section has to say, said below the button with
  // every other message (#123 review). These used to render inside that section
  // — one above the calendar, two beneath it — which put a warning about the
  // window a screen away from the warnings about everything else, and made the
  // panel's one notice block a half-truth. Their order here is the order they
  // had there: the model's clamp, then the window's own problem, then what the
  // window costs in air quality.
  //
  // Each keys on its CONDITION, like every other derived line: the seam notice
  // re-arms when a window stops crossing the boundary and crosses it again,
  // rather than on every recomputation of the same sentence.
  const windowMessages: FooterMessage[] = [
    ...(modelClamped
      ? [
          {
            key: 'window:clamped',
            text: `${modelLabel} shortened the window.`,
            severity: 'warn' as const,
          },
        ]
      : []),
    ...(windowWarning
      ? [
          {
            key: `window:${windowWarning}`,
            text:
              windowWarning === 'order'
                ? 'The narrowed hours end before they start.'
                : windowWarning === 'past'
                  ? `Forecast range starts before the ${archiveDays}-day limit.`
                  : `${modelLabel} does not reach that far.`,
            severity: 'warn' as const,
          },
        ]
      : []),
    // Where a window crossing the archive boundary changes source (#123). Info
    // rather than warn: nothing is wrong and nothing is blocked, but a report
    // whose early hours are a reanalysis and whose later ones are a model run
    // should say so rather than let the reader assume one dataset.
    ...(selectedSource === 'spanning' && window !== null
      ? [
          {
            key: 'window:spanning',
            text: archiveSeamPhrase(
              new Date(window.start).getTime(),
              new Date(window.end).getTime(),
              modelLabel,
            ),
            severity: 'info' as const,
          },
        ]
      : []),
    // One sentence for both the partial and the fully-past-horizon case. They
    // used to be two, each spelling out which columns would be empty and
    // reassuring the reader that weather was unaffected — but the calendar
    // already dims the days past the horizon, so the only thing left to say is
    // where that edge is.
    ...(!windowWarning && aqiCoverage !== 'full'
      ? [
          {
            key: 'window:aqi-horizon',
            text: `${NOUN.aqi} forecasts only extend ${AQI_LIMIT_DAYS} days.`,
            severity: 'info' as const,
          },
        ]
      : []),
  ]

  // Every message under the Analyze button, as one list feeding at most three
  // boxes — one per severity, in error, warning, info order (`noticeBoxes` in
  // `utils/notices.ts`). They used to box by SOURCE — the warnings in one
  // frame, the refusal and the error in frames of their own — which read as
  // kinds of problem when the difference was plumbing, not meaning (#245
  // review, then the severity split, TJ 2026-08-22). Within a severity the
  // order is what the reader can act on: why the last run failed, why the
  // report on screen is stale, why the button is disabled, then what a
  // delivered report is missing.
  //
  // Each line carries the key its dismissal lives under — the CONDITION for
  // derived lines, the MESSAGE for the two event notices — so the polygon
  // blocker counting down as you draw stays one dismissed thing (see
  // `utils/notices.ts`).
  const footerMessages: FooterMessage[] = [
    // One run's outcome. `retry` is what summons the box's Try again button.
    ...(error && errorKey && !refusal
      ? [{ key: errorKey, text: error, severity: 'error' as const, retry: true }]
      : []),
    // Every stale-report reason at once (TJ, 2026-08-22): a user who changed
    // the window and the model is owed both sentences, in `commitNeeded`'s
    // fixed order, each dismissable alone. One severity for the whole cue
    // family: the report no longer answers what the panel asks, which is
    // warn's definition.
    ...(!loading
      ? (commitReasons ?? []).map((reason) => ({
          key: `cue:${reason}`,
          text: COMMIT_CUE[reason],
          severity: 'warn' as const,
        }))
      : []),
    ...windowMessages,
    ...blockers.map((blocker) => ({
      key: `blocker:${blocker}`,
      text: blockerText(blocker, maxAreaKm2, pointsNeeded),
      severity: BLOCKER_SEVERITY[blocker],
    })),
    // The same sentence the N/A cells' hover text shows, from one constant,
    // so the panel and the table cannot describe one failure two ways.
    ...(wildfireCheckFailed && !loading
      ? [
          {
            key: 'fire:unavailable',
            text: FIRE_UNAVAILABLE_NOTE,
            severity: 'error' as const,
          },
        ]
      : []),
    // The refusal is an error like the area cap: a finished request, refused
    // for its size (TJ, 2026-08-22). It carries no `retry` — retrying a
    // deterministic refusal verbatim re-buys the same map query for the same
    // answer — and it never coexists with the run error above.
    ...(refusal && refusalKey && !loading
      ? [{ key: refusalKey, text: refusal.message, severity: 'error' as const }]
      : []),
    ...(aqiNoteActive
      ? [
          {
            key: AQI_NOTE_KEY,
            text: `${NOUN.aqi} data is not available for this forecast window.`,
            severity: 'warn' as const,
          },
        ]
      : []),
  ]

  // The dismissal ledger (#253): every footer message is dismissable, each
  // alone. `pruneDismissals` retires a dismissal the moment its key stops
  // being active, which is what makes an identical error return after the
  // next Analyze (`useAnalyze` nulls both event states before it fetches)
  // and a cleared-then-retriggered warning return — while panning, sorting
  // and knob twiddling, which change no key, resurface nothing. Local state
  // on purpose: the panel stays mounted while closed, and a dismissal is
  // presentation, not part of the analysis.
  const [dismissed, setDismissed] = useState<readonly string[]>([])
  const activeKeySig = footerMessages
    .map((m) => m.key)
    .join('\u0000')
  useEffect(() => {
    setDismissed((prev) => pruneDismissals(prev, activeKeySig.split('\u0000')))
  }, [activeKeySig])
  const footerBoxes = noticeBoxes(
    footerMessages.filter((m) => !isDismissed(m.key, dismissed)),
  )

  const filtersActive =
    minElevationFt !== null || maxElevationFt !== null || hasConstraints(constraints)

  // The optional map overlays, as one list rather than three hand-written rows.
  // Ordered by how much of the map each one covers, lightest first: a fire is a
  // shape you look for, radar is weather over a region, smoke can span the
  // continent. That also happens to be the order they stack on the map, which
  // is not a coincidence — both orderings answer "how much is this hiding".
  //
  // "Wildfires" rather than "Show wildfires": under a heading that says these
  // are layers, the verb was the heading's job being done three times.
  const peaksOn = destinationTypes.includes('peak')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`border-b ${PANEL_EDGE} flex`}>
        <img src="/icon.png" alt="" className="w-20 object-cover flex-shrink-0" />
        <div className="px-3 py-4 flex flex-col justify-center">
          <h1 className={TEXT.appTitle}>Bluebird Forecast</h1>
          <p className={TEXT.caption}>Weather Window Finder</p>
        </div>
      </div>

      <div
        // One rule between steps, drawn by the stack rather than by each
        // section, so a section added later cannot forget its line or draw a
        // second one. The two spacing utilities are a matched pair and have to
        // stay equal: `space-y` is the gap ABOVE each rule (margin sits outside
        // the border) and `pt` the gap below it, so the line lands centred in
        // the gutter between two steps rather than tucked under the one above.
        className={`flex-1 overflow-y-auto px-4 py-4 ${PANEL_RULE}`}
      >
        {/* Destinations — one list, defined via any of four methods
            that union into a single ranked report */}
        <section>
          <h2 className={`${TEXT.section} mb-2.5`}>
            Destinations
          </h2>

          {/* Map — the two methods whose control is the map itself, the
              floating search box and the clickable peaks and lakes, grouped
              as one subsection rather than two widgetless ones. The heading
              keeps the caption from reading as a description of the whole
              section, and makes the three groups parallel: each names the
              instrument, so the shape says "another way to add destinations"
              without a "Search by" prefix saying it four times. Hovering the
              group rings the search box AND glows the selectable features,
              so the reader is shown where both live instead of told.
              Hover-only is fine here because it adds a cue to copy that
              already stands on its own. The caption names peaks and lakes
              rather than "a destination" because those are the two things
              the basemap makes clickable - trailheads are not on it, which
              is why they are found by polygon instead. */}
          <div
            className="mb-3"
            onMouseEnter={() => {
              onPointAtSearch(true)
              onPointAtMapPois(true)
            }}
            onMouseLeave={() => {
              onPointAtSearch(false)
              onPointAtMapPois(false)
            }}
          >
            <h3 className={`${TEXT.subheading} mb-1`}>Map</h3>
            <p className={TEXT.helper}>Search by name, or click any peak or lake.</p>
          </div>

          {/* Polygon — bare noun, not "Search by polygon": beside Map and
              Coordinates, a Draw polygon button says the rest, and the verb
              phrase restated its own helper line. */}
          <div className="mb-3">
            <h3 className={`${TEXT.subheading} mb-1.5`}>Polygon</h3>
            {drawPointCount > 0 && (
              <div className={`${TEXT.caption} space-y-0.5 mb-2`}>
                {/* Only while drawing does the status name a gesture: outside
                    the mode the handles are gone and none of them apply. */}
                {drawing && pointsNeeded > 0 ? (
                  <p className={STATUS.info}>
                    {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed,{' '}
                    {pointsNeeded} more needed.
                  </p>
                ) : drawing ? (
                  <p className={`${STATUS.ok} font-medium`}>
                    {drawPointCount} points placed. Press Done when ready.
                  </p>
                ) : (
                  <p className={pointsNeeded > 0 ? STATUS.info : `${STATUS.ok} font-medium`}>
                    {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed
                    {pointsNeeded > 0 && `, ${pointsNeeded} more needed`}
                  </p>
                )}
                {polygonAreaKm2 !== null && (
                  <p className={areaTooLarge ? STATUS.error : TEXT.caption}>
                    ~{Math.round(polygonAreaKm2).toLocaleString()} km²
                    {areaTooLarge && ` (max ${maxAreaKm2.toLocaleString()} km²)`}
                  </p>
                )}
                {polygonAreaKm2 !== null &&
                  polygonAreaKm2 > AREA_NOTE_KM2 &&
                  !areaTooLarge && (
                    <p className={STATUS.warn}>
                      Large polygon areas may be slow and hit limits.
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
                // Disabled until the ring is a polygon: with two points there
                // is nothing to be done WITH, and every path out of draw mode
                // (this button, Enter on the map) shares the 3-point floor.
                <button
                  onClick={onFinishDrawing}
                  disabled={drawPointCount < 3}
                  className={`${BUTTON_ACCENT} ${DISABLED}`}
                >
                  Done
                </button>
              ) : (
                <button onClick={onStartDrawing} className={BUTTON_SECONDARY}>
                  {drawPointCount > 0 ? 'Edit polygon' : 'Draw polygon'}
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
                three checkboxes under the Polygon heading are not ambiguous
                about what they do. */}
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
            {/* Unnamed peaks, beside the types it modifies rather than in a
                general options drawer three sections away. It is a polygon
                DISCOVERY knob and does nothing else: it widens what the
                Overpass query counts as a peak. Dimmed when Peaks is unticked,
                because then there is no peak search for it to widen — but still
                operable, so ticking it asks for peaks the way the grid's style
                segment asks for the grid. */}
            <label className={`${CHOICE_ROW} mt-1.5 ${peaksOn ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                checked={includeUnnamedPeaks}
                onChange={(e) => {
                  setIncludeUnnamedPeaks(e.target.checked)
                  if (e.target.checked && !peaksOn) setDestinationTypes([...destinationTypes, 'peak'])
                }}
                className={CHOICE_INPUT}
              />
              <span>Include unnamed peaks</span>
            </label>
          </div>

          {/* Coordinates — last because it is the one method with no map
              gesture at all: the three above are things you do to the map,
              and this is a list you bring to it. No helper line; the format
              states itself in the textarea placeholder. */}
          <div>
            <h3 className={`${TEXT.subheading} mb-1.5`}>Coordinates</h3>
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

        </section>

        {/* which model answers, and over which hours. One calendar,
            replacing the three mutually exclusive modes and their four
            date/time pairs (#166); the model above it bounds how far the
            calendar reaches. */}
        <section>
          <h2 className={`${TEXT.section} mb-2.5`}>
            Forecast
          </h2>

          {/* Above the calendar rather than in Options, because it bounds the
              calendar: the grid below redraws when this changes, and a control
              whose effect is the next control down belongs beside it. A data
              knob either way — sort, limit and a narrowing elevation band
              re-present held rows, while a different model is different
              numbers. Ordered longest-reach-first by the server. */}
          <div className="mb-3 flex items-center gap-2">
            {/* Label beside its control, like every other row in the panel.
                The trigger is a button carrying its own aria-label, not an
                input, so this is a span with nothing to point `htmlFor` at.
                A narrow trigger costs the list nothing: popoverBox never
                renders the panel narrower than its trigger and widens it to
                380px regardless. */}
            <span className={`${TEXT.control} flex-1`}>Model</span>
            <div className={`relative ${CONTROL_W}`}>
              {/* A model named by a link but not offered here still has to
                  appear, or the control would silently show a different model
                  than the one about to be requested. */}
              <ModelPicker
                models={
                  forecastModels.some((m) => m.id === forecastModel)
                    ? forecastModels
                    : [
                        {
                          id: forecastModel,
                          label: forecastModel,
                          summary: '',
                          finestGridKm: 0,
                          forecastHours: 0,
                          regional: false,
                          blend: false,
                        },
                        ...forecastModels,
                      ]
                }
                value={forecastModel}
                defaultId={defaultForecastModel}
                onChange={setForecastModel}
                compared={comparedModels}
                onComparedChange={setComparedModels}
                disabled={archiveWindow}
              />
            </div>
          </div>
          {/* Nothing between the model and the calendar, and nothing under it:
              every message this section has to make lives in the one block
              below the Analyze button (`windowMessages`). */}
          <ForecastCalendar selection={selection} onChange={setSelection} band={band} />
        </section>

        {/* Metrics — the ranking and the bounds in one table (#341). One row
            per metric: its radio, its aggregate dropdown, and its floor and
            ceiling boxes, so the two questions the panel used to ask in two
            sections 50px apart in height — "order by what?" and "who
            qualifies?" — are answered on the same line. The Lowest/Highest
            choice is ONE segment above the rows rather than one per row: it is
            a property of the ranking, not of each metric, and four of the five
            per-row segments were disabled at any moment. The dropdowns hide
            for a single-hour window, where every aggregate is the same number,
            and each label spans the empty column so the row keeps one gap.

            The two rows under the rule never rank: elevation gates the fetch
            rather than the display, and the results cap trims what is shown. They
            keep the left edge the radio rows' labels start from, and their
            boxes wear the same METRIC_BOX_W as every bound above. */}
        <section>
          <h2 className={`${TEXT.section} mb-2.5`}>
            Metrics
          </h2>
          <div className={METRICS_GRID}>
            {/* The one direction. Pressing a half never changes WHICH metric
                ranks; the radios own that. It is a flex row of its own inside
                the grid because the segment is CONTROL_W wide, wider than the
                three control columns under a single-hour window, and a grid
                item that wide would stretch the box columns to fit it. */}
            <div className="col-span-full flex items-center gap-2">
              <span id="rank-by" className={`${TEXT.control} flex-1`}>
                Rank by
              </span>
              <div className={SEGMENT} role="group" aria-labelledby="rank-by">
                {[
                  { desc: false, label: 'Lowest' },
                  { desc: true, label: 'Highest' },
                ].map((dir, i) => (
                  <button
                    key={dir.label}
                    aria-pressed={sortDesc === dir.desc}
                    onClick={() => setSortDesc(dir.desc)}
                    className={`${SEGMENT_ITEM} ${i > 0 ? SEGMENT_DIVIDER : ''} ${
                      sortDesc === dir.desc ? ACCENT.fill : SEGMENT_IDLE
                    }`}
                  >
                    {dir.label}
                  </button>
                ))}
              </div>
            </div>
            {/* The box columns' headings, the two aggregate names: for most
                rows that is literally what a box bounds (see BOUNDS). The
                unit moved from the label into each box's placeholder, because
                `Freezing level (ft)` does not fit beside a dropdown and two
                boxes; the heading is what says which box is which. */}
            <div className="col-span-2" aria-hidden="true" />
            {EDGES.map(([edge, aggregate]) => (
              <span key={edge} className={`${TEXT.caption} text-center`} aria-hidden="true">
                {aggregate}
              </span>
            ))}
            {RANKED_FAMILIES.map((family) => {
              const rowKey = rowKeys[family]
              const isActive = familyOf(sortBy) === family
              const bounds = BOUNDS[family]
              return (
                <Fragment key={family}>
                  <label
                    className={`${CHOICE_ROW} min-w-0 ${pointSample ? 'col-span-2' : ''}`}
                    title={bounds.note}
                  >
                    <input
                      type="radio"
                      name="sort_metric"
                      checked={isActive}
                      onChange={() => setSortBy(rowKey)}
                      className={CHOICE_INPUT}
                    />
                    <span className="truncate">{NOUN[family]}</span>
                  </label>
                  {!pointSample && (
                    // flex, not block: an inline-level select in a block
                    // wrapper reserves baseline descender space below itself,
                    // which read as the dropdown sitting ~1px lower than the
                    // boxes it must align with.
                    <div className={`relative flex ${isActive ? '' : 'opacity-50'}`}>
                      {/* py-0.5 is SEGMENT_ITEM's own vertical padding, so the
                          dropdown, the boxes and the segment above are the
                          same height. */}
                      <select
                        aria-label={`${NOUN[family]} aggregate`}
                        value={rowKey}
                        onChange={(e) => setSortBy(e.target.value as SortBy)}
                        className={`${SELECT} ${SELECT_W_AGGREGATE} px-2 py-0.5`}
                      >
                        {FAMILY_KEYS[family].map((key) => (
                          <option key={key} value={key}>
                            {windowAggregate(key)}
                          </option>
                        ))}
                      </select>
                      <svg
                        className={`${ICON_ADORNMENT} h-4 w-4`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  {EDGES.map(([edge, aggregate], i) => (
                    <input
                      key={edge}
                      id={`${bounds.id}-${edge}`}
                      title={bounds.note}
                      type="number"
                      step={bounds.step}
                      placeholder={UNIT[family]}
                      aria-label={`${NOUN[family]} ${aggregate}. ${bounds.hint[i]}`}
                      value={constraints[bounds[edge]] ?? ''}
                      onChange={(e) =>
                        setConstraints({
                          ...constraints,
                          [bounds[edge]]: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className={METRIC_BOX}
                    />
                  ))}
                </Fragment>
              )
            })}
            <div className={`col-span-full ${METRICS_RULE}`} />
            {/* On the label AND both boxes, so the note is reachable from
                anywhere in the row rather than from a third of it. Tooltips
                are otherwise not used here and need explicit approval — see
                docs/STYLES.md. */}
            <label
              htmlFor="elevation-lower"
              className={`${TEXT.control} col-span-2 truncate`}
              title={ELEVATION_NOTE}
            >
              Elevation
            </label>
            {EDGES.map(([edge, aggregate], i) => {
              const [value, set] = edge === 'lower'
                ? ([minElevationFt, setMinElevationFt] as const)
                : ([maxElevationFt, setMaxElevationFt] as const)
              return (
                <input
                  key={edge}
                  id={`elevation-${edge}`}
                  title={ELEVATION_NOTE}
                  type="number"
                  step={100}
                  placeholder={ELEVATION_UNIT}
                  aria-label={`Elevation ${aggregate}. ${ELEVATION_HINT[i]}`}
                  value={value ?? ''}
                  onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))}
                  className={METRIC_BOX}
                />
              )
            })}
            {/* How many of that order to show. It sits with elevation because
                neither ranks: the rows above say WHICH order, and this says how
                far down it to go — "the 200 lowest by total precipitation" is
                one thought. It is not a bound either: it trims what is shown
                and never what is analyzed. The ceiling is the live analysis
                cap from /api/capabilities. The default rides as a placeholder,
                like the boxes above, so changing it is one keystroke rather
                than a select-and-erase. Empty means the DEFAULT here, not "no
                cap" as it does for a bound: this knob always has a value, and
                the row count in the table's header says what it is doing. */}
            <label
              htmlFor="max-results"
              className={`${TEXT.control} col-span-3 truncate`}
              title={LIMIT_NOTE}
            >
              {AGGREGATE.maximum} results
            </label>
            <input
              id="max-results"
              type="number"
              min={1}
              max={maxLimit}
              placeholder={String(DEFAULT_LIMIT)}
              value={limit === DEFAULT_LIMIT ? '' : limit}
              onChange={(e) =>
                setLimit(clampLimit(parseInt(e.target.value) || DEFAULT_LIMIT, maxLimit))
              }
              title={LIMIT_NOTE}
              className={METRIC_BOX}
            />
            {filtersActive && (
              /* Under the two box columns, on their outer edges, so the one
                 control with no label sits where every bound it clears does. */
              <button
                onClick={onClearFilters}
                className={`${BUTTON_SECONDARY} col-span-2 col-start-3 mt-0.5`}
              >
                Clear filters
              </button>
            )}
          </div>
        </section>

      </div>

      {/* Footer */}
      <div className={`px-4 py-4 border-t ${PANEL_EDGE} space-y-3`}>
        <button
          onClick={onAnalyze}
          disabled={!analyzeEnabled}
          className={`${BUTTON_PRIMARY} ${DISABLED}`}
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>

        {footerBoxes.map((box) => (
          <FooterNotice
            key={box.severity}
            severity={box.severity}
            messages={box.messages}
            onDismiss={(key) => setDismissed((prev) => [...prev, key])}
          >
            {/* One retry for the whole box, at the bottom (TJ, 2026-08-22):
                it re-runs the analysis, so a message whose condition clears
                drops out and the box closes when none remain. Only a failed
                run summons it — a state problem alone, like an oversized
                polygon, cannot be retried into working. */}
            {box.messages.some((m) => m.retry) && (
              <button onClick={onRetry} disabled={loading} className={BUTTON_DANGER}>
                Try again
              </button>
            )}
          </FooterNotice>
        ))}

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

