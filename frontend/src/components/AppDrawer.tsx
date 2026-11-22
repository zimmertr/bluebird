import { useRef, type ReactNode, type RefObject } from 'react'
import BottomSheet from './BottomSheet'
import type { SheetHeight } from '../utils/sheetDrag'
import ControlPanel, { type PanelSection } from './ControlPanel'
import type { MapViewHandle } from './MapView'
import { IconClose } from './icons'
import ThemeMenu from './ThemeMenu'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import type { LiveCapabilities } from '../hooks/useCapabilities'
import type { DestinationInputs } from '../hooks/useDestinationInputs'
import type { DrawMode } from '../hooks/useDrawMode'
import type { ForecastSelectionState } from '../hooks/useForecastSelection'
import type { PanelMessages } from '../hooks/usePanelMessages'
import type { RankingKnobs } from '../hooks/useRankingKnobs'
import type { ChartMetricsState } from '../hooks/useChartMetrics'
import { CONTROLS_SHEET, HEADER_BUTTON, SENTENCE_BAR, TEXT } from '../styles'
import type { ThemeChoice } from '../utils/viewPrefs'

interface AppDrawerProps {
  /** Whether the panel is open: a desk's card, or the Controls sheet on a phone. */
  open: boolean
  /** A desk, where the panel is a card under the sentence bar; a phone raises it as a sheet. */
  isDesktop: boolean
  /** Where a drag left the Controls sheet on a phone, or null for its own share (`sheetRestPx`). */
  sheetHeld: SheetHeight | null
  /** Its own share, which a release near it or a double press on the grip gives back (record 0146). */
  sheetRestPx: number
  /** Holds it at a dragged height, or null for its own share. */
  onSheetHeld: (held: SheetHeight | null) => void
  /** Closes the Controls sheet on a phone: Done, Escape or a press on the dim. */
  onClose: () => void
  /**
   * The tutorial runs, and its card has the keyboard: a phone's Controls
   * sheet, which a panel step holds open, then takes neither it nor Tab.
   */
  tourRuns?: boolean
  /** Draw mode and its buttons (`useDrawMode`). */
  drawMode: Pick<
    DrawMode,
    'drawing' | 'startDrawing' | 'finishDrawing' | 'drawPointCount' | 'handleCancelDrawing' | 'handleClearDrawing'
  >
  /** The discovery inputs: types and the coordinates box (`useDestinationInputs`). */
  destinationInputs: Pick<
    DestinationInputs,
    | 'polygonAreaKm2'
    | 'destinationTypes'
    | 'setDestinationTypes'
    | 'customCsv'
    | 'setCustomCsv'
    | 'includeUnnamedPeaks'
    | 'setIncludeUnnamedPeaks'
  >
  /** The window, the model and its comparisons (`useForecastSelection`). */
  forecastSelection: Pick<
    ForecastSelectionState,
    | 'selection'
    | 'changeSelection'
    | 'forecastModel'
    | 'changeForecastModel'
    | 'comparedModels'
    | 'setComparedModels'
    | 'panelPointSample'
  >
  /** The ranking, the cap and the bounds (`useRankingKnobs`). */
  rankingKnobs: Pick<
    RankingKnobs,
    | 'sortBy'
    | 'setSortBy'
    | 'sortDesc'
    | 'setSortDesc'
    | 'rowKeys'
    | 'constraints'
    | 'setConstraints'
    | 'limit'
    | 'setLimit'
    | 'clearFilters'
  >
  /** The results chart's panels, which the Metrics rows' chart toggles move (`useChartMetrics`, record 0290). */
  chartMetrics: Pick<ChartMetricsState, 'metrics' | 'chart'>
  /** The deployment's published limits and models (`useCapabilities`). */
  caps: LiveCapabilities
  /** The map, which a pasted list of coordinates fits to. */
  mapRef: RefObject<MapViewHandle | null>
  /** The panel's Map group is hovered: the search box and the map's features wear a cue. */
  onPointAtSearch: (on: boolean) => void
  onPointAtMapPois: (on: boolean) => void
  /** Whether the preset list last picked beside List search arrived (#838). */
  onPresetListFailed: (failed: boolean) => void
  /** Every message the panel has to say, with the Analyze gate and the blockers by field (`usePanelMessages`). */
  messages: PanelMessages
  /** The one run a link may ask for on open, which a phone's panel fires. */
  autoAnalyze: boolean
  capabilitiesSettled: boolean
  onAutoAnalyze: (step: 'run' | 'drop') => void
  /** Open the guided tutorial from the phone sheet's document links (#536). */
  onTutorial: () => void
  /** The tour cannot start now (a draw or a run is under way), so its link is inert. */
  tutorialWaits?: boolean
  /** The theme choice, and the setter the header's theme menu calls (`useTheme`, #843). */
  themeChoice: ThemeChoice
  onThemeChoice: (choice: ThemeChoice) => void
  /**
   * At a desk, the one section a sentence-bar chip opened, as a card under the
   * bar, or null with none open (record 0309): the card is the panel, and
   * nothing is drawn without one (record 0334). On a phone, the section the
   * phrase that raised the Controls sheet names, which the sheet scrolls to.
   */
  card: PanelSection | null
  /** The map's view is the search area while no ring is drawn (record 0309). */
  viewIsArea?: boolean
  /** Closes the card: its close button. */
  onCardClose?: () => void
  /** The place search, at the head of a desk's Where card (record 0313) and of a phone's Controls sheet (record 0328). */
  search?: ReactNode
}

// What each card is headed, the word its chip stands for. In the PR's table.
const CARD_HEADING: Readonly<Record<PanelSection, string>> = {
  destinations: 'Where',
  forecast: 'When',
  metrics: 'Limits',
}

/**
 * The controls panel around `ControlPanel` (#409 cut it out of `App.tsx`):
 * at a desk the one card a sentence-bar chip opens (record 0309), and on a
 * phone the Controls sheet (#696; record 0141), which the map's phrase raises
 * as a modal sheet over the dimmed map, the way Layers and Legend rise
 * (record 0207).
 * Closing on a committed report is App's, because the report is App's, and
 * so are the panel's messages (`usePanelMessages`), which the phone's map
 * reads too: this only draws the panel it is told is open.
 */
export default function AppDrawer({
  open,
  isDesktop,
  sheetHeld,
  sheetRestPx,
  onSheetHeld,
  onClose,
  tourRuns = false,
  drawMode,
  destinationInputs,
  forecastSelection,
  rankingKnobs,
  chartMetrics,
  caps,
  mapRef,
  onPointAtSearch,
  onPointAtMapPois,
  onPresetListFailed,
  messages,
  autoAnalyze,
  capabilitiesSettled,
  onAutoAnalyze,
  onTutorial,
  tutorialWaits,
  themeChoice,
  onThemeChoice,
  card,
  onCardClose,
  search,
  viewIsArea = false,
}: AppDrawerProps) {
  const { drawing, startDrawing, finishDrawing, drawPointCount, handleCancelDrawing, handleClearDrawing } = drawMode
  const {
    polygonAreaKm2,
    destinationTypes,
    setDestinationTypes,
    customCsv,
    setCustomCsv,
    includeUnnamedPeaks,
    setIncludeUnnamedPeaks,
  } = destinationInputs
  const {
    selection,
    changeSelection,
    forecastModel,
    changeForecastModel,
    comparedModels,
    setComparedModels,
    panelPointSample,
  } = forecastSelection
  const {
    sortBy,
    setSortBy,
    sortDesc,
    setSortDesc,
    rowKeys,
    constraints,
    setConstraints,
    limit,
    setLimit,
    clearFilters,
  } = rankingKnobs
  // Opened from a sentence-bar chip, the keyboard lands on the card's own way
  // back out when nothing else holds it (#576). A phone's sheet takes the
  // keyboard itself, as a menu sheet does.
  const closeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(closeRef, open)
  const panel = (
    <ControlPanel
      phone={!isDesktop}
      drawing={drawing}
      onStartDrawing={startDrawing}
      onFinishDrawing={finishDrawing}
      drawPointCount={drawPointCount}
      viewIsArea={viewIsArea}
      polygonAreaKm2={polygonAreaKm2}
      onCancelDrawing={handleCancelDrawing}
      onClearDrawing={handleClearDrawing}
      onPointAtSearch={onPointAtSearch}
      onPointAtMapPois={onPointAtMapPois}
      destinationTypes={destinationTypes}
      setDestinationTypes={setDestinationTypes}
      selection={selection}
      setSelection={changeSelection}
      limit={limit}
      setLimit={setLimit}
      customCsv={customCsv}
      setCustomCsv={setCustomCsv}
      onCsvPasted={(points) => mapRef.current?.fitToPoints(points)}
      onPresetListFailed={onPresetListFailed}
      messages={messages}
      sortBy={sortBy}
      setSortBy={setSortBy}
      sortDesc={sortDesc}
      setSortDesc={setSortDesc}
      rowKeys={rowKeys}
      pointSample={panelPointSample}
      constraints={constraints}
      setConstraints={setConstraints}
      onClearFilters={clearFilters}
      includeUnnamedPeaks={includeUnnamedPeaks}
      setIncludeUnnamedPeaks={setIncludeUnnamedPeaks}
      forecastModel={forecastModel}
      comparedModels={comparedModels}
      setComparedModels={setComparedModels}
      setForecastModel={changeForecastModel}
      forecastModels={caps.forecastModels}
      defaultForecastModel={caps.defaultForecastModel}
      maxLimit={caps.maxLimit}
      maxAreaKm2={caps.maxPolygonAreaKm2}
      archiveDays={caps.archiveDays}
      aqiForecastDays={caps.aqiForecastDays}
      autoAnalyze={autoAnalyze}
      capabilitiesSettled={capabilitiesSettled}
      onAutoAnalyze={onAutoAnalyze}
      onTutorial={onTutorial}
      tutorialWaits={tutorialWaits}
      charted={chartMetrics.metrics}
      onChart={chartMetrics.chart}
      only={isDesktop && card ? card : undefined}
      scrollTo={isDesktop ? null : (card ?? null)}
    />
  )

  if (isDesktop) {
    if (card === null) return null
    return (
      <section aria-label={CARD_HEADING[card]} className={SENTENCE_BAR.card}>
        <div className={SENTENCE_BAR.head}>
          <h2 className={TEXT.subheading}>{CARD_HEADING[card]}</h2>
          <button ref={closeRef} onClick={onCardClose} aria-label="Close" className={HEADER_BUTTON}>
            <IconClose />
          </button>
        </div>
        {card === 'destinations' && search && <div className={SENTENCE_BAR.search}>{search}</div>}
        <div className={SENTENCE_BAR.body}>{panel}</div>
      </section>
    )
  }

  return (
    // The bottom sheet every phone menu is, kept mounted (record 0207):
    // modal over the dim while open, with Done, Escape and a press on the
    // dim closing it, and inert while shut, because off screen is not out of
    // the Tab order (#576). Its grip and title drag it (record 0146) between the
    // heights App holds.
    <BottomSheet
      heading="Controls"
      onClose={onClose}
      kept={{
        open,
        tourRuns,
        held: sheetHeld,
        restPx: sheetRestPx,
        onHeld: onSheetHeld,
        actions: <ThemeMenu choice={themeChoice} onChoice={onThemeChoice} sheet />,
      }}
    >
      {search && <div className={SENTENCE_BAR.phoneSearch}>{search}</div>}
      <div className={CONTROLS_SHEET.panelBody}>{panel}</div>
    </BottomSheet>
  )
}
