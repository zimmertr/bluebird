import { useRef, type ReactNode, type RefObject } from 'react'
import BottomSheet from './BottomSheet'
import type { SheetHeight } from '../utils/sheetDrag'
import ControlPanel from './ControlPanel'
import type { MapViewHandle } from './MapView'
import { IconClose } from './icons'
import ThemeMenu from './ThemeMenu'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useHeldFailure } from '../hooks/useOpenOnFailure'
import type { LiveCapabilities } from '../hooks/useCapabilities'
import type { DestinationInputs } from '../hooks/useDestinationInputs'
import type { DrawMode } from '../hooks/useDrawMode'
import type { ForecastSelectionState } from '../hooks/useForecastSelection'
import type { PanelMessages } from '../hooks/usePanelMessages'
import type { RankingKnobs } from '../hooks/useRankingKnobs'
import type { ChartMetricsState } from '../hooks/useChartMetrics'
import type { ActionWord } from '../utils/analyzeGate'
import { DESK_CARD, HEADER_BUTTON, MAP_ROWS, PANEL_HEADER } from '../styles'
import type { PanelSectionId } from '../utils/controlsSummary'
import type { ThemeChoice } from '../utils/viewPrefs'

interface AppDrawerProps {
  /** Whether the panel is open: the card over a desk's map, the Controls sheet on a phone. */
  open: boolean
  /** A desk, where the panel is a card over the map's top left; a phone raises it as a sheet. */
  isDesktop: boolean
  /** A desk's search field, which the card holds and a shut card is (`MapRows`). */
  search?: ReactNode
  /** The section a desk's card shows open, or null while every one is collapsed (`useCardSections`). */
  section?: PanelSectionId | null
  /** Opens a section of a desk's card, or collapses the open one. */
  onSection?: (id: PanelSectionId) => void
  /** Where a drag left the Controls sheet on a phone, or null for its own share (`sheetRestPx`). */
  sheetHeld: SheetHeight | null
  /** Its own share, which a release near it or a double press on the grip gives back (record 0146). */
  sheetRestPx: number
  /** Holds it at a dragged height, or null for its own share. */
  onSheetHeld: (held: SheetHeight | null) => void
  /** Closes it: its close button at a desk, and on a phone Done, Escape or a press on the dim. */
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
    | 'places'
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
  /** Analyze, and the one run a link may ask for on open. */
  onAnalyze: () => void
  autoAnalyze: boolean
  capabilitiesSettled: boolean
  onAutoAnalyze: (step: 'run' | 'drop') => void
  /** What the Analyze button reads (#736). */
  actionWord: ActionWord
  /** Open the guided tutorial from the panel footer (#536). */
  onTutorial: () => void
  /** The tour cannot start now (a draw or a run is under way), so the footer's link is inert. */
  tutorialWaits?: boolean
  /** The theme choice, and the setter the header's theme menu calls (`useTheme`, #843). */
  themeChoice: ThemeChoice
  onThemeChoice: (choice: ThemeChoice) => void
}

/**
 * The controls panel around `ControlPanel` (#409 cut it out of `App.tsx`):
 * a card over the map's top left at a desk (#825; record 0305), which
 * `MapRows` stands in the map's own stack, and on a phone the Controls sheet (#696;
 * record 0141), which the summary chip raises from the map's foot as a modal
 * sheet over the dimmed map, the way Layers and Legend rise (record 0207).
 * Closing on a committed report is App's, because the report is App's, and
 * so are the panel's messages (`usePanelMessages`), which the phone's map
 * reads too: this only draws the panel it is told is open.
 */
export default function AppDrawer({
  open,
  isDesktop,
  search,
  section = null,
  onSection,
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
  onAnalyze,
  autoAnalyze,
  capabilitiesSettled,
  onAutoAnalyze,
  actionWord,
  onTutorial,
  tutorialWaits,
  themeChoice,
  onThemeChoice,
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
    places,
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
  // Opened from the map's summary chip, which unmounts as a desk's card
  // opens, the keyboard lands on the card's own way back out (#576). A
  // phone's sheet takes the keyboard itself, as a menu sheet does.
  const closeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(closeRef, open)
  // A failure that lands while a desk's card is shut reopens it (App's), and
  // its list opens once the card stands, against a button on the screen
  // (#803). A phone's panel footer has no list, so nothing waits there.
  const panelMessages = useHeldFailure(messages, isDesktop && !open)
  const panel = (
    <ControlPanel
      phone={!isDesktop}
      drawing={drawing}
      onStartDrawing={startDrawing}
      onFinishDrawing={finishDrawing}
      drawPointCount={drawPointCount}
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
      messages={panelMessages}
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
      onAnalyze={onAnalyze}
      autoAnalyze={autoAnalyze}
      capabilitiesSettled={capabilitiesSettled}
      onAutoAnalyze={onAutoAnalyze}
      actionWord={actionWord}
      onTutorial={onTutorial}
      tutorialWaits={tutorialWaits}
      charted={chartMetrics.metrics}
      onChart={chartMetrics.chart}
      pickedCount={places.length}
      card={isDesktop && onSection ? { open, search, section, onSection } : undefined}
    />
  )

  if (!isDesktop) {
    return (
      // The bottom sheet every phone menu is, kept mounted (record 0207):
      // modal over the dim while open, with Done, Escape and a press on the
      // dim closing it, and inert while shut for the reason the desk's panel
      // is (#576). Its grip and title drag it (record 0146) between the
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
        {panel}
      </BottomSheet>
    )
  }
  return (
    // The desk's card (record 0305), in the map's stack. Shut, it is the
    // search pill's row and nothing else: the panel inside hides its header,
    // its sections and its footer, which stay mounted so their state, and a
    // link's run on open, outlive a close. Hidden parts take no Tab stop
    // (#576) and are read by no screen reader.
    // A popup keeps clear of it as it does of the map's rows, which it is
    // one of (`data-map-overlay`).
    <aside data-map-overlay="" className={open ? DESK_CARD.card : MAP_ROWS.row}>
      {/* The header's buttons: the theme menu, then the close button, which
          shuts the card. */}
      <div inert={!open} className={open ? PANEL_HEADER.actions : 'hidden'}>
        <ThemeMenu choice={themeChoice} onChoice={onThemeChoice} />
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close controls"
          // Flex centres the drawn cross in the square; why the cross is
          // drawn rather than typed is `IconClose`'s own comment.
          className={HEADER_BUTTON}
        >
          <IconClose />
        </button>
      </div>
      {panel}
    </aside>
  )
}
