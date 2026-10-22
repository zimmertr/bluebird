import { useRef, type RefObject } from 'react'
import BottomSheet from './BottomSheet'
import ControlPanel from './ControlPanel'
import type { MapViewHandle } from './MapView'
import { IconClose } from './icons'
import ThemeButton from './ThemeButton'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import type { LiveCapabilities } from '../hooks/useCapabilities'
import type { DestinationInputs } from '../hooks/useDestinationInputs'
import type { DrawMode } from '../hooks/useDrawMode'
import type { ForecastSelectionState } from '../hooks/useForecastSelection'
import type { PanelMessages } from '../hooks/usePanelMessages'
import type { RankingKnobs } from '../hooks/useRankingKnobs'
import type { ActionWord } from '../utils/analyzeGate'
import { DESK_PANEL, HEADER_BUTTON, PANEL_HEADER } from '../styles'
import type { Theme } from '../utils/viewPrefs'

interface AppDrawerProps {
  /** Whether the panel is open: docked on a desktop, the Controls sheet on a phone. */
  open: boolean
  /** A desk, where the panel docks beside the map; a phone raises it as a sheet. */
  isDesktop: boolean
  /** The Controls sheet's height on a phone: its own share (`controlsSheetPx`), or where a drag left it. */
  sheetPx: number
  /** Its own share, which a release near it or a double press on the grip gives back (record 0146). */
  sheetRestPx: number
  /** The most a drag raises it (`controlsFullPx`). */
  sheetFullPx: number
  /** Holds it at a dragged height, or null for its own share. */
  onSheetPx: (px: number | null) => void
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
  /** The deployment's published limits and models (`useCapabilities`). */
  caps: LiveCapabilities
  /** The map, which a pasted list of coordinates fits to. */
  mapRef: RefObject<MapViewHandle | null>
  /** The panel's Map group is hovered: the search box and the map's features wear a cue. */
  onPointAtSearch: (on: boolean) => void
  onPointAtMapPois: (on: boolean) => void
  /** Every message the panel has to say, with the Analyze gate and the blockers by field (`usePanelMessages`). */
  messages: PanelMessages
  /** Analyze, and the one run a link may ask for on open. */
  onAnalyze: () => void
  autoAnalyze: boolean
  capabilitiesSettled: boolean
  onAutoAnalyze: () => void
  /** What the Analyze button reads (#736). */
  actionWord: ActionWord
  /** Open the guided tutorial from the panel footer (#536). */
  onTutorial: () => void
  /** The tour cannot start now (a draw or a run is under way), so the footer's link is inert. */
  tutorialWaits?: boolean
  /** The theme, and the switch the header carries (`useTheme`, #706). */
  theme: Theme
  onToggleTheme: () => void
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
  sheetPx,
  sheetRestPx,
  sheetFullPx,
  onSheetPx,
  onClose,
  tourRuns = false,
  drawMode,
  destinationInputs,
  forecastSelection,
  rankingKnobs,
  caps,
  mapRef,
  onPointAtSearch,
  onPointAtMapPois,
  messages,
  onAnalyze,
  autoAnalyze,
  capabilitiesSettled,
  onAutoAnalyze,
  actionWord,
  onTutorial,
  tutorialWaits,
  theme,
  onToggleTheme,
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
  // Opened from the map's summary chip, which unmounts as a desk's panel
  // opens, the keyboard lands on the panel's own way back out (#576). A
  // phone's sheet takes the keyboard itself, as a menu sheet does.
  const closeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(closeRef, open)
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
      onAnalyze={onAnalyze}
      autoAnalyze={autoAnalyze}
      capabilitiesSettled={capabilitiesSettled}
      onAutoAnalyze={onAutoAnalyze}
      actionWord={actionWord}
      onTutorial={onTutorial}
      tutorialWaits={tutorialWaits}
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
          heightPx: sheetPx,
          restPx: sheetRestPx,
          fullPx: sheetFullPx,
          onHeightPx: onSheetPx,
          actions: <ThemeButton theme={theme} onToggle={onToggleTheme} />,
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
          before reaching the map (#576). */}
      <aside inert={!open} className={`${DESK_PANEL.card} ${open ? '' : DESK_PANEL.shut}`}>
        {/* The header's buttons: the theme switch, then the close button,
            which collapses the panel. */}
        <div className={PANEL_HEADER.actions}>
          <ThemeButton theme={theme} onToggle={onToggleTheme} />
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
