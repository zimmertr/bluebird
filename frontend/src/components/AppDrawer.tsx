import { useRef, type RefObject } from 'react'
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
import { DESK_PANEL, HEADER_BUTTON, LAYOUT_HOLD, PANEL_HEADER } from '../styles'
import type { ThemeChoice } from '../utils/viewPrefs'
import type { Place } from '../utils/geocode'

interface AppDrawerProps {
  /** Whether the panel is open: docked on a desktop, the Controls sheet on a phone. */
  open: boolean
  /** A desk, where the panel docks beside the map; a phone raises it as a sheet. */
  isDesktop: boolean
  /** A desk's panel is opening or closing (`useLayoutMotion`), on a layer of its own meanwhile. */
  moving?: boolean
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
    'drawing' | 'drawPointCount' | 'startArea' | 'editArea' | 'removeArea' | 'finishDrawing' | 'handleCancelDrawing'
  >
  /** The discovery inputs: the areas, the lists, the places, the kinds and the coordinates box (`useDestinationInputs`). */
  destinationInputs: Pick<
    DestinationInputs,
    | 'areas'
    | 'areaKm2s'
    | 'draftAreaKm2'
    | 'presetLists'
    | 'places'
    | 'removePlace'
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
  /** The Destinations section is hovered: the map's clickable features wear a cue. */
  onPointAtMapPois: (on: boolean) => void
  /** How many areas a run would search (`AnalyzeGateInputs.areaCount`). */
  areaCount: number
  /** A place picked in the panel's search, which stands there at a desk alone (record 0306). */
  onSearchSelect: (place: Place) => void
  /** A place's chip: the camera goes to it. */
  onFramePlace: (place: Place) => void
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
 * docked beside the map at a desk, and on a phone the Controls sheet (#696;
 * record 0141), which the summary chip raises from the map's foot as a modal
 * sheet over the dimmed map, the way Layers and Legend rise (record 0207).
 * Closing on a committed report is App's, because the report is App's, and
 * so are the panel's messages (`usePanelMessages`), which the phone's map
 * reads too: this only draws the panel it is told is open.
 */
export default function AppDrawer({
  open,
  isDesktop,
  moving = false,
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
  onPointAtMapPois,
  areaCount,
  onSearchSelect,
  onFramePlace,
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
  // Opened from the map's summary chip, which unmounts as a desk's panel
  // opens, the keyboard lands on the panel's own way back out (#576). A
  // phone's sheet takes the keyboard itself, as a menu sheet does.
  const closeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(closeRef, open)
  // A failure that lands while a desk's panel is shut reopens it (App's), and
  // its list opens once the panel stands still, against a button on the
  // screen (#803). A phone's panel footer has no list, so nothing waits there.
  const panelMessages = useHeldFailure(messages, isDesktop && (!open || moving))
  const panel = (
    <ControlPanel
      phone={!isDesktop}
      destinations={{
        areas: destinationInputs.areas,
        areaKm2s: destinationInputs.areaKm2s,
        drawing: drawMode.drawing,
        drawPointCount: drawMode.drawPointCount,
        onStartArea: drawMode.startArea,
        onEditArea: drawMode.editArea,
        onRemoveArea: drawMode.removeArea,
        onFinishDrawing: drawMode.finishDrawing,
        onCancelDrawing: drawMode.handleCancelDrawing,
        areaCount,
        draftAreaKm2: destinationInputs.draftAreaKm2,
        onPointAtMapPois,
        destinationTypes: destinationInputs.destinationTypes,
        setDestinationTypes: destinationInputs.setDestinationTypes,
        includeUnnamedPeaks: destinationInputs.includeUnnamedPeaks,
        setIncludeUnnamedPeaks: destinationInputs.setIncludeUnnamedPeaks,
        presetLists: destinationInputs.presetLists,
        customCsv: destinationInputs.customCsv,
        setCustomCsv: destinationInputs.setCustomCsv,
        onCsvPasted: (points) => mapRef.current?.fitToPoints(points),
        places: destinationInputs.places,
        onRemovePlace: destinationInputs.removePlace,
        onFramePlace,
        // A phone's search is the map's pill, so its panel holds none.
        ...(isDesktop ? { onSearchSelect } : {}),
      }}
      selection={selection}
      setSelection={changeSelection}
      limit={limit}
      setLimit={setLimit}
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
    <>
      {/* The desk's panel, a column beside the map that stays in the row
          while it is shut (record 0202): its margin takes its width back, so
          the map's edge travels with the panel's both ways. A phone draws the
          Controls sheet above instead.

          Inert while closed: off screen is not out of the Tab order, and the
          closed drawer kept some 45 stops a keyboard walked through blind
          before reaching the map (#576). On a layer of its own while it
          moves, so a frame of the move paints none of it (record 0216). */}
      <aside
        inert={!open}
        className={`${DESK_PANEL.card} ${open ? '' : DESK_PANEL.shut} ${moving ? LAYOUT_HOLD.layer : ''}`}
      >
        {/* The header's buttons: the theme menu, then the close button,
            which collapses the panel. */}
        <div className={PANEL_HEADER.actions}>
          <ThemeMenu choice={themeChoice} onChoice={onThemeChoice} />
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close controls"
            // Flex centres the drawn cross in the circle; why the cross is
            // drawn rather than typed is `IconClose`'s own comment.
            className={HEADER_BUTTON}
          >
            <IconClose />
          </button>
        </div>
        {panel}
      </aside>
    </>
  )
}
