import { useEffect, useMemo, useRef } from 'react'
import { CustomDestination, DiscoveryType, SortBy } from '../types'
import DestinationsSection from './DestinationsSection'
import ForecastSection from './ForecastSection'
import MetricsTable from './MetricsTable'
import PanelFooter from './PanelFooter'
import { parseCustomCsv } from '../utils/customDestinations'
import { distinctRows } from '../utils/customList'
import { CONTROLS_SHEET, PANEL_BODY, PANEL_EDGE, PANEL_HEADER, PANEL_RULE, TEXT } from '../styles'
import { useScrollShadows } from '../hooks/useScrollShadows'
import type { PanelMessages } from '../hooks/usePanelMessages'
import { MetricFamily } from '../metrics'
import { Constraints } from '../utils/clientAnalyze'
import { type ActionWord, shouldAutoAnalyze } from '../utils/analyzeGate'
import { ForecastSelection } from '../utils/calendar'
import { type ForecastModelOption } from '../hooks/useCapabilities'
import { logoUrl } from '../logo'

// The panel's frame: the header, the three sections and the footer, and the
// state they share. Each section is its own component taking only the inputs
// it draws. Every message the panel has to say is composed in
// `utils/panelMessages.ts` and held by `usePanelMessages` above the panel,
// since the phone's map reads it too (record 0208): the footer draws the
// Analyze button with the badge and the list.

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
  // Every message the panel has to say and the Analyze gate
  // (`usePanelMessages`): held above the panel, because the phone's map reads
  // the same messages on its own button.
  messages: PanelMessages
  // What the Analyze button reads (#736): decided by App from the run's
  // error and the panel, because the phone's floating button reads the same
  // word and the two must never disagree.
  actionWord: ActionWord
  onAnalyze: () => void
  // The link asked for its analysis to run on open (`analyze=1`) and has not
  // run it yet. Held by App, which owns the URL; fired from here, which owns
  // the panel. `onAutoAnalyze` is the click plus the URL cleanup.
  autoAnalyze: boolean
  // Whether /api/capabilities has settled AND the limits it clamps have been
  // applied, so the gate below reads the deployment's numbers.
  capabilitiesSettled: boolean
  onAutoAnalyze: () => void
  onTutorial: () => void
  tutorialWaits?: boolean
  maxLimit: number
  // Live polygon-area gate from /api/capabilities, same contract as maxLimit
  // above: the deployment's number, with a compiled fallback behind it. The
  // polygon block prints it beside an oversized ring's area.
  maxAreaKm2: number
  // How far back the calendar may reach, from /api/capabilities: the archive
  // endpoint's reach, same contract as the two ceilings above.
  archiveDays: number
  // How far ahead air quality reaches, from /api/capabilities: what dims the
  // calendar's later days.
  aqiForecastDays: number
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
  messages,
  actionWord,
  onAnalyze,
  autoAnalyze,
  capabilitiesSettled,
  onAutoAnalyze,
  onTutorial,
  tutorialWaits,
  maxLimit,
  maxAreaKm2,
  archiveDays,
  aqiForecastDays,
  phone = false,
}: Props) {
  // A line pasted twice is one destination, and the count says so (#579).
  // Parsed once per change for the count; the gate reads App's parse.
  const customCount = useMemo(() => distinctRows(parseCustomCsv(customCsv)).length, [customCsv])
  const { analyzeEnabled, areaTooLarge, pointsNeeded, modelDisabled } = messages

  // A link's run on open fires from here rather than from App because the
  // panel is what the link opens on. The ref keeps it to once per panel even
  // if a render lands before App has cleared `autoAnalyze`.
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

  // The body's scroll shadows, for the browsers whose CSS cannot tell on its
  // own whether there is more above or below (#697).
  const bodyRef = useRef<HTMLDivElement>(null)
  useScrollShadows(bodyRef)

  // At a desk the footer is fixed under the scrolling body, with Analyze and
  // its badge; on a phone it is the body's last child (#696; record 0141).
  const footer = (
    <PanelFooter
      analyzeEnabled={analyzeEnabled}
      word={actionWord}
      onAnalyze={onAnalyze}
      onTutorial={onTutorial}
      tutorialWaits={tutorialWaits}
      messages={messages}
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
            <p className={TEXT.caption}>The Weather Window Finder</p>
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
          modelDisabled={modelDisabled}
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
            fixed height on it, and its Analyze and badge are the map's. */}
        {phone && footer}
      </div>

      {!phone && footer}
    </div>
  )
}
