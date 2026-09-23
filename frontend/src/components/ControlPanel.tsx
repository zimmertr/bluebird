import { useEffect, useMemo, useRef } from 'react'
import { CustomDestination, DiscoveryType, SortBy } from '../types'
import { Refusal } from '../hooks/useAnalyze'
import DestinationsSection from './DestinationsSection'
import ForecastSection from './ForecastSection'
import MetricsTable from './MetricsTable'
import PanelFooter from './PanelFooter'
import { parseCustomCsv } from '../utils/customDestinations'
import { PANEL_EDGE, PANEL_RULE, TEXT } from '../styles'
import { MetricFamily, familyOf } from '../metrics'
import { Constraints } from '../utils/clientAnalyze'
import type { CommitReason } from '../utils/present'
import { analyzeBlockers, canAnalyze, shouldAutoAnalyze } from '../utils/analyzeGate'
import { modelsWithoutFreeze } from '../utils/freezingLevel'
import { selectedIds } from '../utils/modelSelection'
import { panelMessages } from '../utils/panelMessages'
import { classifyAqiCoverage } from '../utils/urlState'
import { ForecastSelection, hasDates, selectionLocalWindow } from '../utils/calendar'
import { windowSource, type WindowLimits } from '../utils/forecastWindow'
import { type ForecastModelOption } from '../hooks/useCapabilities'
import { logoUrl } from '../logo'

// The panel's frame: the header, the three sections and the footer, and the
// state they share. Each section is its own component taking only the inputs
// it draws, and every message the panel shows is composed in
// `utils/panelMessages.ts` and drawn by `PanelFooter`, below the Analyze button.

// Each field that one section alone draws is described on that section's own
// props, beside the code that reads it.
interface Props {
  drawing: boolean
  onStartDrawing: () => void
  onFinishDrawing: () => void
  drawPointCount: number
  polygonAreaKm2: number | null
  onCancelDrawing: () => void
  onClearDrawing: () => void
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
  onCsvPasted: (points: CustomDestination[]) => void
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  sortDesc: boolean
  setSortDesc: (d: boolean) => void
  rowKeys: Record<MetricFamily, SortBy>
  // Whether the panel's When selection is one hourly stamp, handed through to
  // the Metrics table. It reads the selection and not the analyzed report,
  // because the table's dropdowns must follow a When switch before Analyze.
  pointSample: boolean
  constraints: Constraints
  setConstraints: (c: Constraints) => void
  onClearFilters: () => void
  includeUnnamedPeaks: boolean
  setIncludeUnnamedPeaks: (v: boolean) => void
  // Which weather model answers, and the set this deployment offers, from
  // /api/capabilities. A data knob: models disagree, so changing one needs new
  // forecasts rather than a re-presentation of held ones.
  forecastModel: string
  setForecastModel: (id: string) => void
  forecastModels: readonly ForecastModelOption[]
  comparedModels: readonly string[]
  setComparedModels: (ids: string[]) => void
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
  // limit and every forecast bound re-present the held field with no Analyze
  // at all (#188), so this cue is the exception rather than the rule and has
  // to say which exception it is.
  // Every knob that has stopped applying live, in `commitNeeded`'s fixed
  // order (model, window, polygon, types, destination). One warn
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
  // The link asked for its analysis to run on open (`analyze=1`) and has not
  // run it yet. Held by App, which owns the URL; fired from here, which owns
  // the gate. `onAutoAnalyze` is the click plus the URL cleanup.
  autoAnalyze: boolean
  // Whether /api/capabilities has settled AND the limits it clamps have been
  // applied, so the gate below reads the deployment's numbers.
  capabilitiesSettled: boolean
  onAutoAnalyze: () => void
  onRetry: () => void
  maxLimit: number
  // Live polygon-area gate from /api/capabilities, same contract as maxLimit
  // above: the deployment's number, with a compiled fallback behind it.
  maxAreaKm2: number
  // How far back the calendar may reach, from /api/capabilities: the archive
  // endpoint's reach, same contract as the two ceilings above.
  archiveDays: number
  // How far ahead air quality reaches, from /api/capabilities: what dims the
  // calendar's later days, and the horizon the line below Analyze names.
  aqiForecastDays: number
  // The window bounds this deployment validates against, from
  // /api/capabilities. Read here to decide which endpoint answers the SELECTED
  // window, so the panel and the fetch cannot put the seam in two places.
  windowLimits: WindowLimits
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

export default function ControlPanel({
  drawing,
  onStartDrawing,
  onFinishDrawing,
  drawPointCount,
  polygonAreaKm2,
  onCancelDrawing,
  onClearDrawing,
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
  autoAnalyze,
  capabilitiesSettled,
  onAutoAnalyze,
  onRetry,
  maxLimit,
  maxAreaKm2,
  archiveDays,
  aqiForecastDays,
  windowLimits,
  resultCount,
  aqiAllNull,
  wildfireCheckFailed,
}: Props) {
  // Falls back to the id so a link naming a model this deployment stopped
  // publishing still reads as something rather than as an empty gap in a
  // sentence.
  const modelLabel =
    forecastModels.find((m) => m.id === forecastModel)?.label ?? forecastModel
  // Parsed once per change: the gate reads whether there is any, and the
  // Destinations section prints how many.
  const parsedCustom = useMemo(() => parseCustomCsv(customCsv), [customCsv])
  const hasCustom = parsedCustom.length > 0
  const areaTooLarge = polygonAreaKm2 !== null && polygonAreaKm2 > maxAreaKm2

  const polygonReady = drawPointCount >= 3 && !areaTooLarge && destinationTypes.length > 0

  // Every model the analysis would fetch, the ranking one first. The two
  // checks below are pre-flight: they read the picker rather than a report,
  // because their whole point is to refuse to buy an analysis that cannot
  // answer the question the panel is asking.
  const selected = useMemo(
    () =>
      selectedIds(forecastModels, forecastModel, comparedModels).map((id) => ({
        id,
        label: forecastModels.find((m) => m.id === id)?.label ?? id,
      })),
    [forecastModels, forecastModel, comparedModels],
  )
  const rankFamily = familyOf(sortBy)
  // Air quality comes from one source for every model, so a comparison on it
  // would fetch the same numbers several times and draw one line where the
  // picker shows several chips.
  const compareAqi = rankFamily === 'aqi' && selected.length > 1
  // The snow analysis is one national grid the pod holds, so it is the second
  // metric no model answers.
  const compareSnow = rankFamily === 'snow' && selected.length > 1
  // Named rather than counted: the model is a control in this panel, so the
  // reader can act on a name and cannot act on a fraction.
  const freezeGaps = useMemo(
    () => (rankFamily === 'freeze' ? modelsWithoutFreeze(selected).map((m) => m.label) : []),
    [rankFamily, selected],
  )
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
    compareAqi,
    compareFreeze: freezeGaps.length > 0,
    compareSnow,
  }
  const analyzeEnabled = canAnalyze(gate)

  // A link's run on open fires from here rather than from App because the gate
  // is computed here: lifting it into a hook both could read would move a dozen
  // inputs for one boolean. The ref keeps it to once per panel even if a
  // render lands before App has cleared `autoAnalyze`.
  const autoFiredRef = useRef(false)
  useEffect(() => {
    const fire = shouldAutoAnalyze({
      requested: autoAnalyze,
      capabilitiesSettled,
      gateOpen: analyzeEnabled,
      fired: autoFiredRef.current,
    })
    if (!fire) return
    autoFiredRef.current = true
    onAutoAnalyze()
    // `onAutoAnalyze` is left out on purpose: it is a new function on every
    // App render, and listing it would re-run this on every render for nothing.
    // The flags above are what can change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze, capabilitiesSettled, analyzeEnabled])
  const blockers = analyzeBlockers({ ...gate, drawPointCount })

  // The selection as the datetime pair the warnings read. The calendar marks
  // days past the air-quality horizon in the grid; this is the sentence that
  // explains the mark once a selection actually crosses it.
  const now = new Date()
  const window = selectionLocalWindow(selection, now)
  const windowMs =
    window === null
      ? null
      : { startMs: new Date(window.start).getTime(), endMs: new Date(window.end).getTime() }
  // Informational only — never blocks Analyze. AQI simply degrades to "—". The
  // current hour is always inside the ~5-day horizon, and a dateless Dates arm
  // has no window to warn about.
  const aqiCoverage =
    selection.kind === 'now' || window === null
      ? 'full'
      : classifyAqiCoverage(window.start, window.end, now, aqiForecastDays)
  // Which endpoint answers the SELECTED window (#123), which decides two things
  // in this panel. A window the archive answers names no model — its default is
  // a reanalysis, one dataset everywhere, and the picker's models are forecast
  // models that do not run over the past — so the picker does not apply and is
  // disabled rather than left looking like an input to a fetch that ignores it.
  // A window crossing the boundary keeps the picker: the forecast half is the
  // chosen model's, and the seam notice says where that half begins.
  const selectedSource =
    windowMs === null
      ? null
      : windowSource(windowMs.startMs, windowMs.endMs, now.getTime(), windowLimits)

  const pointsNeeded = Math.max(0, 3 - drawPointCount)

  const messages = panelMessages({
    loading,
    error,
    refusal,
    commitReasons: commitReasons ?? [],
    modelLabel,
    modelClamped,
    windowWarning,
    window: windowMs,
    source: selectedSource,
    aqiCoverage,
    blockers,
    pointsNeeded,
    freezeGaps,
    maxAreaKm2,
    archiveDays,
    aqiForecastDays,
    windowLimits,
    hasReport: resultCount !== undefined,
    aqiAllNull: Boolean(aqiAllNull),
    wildfireCheckFailed: Boolean(wildfireCheckFailed),
    now,
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`border-b ${PANEL_EDGE} flex`}>
        <img
          src={logoUrl}
          alt=""
          width={256}
          height={256}
          className="w-20 object-cover flex-shrink-0"
        />
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
        <DestinationsSection
          drawing={drawing}
          onStartDrawing={onStartDrawing}
          onFinishDrawing={onFinishDrawing}
          onCancelDrawing={onCancelDrawing}
          onClearDrawing={onClearDrawing}
          drawPointCount={drawPointCount}
          pointsNeeded={pointsNeeded}
          areaTooLarge={areaTooLarge}
          polygonAreaKm2={polygonAreaKm2}
          maxAreaKm2={maxAreaKm2}
          onPointAtSearch={onPointAtSearch}
          onPointAtMapPois={onPointAtMapPois}
          destinationTypes={destinationTypes}
          setDestinationTypes={setDestinationTypes}
          includeUnnamedPeaks={includeUnnamedPeaks}
          setIncludeUnnamedPeaks={setIncludeUnnamedPeaks}
          customCsv={customCsv}
          setCustomCsv={setCustomCsv}
          parsedCount={parsedCustom.length}
          onCsvPasted={onCsvPasted}
        />

        {/* which model answers, and over which hours. One calendar,
            replacing the three mutually exclusive modes and their four
            date/time pairs (#166); the model above it bounds how far the
            calendar reaches. */}
        <ForecastSection
          forecastModel={forecastModel}
          setForecastModel={setForecastModel}
          forecastModels={forecastModels}
          comparedModels={comparedModels}
          setComparedModels={setComparedModels}
          defaultForecastModel={defaultForecastModel}
          modelDisabled={selectedSource === 'archive'}
          selection={selection}
          setSelection={setSelection}
          archiveDays={archiveDays}
          aqiForecastDays={aqiForecastDays}
        />

        <MetricsTable
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortDesc={sortDesc}
          setSortDesc={setSortDesc}
          rowKeys={rowKeys}
          pointSample={pointSample}
          constraints={constraints}
          setConstraints={setConstraints}
          onClearFilters={onClearFilters}
          limit={limit}
          setLimit={setLimit}
          maxLimit={maxLimit}
        />
      </div>

      <PanelFooter
        analyzeEnabled={analyzeEnabled}
        loading={loading}
        onAnalyze={onAnalyze}
        onRetry={onRetry}
        messages={messages}
      />
    </div>
  )
}
