import { useEffect, useMemo, useRef } from 'react'
import { CustomDestination, DiscoveryType, SortBy } from '../types'
import { Refusal, RunError } from '../hooks/useAnalyze'
import DestinationsSection from './DestinationsSection'
import ForecastSection from './ForecastSection'
import MetricsTable from './MetricsTable'
import PanelFooter from './PanelFooter'
import { parseCustomCsv } from '../utils/customDestinations'
import { distinctRows } from '../utils/customList'
import { CONTROLS_SHEET, PANEL_BODY, PANEL_EDGE, PANEL_HEADER, PANEL_RULE, TEXT } from '../styles'
import { useScrollShadows } from '../hooks/useScrollShadows'
import { MetricFamily } from '../metrics'
import { Constraints } from '../utils/clientAnalyze'
import type { CommitReason } from '../utils/present'
import {
  type ActionWord,
  analyzeBlockers,
  analyzeGateFor,
  canAnalyze,
  ringAddsNothing,
  shouldAutoAnalyze,
} from '../utils/analyzeGate'
import type { EventNoticeKind } from '../utils/notices'
import { panelMessages } from '../utils/panelMessages'
import { classifyAqiCoverage } from '../utils/urlState'
import { ForecastSelection, selectionLocalWindow } from '../utils/calendar'
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
  error: RunError | null
  // An over-limit refusal. One error line, and the Analyze button keeps its
  // own word over it: retrying a deterministic refusal verbatim re-buys the
  // same 10-40s map query for the same answer.
  refusal: Refusal | null
  // What the Analyze button reads (#736): decided by App from the run's
  // error and the panel, because the phone's floating button reads the same
  // word and the two must never disagree.
  actionWord: ActionWord
  onAnalyze: () => void
  // The link asked for its analysis to run on open (`analyze=1`) and has not
  // run it yet. Held by App, which owns the URL; fired from here, which owns
  // the gate. `onAutoAnalyze` is the click plus the URL cleanup.
  autoAnalyze: boolean
  // Whether /api/capabilities has settled AND the limits it clamps have been
  // applied, so the gate below reads the deployment's numbers.
  capabilitiesSettled: boolean
  onAutoAnalyze: () => void
  // Dismissing the run error or the refusal clears the event (#253, #736).
  onDismissEvent: (kind: EventNoticeKind) => void
  onTutorial: () => void
  tutorialWaits?: boolean
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
  // The same for the closure check (#550): no row has been checked against
  // the Forest Service's closure orders.
  closureCheckFailed?: boolean
  // The basemap style is failing to load (#580).
  basemapFailed?: boolean
  // Where the footer's notice block stands on a phone (record 0140), handed
  // to `PanelFooter`; null keeps it under the button.
  noticeHome?: HTMLElement | null
  // A phone, where the panel is the Controls sheet (#696; record 0141): the
  // sheet's own head replaces the logo and the title, and the map's floating
  // button is the one Analyze, so the footer draws none.
  phone?: boolean
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
  actionWord,
  onAnalyze,
  autoAnalyze,
  capabilitiesSettled,
  onAutoAnalyze,
  onDismissEvent,
  onTutorial,
  tutorialWaits,
  maxLimit,
  maxAreaKm2,
  archiveDays,
  aqiForecastDays,
  windowLimits,
  resultCount,
  aqiAllNull,
  wildfireCheckFailed,
  closureCheckFailed,
  basemapFailed,
  noticeHome = null,
  phone = false,
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
  // A line pasted twice is one destination, and the count says so (#579).
  const customCount = useMemo(() => distinctRows(parsedCustom).length, [parsedCustom])
  // The gate the map's Analyze reads too (#696): one function from the same
  // inputs, so the two buttons cannot disagree about whether a run may start.
  const { gate, freezeGaps } = analyzeGateFor({
    selection,
    hasWindowWarning: windowWarning !== null,
    loading,
    polygonAreaKm2,
    maxAreaKm2,
    drawPointCount,
    destinationTypes,
    hasCustom,
    hasPins,
    sortBy,
    forecastModels,
    forecastModel,
    comparedModels,
  })
  const { areaTooLarge } = gate
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
  const ringIgnored = ringAddsNothing({ ...gate, drawPointCount, drawing })

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
    ringIgnored,
    pointsNeeded,
    freezeGaps,
    maxAreaKm2,
    archiveDays,
    aqiForecastDays,
    windowLimits,
    hasReport: resultCount !== undefined,
    aqiAllNull: Boolean(aqiAllNull),
    wildfireCheckFailed: Boolean(wildfireCheckFailed),
    closureCheckFailed: Boolean(closureCheckFailed),
    basemapFailed: Boolean(basemapFailed),
    now,
  })

  // The body's scroll shadows, for the browsers whose CSS cannot tell on its
  // own whether there is more above or below (#697).
  const bodyRef = useRef<HTMLDivElement>(null)
  useScrollShadows(bodyRef)

  // At a desk the footer is fixed under the scrolling body, with Analyze and
  // the notices; on a phone it is the body's last child (#696; record 0141).
  const footer = (
    <PanelFooter
      analyzeEnabled={analyzeEnabled}
      word={actionWord}
      onAnalyze={onAnalyze}
      onDismissEvent={onDismissEvent}
      onTutorial={onTutorial}
      tutorialWaits={tutorialWaits}
      messages={messages}
      noticeHome={noticeHome}
      phone={phone}
    />
  )

  return (
    // The panel a menu opened in it stays inside (`usePopover`, record 0201):
    // the model list lines up with its field's right edge rather than
    // spilling over the map.
    <div data-menu-bound="" className="flex flex-col h-full">
      {/* Header, at a desk: a phone's sheet carries its own (`AppDrawer`). */}
      {!phone && (
        <div className={`border-b ${PANEL_EDGE} flex`}>
          <img
            src={logoUrl}
            alt=""
            width={256}
            height={256}
            className={PANEL_HEADER.logo}
          />
          <div className={PANEL_HEADER.title}>
            <h1 className={TEXT.appTitle}>Bluebird Forecast</h1>
            <p className={TEXT.caption}>Weather Window Finder</p>
          </div>
        </div>
      )}

      <div
        // One rule between steps, drawn by the stack rather than by each
        // section, so a section added later cannot forget its line or draw a
        // second one. The two spacing utilities are a matched pair and have to
        // stay equal: `space-y` is the gap ABOVE each rule (margin sits outside
        // the border) and `pt` the gap below it, so the line lands centred in
        // the gutter between two steps rather than tucked under the one above.
        ref={bodyRef}
        className={`${PANEL_BODY} ${PANEL_RULE} ${phone ? CONTROLS_SHEET.body : ''}`}
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
          parsedCount={customCount}
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
          phone={phone}
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
          phone={phone}
        />

        {/* A phone's footer is the document links, the last thing in the
            body, read only by a reader who scrolls to it: the sheet spends no
            fixed height on it, and its notices are the map's (record 0140). */}
        {phone && footer}
      </div>

      {!phone && footer}
    </div>
  )
}
