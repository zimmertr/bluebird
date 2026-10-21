import { useCallback, useId, useRef, useState, type ComponentProps, type RefObject } from 'react'
import MapView, { type MapViewHandle } from './MapView'
import type { SearchBoxHandle } from './SearchBox'
import TimelineTransport from './TimelineTransport'
import AnalysisOverlay from './AnalysisOverlay'
import LayersPopover from './LayersPopover'
import MapLegend, { legendSections, type LegendInputs } from './MapLegend'
import MapDrawBar from './MapDrawBar'
import MapRows from './MapRows'
import MapCorner from './MapCorner'
import PhoneFoot from './PhoneFoot'
import type { Analysis } from '../hooks/useAnalyze'
import type { DestinationInputs } from '../hooks/useDestinationInputs'
import type { DrawMode } from '../hooks/useDrawMode'
import type { FireProximity } from '../hooks/useFireProximity'
import type { ClosureProximity } from '../hooks/useClosureProximity'
import type { GridLayer } from '../hooks/useGridLayer'
import type { MapOverlays } from '../hooks/useMapOverlays'
import type { PresentedReport } from '../hooks/usePresentedReport'
import type { Removals } from '../hooks/useRemovals'
import type { ResultsLayout } from '../hooks/useResultsLayout'
import type { TableView } from '../hooks/useTableView'
import type { Timeline } from '../hooks/useTimeline'
import type { SortBy } from '../types'
import { LAYOUT_HOLD, MAP_EDGE } from '../styles'
import type { LayoutMotion } from '../hooks/useLayoutMotion'
import { NOUN, familyOf } from '../metrics'
import { hourlyScale, rankedScale } from '../utils/colors'
import {
  NO_LINE,
  TRANSPORT_GAP_PX,
  fabBottomPx,
  noticeBottomPx,
  phoneFootLiftPx,
  transportFits,
  transportStandPx,
  type PhoneLine,
} from '../utils/resultsSheet'
import type { Place } from '../utils/geocode'
import { fieldHasValue } from '../utils/present'
import type { CameraView } from '../utils/mapView'
import type { UrlSync } from '../hooks/useUrlSync'
import type { LayerCoverage } from '../utils/layerCoverage'
import type { CornerSlots } from '../map/controls'
import type { ActionWord } from '../utils/analyzeGate'

export interface MapStageProps {
  /** The map's handle; draw mode, the drawer and the table's focus callbacks drive it too. */
  mapRef: RefObject<MapViewHandle | null>
  /**
   * Whether a ring is being drawn, the callback the map reports each vertex
   * to, and the count, Done and Cancel the phone's draw bar carries.
   */
  drawMode: Pick<
    DrawMode,
    'drawing' | 'handleDrawUpdate' | 'drawPointCount' | 'finishDrawing' | 'handleCancelDrawing'
  >
  /** A desk keeps Done and Cancel in the docked panel; a phone gets them on the map. */
  isDesktop: boolean
  /** The ring, the link's restored points and the searched places, with the setters the map calls. */
  destinationInputs: Pick<DestinationInputs, 'polygon' | 'setPolygon' | 'restoredPoints' | 'places' | 'removePlace'>
  /** Registers a place picked in the search field or clicked on the map, and removes a ranked row from its card. */
  removals: Pick<Removals, 'registerPlace' | 'removeResult'>
  /** Which overlays are on, and their setters for the Layers popover. */
  overlays: Omit<MapOverlays, 'showPlayer'>
  /** The server's outlines for the snapshot layers, which the Layers popover greys its rows on. */
  coverage: LayerCoverage
  /** The forecast grid's cells and style, its legend state and its Layers row. */
  grid: Pick<GridLayer, 'grid' | 'gridStyle'> &
    LegendInputs['grid'] &
    ComponentProps<typeof LayersPopover>['grid']
  /** The playhead, the axes it can run on, and the radar frame. */
  timeline: Pick<
    Timeline,
    | 'forecastTimes'
    | 'timelineAxes'
    | 'timelineAxis'
    | 'setChosenAxis'
    | 'playerOffered'
    | 'radarIndex'
    | 'frameIndex'
    | 'frameCount'
    | 'setFrameIndex'
    | 'playing'
    | 'setPlaying'
    | 'playbackIndex'
    | 'timelineReadout'
    | 'timelineScale'
  >
  /** The displayed rows and the named destinations not yet forecast. */
  report: Pick<PresentedReport, 'results' | 'pending'>
  /** The columns a marker's popup lists, and the model label it falls back to. */
  tableView: Pick<TableView, 'tableColumns' | 'analysisModelLabel'>
  /** Which destinations stand near an active wildfire. */
  fire: Pick<FireProximity, 'warnings'>
  /** Which destinations stand inside an active Forest Service area closure. */
  closure: Pick<ClosureProximity, 'warnings'>
  /**
   * How far the phone sheet lifts the map's bottom chrome, the camera's bottom
   * padding, and the padding for the sheet a search is about to open.
   */
  layout: Pick<ResultsLayout, 'mapCornerLift' | 'sheetLiftPx' | 'cameraPadBottomPx' | 'sheetPadBottomPx' | 'mapPx'>
  /** The run in flight, which the loading card reports and can cancel. */
  analysis: Pick<Analysis, 'loading' | 'statusMessage' | 'progress' | 'paceRemainingS' | 'cancel'>
  /** The metric the markers are coloured on. */
  sortBy: SortBy
  /** Whether the window is one hour, which a popup's colours read as the table's do. */
  pointSample: boolean
  /** The model the markers' popups name. */
  modelId: string | null
  /** Whether the results are shown, which is when the markers wear the ranking's colours. */
  showResults: boolean
  /** Whether the controls panel is open. */
  sidebarOpen: boolean
  /** Which edge of a desk's layout is moving, which the map's box holds still for (record 0202). */
  layoutMotion?: LayoutMotion
  /** A phone's Controls sheet's height, wherever a drag left it (record 0146). */
  controlsPx: number
  /** Whether a desk's legend card opens unfolded (`viewPrefs.legendOpen`). */
  legendInitiallyOpen: boolean
  /** Reopens the controls panel. */
  onOpenControls: () => void
  /** Lowers a phone's Controls sheet from the chip that raised it. */
  onCloseControls: () => void
  /** The summary chip's words: the When arm and the model (`controlsSummary`). */
  controlsSummary: string
  /**
   * Receives the band a phone's map holds the panel's notice block in while
   * the drawer is shut (record 0140), which `PanelFooter` portals into. A
   * state setter, so stable.
   */
  onNoticeBand: (band: HTMLDivElement | null) => void
  /** The panel's Analyze gate (`analyzeGateFor`), which the phone's Analyze button shares. */
  analyzeEnabled: boolean
  /** What the panel's Analyze reads (#736, `actionWord`), which the phone's button reads too. */
  actionWord: ActionWord
  /** The panel's Analyze command, which the phone's Analyze button calls. */
  onAnalyze: () => void
  /** The tutorial holds the Layers menu open for its step (#536). */
  layersForcedOpen: boolean
  /** The panel's Map group is hovered, so the search field wears a ring. */
  searchPointed: boolean
  /** The same hover, so every clickable feature on the map glows. */
  poisPointed: boolean
  /** The share link's camera callback, which writes without rendering. */
  urlSync: Pick<UrlSync, 'reportView'>
  /** The camera a link opened on, which wins over the opening fit. */
  restoredView: CameraView | null
  /** Reports whether the basemap style is failing to load; a state setter. */
  onBasemapFailed: (failed: boolean) => void
  /** The most positions a drawn ring may carry, from /api/capabilities. */
  maxPolygonPoints: number
}

/**
 * The map column above the results: the map, the loading card, the two rows
 * across its top with Layers and the legend in them, and the forecast player. MapView is memoized, so every
 * prop it gets here is a member of an input, never a value built in this
 * render (`map-stage-memo-props`).
 */
export default function MapStage({
  mapRef,
  drawMode,
  isDesktop,
  destinationInputs,
  removals,
  overlays,
  coverage,
  grid,
  timeline,
  report,
  tableView,
  fire,
  closure,
  layout,
  analysis,
  sortBy,
  pointSample,
  modelId,
  showResults,
  sidebarOpen,
  layoutMotion = null,
  controlsPx,
  legendInitiallyOpen,
  onOpenControls,
  onCloseControls,
  controlsSummary,
  onNoticeBand,
  analyzeEnabled,
  actionWord,
  onAnalyze,
  layersForcedOpen,
  searchPointed,
  poisPointed,
  urlSync,
  restoredView,
  onBasemapFailed,
  maxPolygonPoints,
}: MapStageProps) {
  const searchBoxRef = useRef<SearchBoxHandle>(null)
  // The round slot at the right of a phone's search pill, which the map
  // stands its own locate button in (#696). State rather than a ref, so the
  // map hears the slot arrive and go; at a desk there is none, and the button
  // stands in the map's corner (`cornerSlots`).
  const [locateSlot, setLocateSlot] = useState<HTMLDivElement | null>(null)
  // The compass's, under it at a phone's chip row's end (record 0147).
  const [compassSlot, setCompassSlot] = useState<HTMLDivElement | null>(null)
  // The map's corner (`MapCorner`, record 0174): at a desk the compass, the
  // locate button, the zoom pair, the credit line and the scale; on a phone
  // the credit line and the scale.
  const [cornerSlots, setCornerSlots] = useState<CornerSlots | null>(null)
  // A phone's credit line, which the notice band and, while its credits are
  // open, the Analyze button stand over (`MapCorner` measures it).
  const [line, setLine] = useState<PhoneLine>(NO_LINE)
  // The height of the phone's notice band, which the Analyze button rises
  // above (`PhoneFoot` measures it), 0 while it holds nothing.
  const [bandPx, setBandPx] = useState(0)
  const smokeId = useId()
  const { registerPlace, removeResult } = removals
  const { removePlace } = destinationInputs
  const { results } = report
  const { playbackIndex, timelineAxis } = timeline

  // A searched place is framed for the sheet it is about to open, not the
  // one on screen (#696): naming a destination opens the results in the next
  // render, after the camera has started to move, and framed for the map
  // without a sheet the place landed under the sheet's top edge.
  function handleSearchSelect(place: Place) {
    mapRef.current?.flyToPlace(place, layout.sheetPadBottomPx)
    registerPlace(place)
  }

  // A clicked basemap feature registers without a camera move: you are already
  // looking straight at it, and flying to it would answer a question nobody
  // asked.
  const handleAddPoi = useCallback(
    (place: Place) => {
      registerPlace(place)
    },
    [registerPlace],
  )
  const handleRemovePoi = useCallback(
    (latitude: number, longitude: number) => removePlace(latitude, longitude),
    [removePlace],
  )

  // The bands the markers are actually colored on, which playback moves.
  // Precipitation is the reason it has to: the ranking bins a window total and
  // one hour of it is a rate, so a legend still reading in inches beside
  // markers scored in inches per hour would be quietly wrong. The metric's NAME
  // does not change, so the legend's title does not either.
  // Every metric has bands now, so this is null only if a ranking key ever
  // arrives without a scale. The key below has its own reason to stay away
  // (`fieldHasValue`): a box of bands over a field of N/A explains
  // nothing.
  const markerScale = playbackIndex !== null ? hourlyScale(sortBy) : rankedScale(sortBy)

  const hasColoredMarkers = showResults && results.length > 0
  // Whether the ranked metric has anything to colour AT ALL on the rows shown.
  // False for a freezing-level ranking under one of the five models that
  // publish no freezing level: every marker is then the neutral no-value fill,
  // every cell reads N/A, and a key of six height bands beside them would be
  // the only thing on screen claiming the field was measured.
  const rankedFieldHasValue = fieldHasValue(results, sortBy)
  // What the legend keys: a desk's card on the map, a phone's Legend sheet.
  const legendInputs: LegendInputs = { sortBy, markerScale, hasColoredMarkers, rankedFieldHasValue, overlays, grid }
  const legend = legendSections(legendInputs, smokeId)

  // The phone's draw bar stands under the chip row while a ring is drawn
  // (#687, #696), and the player steps out meanwhile: playback is no use
  // while points are being placed.
  const drawBarShown = drawMode.drawing && !isDesktop
  // A phone's Analyze button rides the sheet and rises over the notice band
  // (record 0135), and the player stands on the button rather than on the
  // sheet, stepping off while a sheet dragged high leaves it no room. The
  // sheet is whichever stands higher, the results or the Controls sheet
  // (record 0141), so the one Analyze is on the edge of the sheet in view.
  // The credit line stands on that edge too (record 0174): the band stands
  // over it, and so does the button while its credits are open.
  const footLift = isDesktop ? layout.sheetLiftPx : phoneFootLiftPx(layout.sheetLiftPx, sidebarOpen ? controlsPx : null)
  const phoneLine = isDesktop ? NO_LINE : line
  const fabBottom = fabBottomPx(footLift, bandPx, layout.mapPx, phoneLine)
  const timelineShown = timelineAxis !== null && !drawBarShown && (isDesktop || transportFits(fabBottom, layout.mapPx))

  // Legend and Layers are chips in the row under the search pill at both
  // widths, each with its menu a card joined to the chip at a desk (#714) and
  // a bottom sheet on a phone (#696).
  const layers = (
    <LayersPopover
      overlays={overlays}
      grid={grid}
      playerOffered={timeline.playerOffered}
      mapRef={mapRef}
      coverage={coverage}
      forcedOpen={layersForcedOpen}
      sheet={!isDesktop}
    />
  )
  const legendChip = (
    <MapLegend
      sections={legend}
      sheet={!isDesktop}
      sheetLiftPx={layout.sheetLiftPx}
      timelineShown={timelineShown}
      initiallyOpen={legendInitiallyOpen}
    />
  )

  // While the panel moves the box is the window's width, and while a pane
  // moves the window's height, centred on the column either way, so the map
  // is resized where the move starts or ends rather than in every frame.
  const mapBox =
    layoutMotion === 'opening' || layoutMotion === 'closing'
      ? LAYOUT_HOLD.mapPush
      : layoutMotion === 'panes'
        ? LAYOUT_HOLD.mapPanes
        : LAYOUT_HOLD.rest

  return (
    // `--map-corner-lift` and `--map-corner-band` are read by the map's
    // corner (`MAP_CORNER`) and map.css: how far the credit line and the
    // scale rise off the container's bottom edge, and the height of the band
    // the library's own corners centre a control in while no corner holds
    // it. Both have a reason to rise: the attribution is a licence term that
    // cannot be covered by the phone sheet, and the scale bar reads against
    // the map rather than against the sheet. One number for the corner
    // rather than an offset per control, derived beside every other anchor
    // in `resultsSheet.ts`. The map area keeps the whole column, so the
    // canvas runs on behind the sheet and its ResizeObserver sees no change
    // on a drag.
    <div
      // On a phone the library's stack, the compass alone there, starts under
      // the app's two rows, and under the draw bar while a ring is drawn.
      className={`flex-1 relative ${MAP_EDGE.publish} ${
        isDesktop ? '' : drawBarShown ? MAP_EDGE.belowDrawBar : MAP_EDGE.belowRows
      } ${layoutMotion ? LAYOUT_HOLD.clip : ''}`}
      style={
        {
          // A desk's line stands on the results' edge, a phone's on the
          // edge of whichever sheet stands higher (record 0174).
          '--map-corner-lift': `${isDesktop ? layout.mapCornerLift : footLift}px`,
          '--map-corner-band': `${TRANSPORT_GAP_PX}px`,
        } as React.CSSProperties
      }
    >
      <AnalysisOverlay
        loading={analysis.loading}
        statusMessage={analysis.statusMessage}
        progress={analysis.progress}
        paceRemainingS={analysis.paceRemainingS}
        onCancel={analysis.cancel}
      />
      {/* The map's box, which holds one size while the layout moves
          (`layoutMotion`, record 0202) and fills the column otherwise. */}
      <div className={mapBox}>
        <MapView
          ref={mapRef}
          drawing={drawMode.drawing}
          pointedPois={poisPointed}
          polygon={destinationInputs.polygon}
          restoredPoints={destinationInputs.restoredPoints}
          onPolygonChange={destinationInputs.setPolygon}
          onDrawUpdate={drawMode.handleDrawUpdate}
          results={results}
          sortBy={sortBy}
          modelId={modelId}
          times={timeline.forecastTimes}
          popupColumns={tableView.tableColumns}
          pointSample={pointSample}
          modelFallbackLabel={tableView.analysisModelLabel}
          fireWarnings={fire.warnings}
          closureWarnings={closure.warnings}
          showWildfires={overlays.showWildfires}
          showAreaClosures={overlays.showAreaClosures}
          showTrailClosures={overlays.showTrailClosures}
          showRadar={overlays.showRadar}
          showSmoke={overlays.showSmoke}
          showSnow={overlays.showSnow}
          radarIndex={timeline.radarIndex}
          gridSpec={grid.grid.spec}
          gridCells={grid.grid.cells}
          gridStyle={grid.gridStyle}
          playbackIndex={playbackIndex}
          pending={report.pending}
          searchedPlaces={destinationInputs.places}
          onAddPoi={handleAddPoi}
          onRemovePoi={handleRemovePoi}
          onRemoveResult={removeResult}
          cameraPadBottomPx={layout.cameraPadBottomPx}
          restoredView={restoredView}
          onCameraMove={urlSync.reportView}
          onBasemapFailed={onBasemapFailed}
          maxPolygonPoints={maxPolygonPoints}
          locateSlot={locateSlot}
          compassSlot={compassSlot}
          cornerSlots={cornerSlots}
        />
      </div>
      <MapRows
        searchBoxRef={searchBoxRef}
        onSearchSelect={handleSearchSelect}
        searchPointed={searchPointed}
        onLocateSlot={setLocateSlot}
        onCompassSlot={setCompassSlot}
        desk={isDesktop}
        sidebarOpen={sidebarOpen}
        onOpenControls={onOpenControls}
        onCloseControls={onCloseControls}
        controlsSummary={controlsSummary}
        layers={layers}
        legend={legendChip}
      />
      {/* A desk's map buttons, credit line and scale, in the map's
          bottom-right corner, or a phone's credit line and scale in its
          bottom-left corner (record 0174). Keyed by width, so a width change
          builds the other corner and hands the map its slots afresh. */}
      <MapCorner key={isDesktop ? 'desk' : 'phone'} phone={!isDesktop} onSlots={setCornerSlots} onLine={setLine} />
      {/* The foot of a phone's map: the band the panel's notice block
          stands in while the drawer is shut (record 0140), which
          `PanelFooter` portals the one block it renders into, and the
          Analyze button (record 0135). */}
      {!isDesktop && (
        <PhoneFoot
          bandBottomPx={noticeBottomPx(footLift, phoneLine.px)}
          fabBottomPx={fabBottom}
          onNoticeBand={onNoticeBand}
          onBandPx={setBandPx}
          analyzeEnabled={analyzeEnabled}
          word={actionWord}
          onAnalyze={onAnalyze}
        />
      )}
      {/* The timeline, present exactly while something spans time: radar
          contributes a past axis, a multi-hour report a forecast one, and
          a smoke analysis contributes neither (two passes a day is not an
          animation). */}
      {drawBarShown && (
        <MapDrawBar
          drawPointCount={drawMode.drawPointCount}
          onDone={drawMode.finishDrawing}
          onCancel={drawMode.handleCancelDrawing}
        />
      )}
      {timelineShown && timelineAxis !== null && (
        <TimelineTransport
          axis={timelineAxis}
          axes={timeline.timelineAxes}
          onAxisChange={timeline.setChosenAxis}
          index={timeline.frameIndex}
          frameCount={timeline.frameCount}
          onIndexChange={timeline.setFrameIndex}
          playing={timeline.playing}
          onPlayingChange={timeline.setPlaying}
          readout={timeline.timelineReadout}
          scale={timeline.timelineScale}
          forecastLabel={NOUN[familyOf(sortBy)]}
          liftPx={isDesktop ? layout.sheetLiftPx : transportStandPx(fabBottom)}
        />
      )}
    </div>
  )
}
