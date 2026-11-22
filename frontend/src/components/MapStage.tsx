import { useCallback, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useHoverLink } from '../hooks/useHoverLink'
import type { Theme } from '../utils/viewPrefs'
import MapView, { type MapViewHandle } from './MapView'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import { useSlashToSearch } from '../hooks/useSlashToSearch'
import TimelineTransport from './TimelineTransport'
import type { DeckPoint } from '../utils/cloudSea'
import type { BandLimits, ForecastSelection } from '../utils/calendar/calendar'
import DayStrip, { type StripZoom } from './DayStrip'
import { daySky } from '../utils/score/daySky'
import type { TimelineAxis } from '../utils/timeline'
import type { ScoreColouring } from '../utils/resultFeatures'
import AnalysisOverlay from './AnalysisOverlay'
import LayersPopover from './LayersPopover'
import MapLegend, { LegendSections, legendSections, type LegendInputs } from './MapLegend'
import MapDrawBar from './MapDrawBar'
import MapRows from './MapRows'
import MapCorner from './MapCorner'
import PhoneFoot from './PhoneFoot'
import type { Analysis } from '../hooks/useAnalyze'
import type { DestinationInputs } from '../hooks/useDestinationInputs'
import type { DrawMode } from '../hooks/useDrawMode'
import type { GridLayer } from '../hooks/useGridLayer'
import type { MapOverlays } from '../hooks/useMapOverlays'
import type { PresentedReport } from '../hooks/usePresentedReport'
import type { Removals } from '../hooks/useRemovals'
import type { ResultsLayout } from '../hooks/useResultsLayout'
import type { TableView } from '../hooks/useTableView'
import type { Timeline } from '../hooks/useTimeline'
import type { SortBy } from '../types'
import { LAYOUT_HOLD, MAP_EDGE, MAP_TOOL } from '../styles'
import { IconLoop } from './icons'
import type { LayoutMotion } from '../hooks/useLayoutMotion'
import { NOUN, familyOf } from '../metrics'
import { hourlyScale, rankedScale, scoreScale } from '../utils/colors'
import {
  TRANSPORT_GAP_PX,
  fabBottomPx,
  phoneCornerLiftPx,
  transportFits,
  transportStandPx,
} from '../utils/results/resultsSheet'
import type { PanelMessages } from '../hooks/usePanelMessages'
import type { Place } from '../utils/geocode'
import { fieldHasValue } from '../utils/present'
import type { CameraView } from '../utils/mapView'
import type { UrlSync } from '../hooks/useUrlSync'
import type { LayerCoverage } from '../utils/layerCoverage'
import type { CornerSlots } from '../map/controls'
import type { ActionWord } from '../utils/analyzeGate'

export interface MapStageProps {
  /** The theme the app paints in, which the map's ground follows (record 0317). */
  theme: Theme
  /** The map's handle; draw mode, the drawer and the table's focus callbacks drive it too. */
  mapRef: RefObject<MapViewHandle | null>
  /**
   * Whether a ring is being drawn, the callback the map reports each vertex
   * to, and the count, Done and Cancel the phone's draw bar carries.
   */
  drawMode: Pick<
    DrawMode,
    'drawing' | 'handleDrawUpdate' | 'drawPointCount' | 'finishDrawing' | 'handleCancelDrawing' | 'startDrawing'
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
  tableView: Pick<TableView, 'tableColumns' | 'analysisModelLabel' | 'handleAggregateMove'>
  /**
   * How far the phone sheet lifts the map's bottom chrome, the camera's bottom
   * padding, and the padding for the sheet a search is about to open.
   */
  layout: Pick<
    ResultsLayout,
    'mapCornerLift' | 'sheetLiftPx' | 'overMapRows' | 'stageRef' | 'cameraPadBottomPx' | 'sheetPadBottomPx' | 'mapPx'
  >
  /** The run in flight, which the loading card reports and can cancel, and when the report was analyzed, which a result card says. */
  analysis: Pick<Analysis, 'loading' | 'statusMessage' | 'progress' | 'paceRemainingS' | 'paceReason' | 'cancel' | 'analyzedAtMs'>
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
  /** Whether a desk's legend card opens unfolded (`viewPrefs.legendOpen`). */
  legendInitiallyOpen: boolean
  /** Reopens the controls panel. */
  onOpenControls: () => void
  /** Lowers a phone's Controls sheet from the chip that raised it. */
  onCloseControls: () => void
  /** The summary chip's words: the When arm and the model (`controlsSummary`). */
  controlsSummary: string
  /** The panel's messages and Analyze gate (`usePanelMessages`), which the phone's Analyze button and its badge read (record 0208). */
  messages: PanelMessages
  /** What the panel's Analyze reads (#736, `actionWord`), which the phone's button reads too. */
  actionWord: ActionWord
  /** What the Forecast button says while it reads Analyze (`forecastLabel`), on a phone's button as on the bar's. */
  actionLabel?: string
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
  /**
   * Lowers a phone's results sheet, then does what it is handed (`useRowFocus`):
   * how a tap on the map that opens a card gives it room, as a row's press does.
   */
  lowerSheetFirst: (then: () => void) => void
  /** At a desk, the sentence bar and the card one of its chips opened (record 0309). */
  bar?: ReactNode
  /**
   * The card, handed the place search the map owns, which a desk's Where
   * card carries at its head (record 0313).
   */
  barCard?: (search: ReactNode) => ReactNode
  /** Opens a desk's Where card, for `/` (`useSlashToSearch`). */
  onOpenWhere?: () => void
  /**
   * Every settled move of the camera: the link's, and the search area's
   * view (`useSearchArea`). The link's alone where none is given.
   */
  onCameraMove?: (view: CameraView, readerMove: boolean) => void
  /** At a desk with the bar, the document links the corner's credit line carries (`DocLinks`). */
  cornerLinks?: ReactNode
  /**
   * The desk column's foot, where the legend stands while the column does
   * (record 0322), or null while there is no column, when the Legend chip
   * keeps it on the map.
   */
  legendHost?: HTMLElement | null
  /** The cloud deck at the hour drawn (record 0310), built in `App.tsx`. */
  cloudDeck?: readonly DeckPoint[] | null
  /** The markers' score colouring while a lens ranks the field (record 0307), memoized in `App.tsx`. */
  scoreColouring?: ScoreColouring | null
  /** At a desk, the window the day strip picks and the band it is drawn over (record 0311). */
  dayStrip?: {
    selection: ForecastSelection
    onSelection: (s: ForecastSelection) => void
    band: BandLimits
    /** The strip shows the window the report was fetched for (record 0323). */
    fresh?: boolean
    /** Opens the When card from the strip's model button. */
    onModel?: () => void
  } | null
}

/**
 * The map column above the results: the map, the loading card, the two rows
 * across its top with Layers and the legend in them, and the forecast player. MapView is memoized, so every
 * prop it gets here is a member of an input, never a value built in this
 * render (`map-stage-memo-props`).
 */
export default function MapStage({
  mapRef,
  theme,
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
  layout,
  analysis,
  sortBy,
  pointSample,
  modelId,
  showResults,
  sidebarOpen,
  layoutMotion = null,
  legendInitiallyOpen,
  onOpenControls,
  onCloseControls,
  controlsSummary,
  messages,
  actionWord,
  actionLabel,
  onAnalyze,
  layersForcedOpen,
  searchPointed,
  poisPointed,
  urlSync,
  restoredView,
  onBasemapFailed,
  maxPolygonPoints,
  lowerSheetFirst,
  bar,
  barCard,
  onOpenWhere,
  onCameraMove = urlSync.reportView,
  cornerLinks,
  legendHost = null,
  cloudDeck = null,
  scoreColouring = null,
  dayStrip = null,
}: MapStageProps) {
  // The map and the table point at one place under the pointer (record 0318).
  const onMarkerHover = useHoverLink(mapRef)
  const searchBoxRef = useRef<SearchBoxHandle>(null)
  // The round slot at the right of a phone's search pill, which the map
  // stands its own locate button in (#696). State rather than a ref, so the
  // map hears the slot arrive and go; at a desk there is none, and the button
  // stands in the map's corner (`cornerSlots`).
  const [locateSlot, setLocateSlot] = useState<HTMLDivElement | null>(null)
  // The compass's, under it at a phone's chip row's end (record 0147).
  const [compassSlot, setCompassSlot] = useState<HTMLDivElement | null>(null)
  const [terrainSlot, setTerrainSlot] = useState<HTMLDivElement | null>(null)
  // A desk's corner (`MapCorner`, record 0174), which stands the compass, the
  // locate button, the zoom pair, the credit line and the scale.
  const [cornerSlots, setCornerSlots] = useState<CornerSlots | null>(null)
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

  // A desk's search, at the head of the Where card (record 0313), and `/`,
  // which opens the card with the keyboard in it.
  const deskSearch = isDesktop && bar !== undefined && bar !== null
  useSlashToSearch(
    deskSearch && onOpenWhere !== undefined,
    () => onOpenWhere?.(),
    () => {
      if (!searchBoxRef.current) return false
      searchBoxRef.current.focus()
      return true
    },
  )
  const cardSearch = deskSearch ? (
    <SearchBox ref={searchBoxRef} onSelect={handleSearchSelect} pointed={searchPointed} />
  ) : null

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
  // Under a lens the markers wear the score's ramp, hour or window alike.
  const scored = scoreColouring !== null
  const metricScale = playbackIndex !== null ? hourlyScale(sortBy) : rankedScale(sortBy)
  const markerScale = scoreColouring !== null ? scoreScale(scoreColouring.range) : metricScale

  const hasColoredMarkers = showResults && results.length > 0
  // Whether the ranked metric has anything to colour AT ALL on the rows shown.
  // False for a freezing-level ranking under one of the five models that
  // publish no freezing level: every marker is then the neutral no-value fill,
  // every cell reads N/A, and a key of six height bands beside them would be
  // the only thing on screen claiming the field was measured.
  const rankedFieldHasValue = scored ? results.some((r) => r.score != null) : fieldHasValue(results, sortBy)
  // What the legend keys: a desk's card on the map, a phone's Legend sheet.
  // The grid paints the metric whatever ranks (#246), so under a lens it keeps
  // a key of its own beside the score's.
  const legendInputs: LegendInputs = {
    sortBy,
    markerScale,
    hasColoredMarkers,
    rankedFieldHasValue,
    overlays,
    grid,
    scored,
    scoreRange: scoreColouring?.range ?? null,
    gridScale: scored ? metricScale : null,
  }
  const legend = legendSections(legendInputs, smokeId)

  // The phone's draw bar stands under the chip row while a ring is drawn
  // (#687, #696), and the player steps out meanwhile: playback is no use
  // while points are being placed.
  const drawBarShown = drawMode.drawing && !isDesktop
  // A phone's Analyze button rides the results sheet (record 0135), and the
  // player stands on the button rather than on the sheet, stepping off while
  // a sheet dragged high leaves it no room. The Controls sheet moves none of
  // them: it opens over them, modal (record 0207). A full-screen sheet
  // stands over all of them (#837).
  const footLift = layout.sheetLiftPx
  const fabBottom = fabBottomPx(footLift, layout.mapPx)
  const timelineShown = timelineAxis !== null && !drawBarShown && (isDesktop || transportFits(fabBottom, layout.mapPx))

  // Layers is a round tool at both widths (records 0315 and 0331), its menu a
  // card beside the button at a desk and a bottom sheet on a phone (#696).
  const layers = (
    <LayersPopover
      overlays={overlays}
      grid={grid}
      playerOffered={timeline.playerOffered}
      cloudOffered={analysis.analyzedAtMs !== null}
      mapRef={mapRef}
      coverage={coverage}
      forcedOpen={layersForcedOpen}
      sheet={!isDesktop}
      tool
    />
  )
  // The tool column, a desk's in its corner (record 0315) and a phone's under
  // the sentence bar (record 0331): Layers, and drawing a ring, whose button
  // reads pressed while one is drawn and a second press lets it go.
  const tools = (
    <>
      {layers}
      <button
        type="button"
        aria-label="Draw a loop"
        aria-pressed={drawMode.drawing}
        onClick={drawMode.drawing ? drawMode.handleCancelDrawing : drawMode.startDrawing}
        className={MAP_TOOL.draw}
      >
        <IconLoop />
      </button>
    </>
  )
  // At a desk the key stands at the results column's foot while the column
  // does, as the prototype keeps its scale (record 0322).
  const legendInColumn = isDesktop && legendHost !== null
  const legendChip = legendInColumn ? null : (
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

  // The forecast player, alone over the map or hosted by the day strip.
  const transport = (axis: TimelineAxis, embedded: boolean) => (
    <TimelineTransport
      axis={axis}
      axes={timeline.timelineAxes}
      onAxisChange={timeline.setChosenAxis}
      index={timeline.frameIndex}
      frameCount={timeline.frameCount}
      onIndexChange={timeline.setFrameIndex}
      playing={timeline.playing}
      onPlayingChange={timeline.setPlaying}
      readout={timeline.timelineReadout}
      scale={timeline.timelineScale}
      forecastLabel={scored ? 'Score' : NOUN[familyOf(sortBy)]}
      liftPx={isDesktop ? layout.sheetLiftPx : transportStandPx(fabBottom)}
      embedded={embedded}
    />
  )

  // After a forecast the strip draws each day's sky and hosts the hours
  // itself (record 0323), while a lens ranks the field and the strip still
  // shows the window the report was fetched for.
  const skyShown = isDesktop && scored && dayStrip?.fresh === true && timelineShown && timelineAxis === 'forecast'
  const sky = useMemo(
    () => (skyShown ? daySky(report.results, timeline.forecastTimes) : null),
    [skyShown, report.results, timeline.forecastTimes],
  )
  const stripZoom: StripZoom | null =
    sky !== null && scoreColouring !== null && dayStrip?.onModel
      ? {
          sky,
          range: scoreColouring.range,
          times: timeline.forecastTimes,
          index: timeline.frameIndex,
          onIndex: timeline.setFrameIndex,
          playing: timeline.playing,
          onPlaying: timeline.setPlaying,
          readout: timeline.timelineReadout,
          label: 'Score time',
          model: tableView.analysisModelLabel ?? '',
          onModel: dayStrip.onModel,
        }
      : null

  return (
    // `--map-corner-lift` and `--map-corner-band` are read by map.css:
    // how far MapLibre's own bottom controls rise off the container's
    // bottom edge, and the height of the band they are centred in. Both
    // controls have a reason to rise: the attribution is a licence term
    // that cannot be covered by the phone sheet, and the scale bar reads
    // against the map rather than against the forecast player centred over
    // the same edge. One number for the corner rather than an offset per
    // control, derived beside every other anchor in `resultsSheet.ts`. The
    // map area keeps the whole column, so the canvas runs on behind the
    // sheet and its ResizeObserver sees no change on a drag.
    <div
      // The column a drag on a phone's sheet moves the foot of (#837).
      ref={layout.stageRef}
      // On a phone the library's stack, the compass alone there, starts under
      // the app's two rows, and under the draw bar while a ring is drawn.
      className={`flex-1 relative ${MAP_EDGE.publish} ${
        isDesktop ? '' : drawBarShown ? MAP_EDGE.belowDrawBar : MAP_EDGE.belowRows
      } ${layoutMotion ? LAYOUT_HOLD.clip : ''} ${layoutMotion === 'opening' || layoutMotion === 'closing' ? LAYOUT_HOLD.layer : ''}`}
      style={
        {
          // A phone's scale and (i) stand in the band over its foot
          // (record 0329), a desk's on the results' edge.
          '--map-corner-lift': `${isDesktop ? layout.mapCornerLift : phoneCornerLiftPx(fabBottom)}px`,
          '--map-corner-band': `${TRANSPORT_GAP_PX}px`,
        } as React.CSSProperties
      }
    >
      <AnalysisOverlay
        loading={analysis.loading}
        statusMessage={analysis.statusMessage}
        progress={analysis.progress}
        paceRemainingS={analysis.paceRemainingS}
        paceReason={analysis.paceReason}
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
          onLoopDrawn={drawMode.finishDrawing}
          results={results}
          sortBy={sortBy}
          modelId={modelId}
          times={timeline.forecastTimes}
          popupColumns={tableView.tableColumns}
          pointSample={pointSample}
          modelFallbackLabel={tableView.analysisModelLabel}
          analyzedAtMs={analysis.analyzedAtMs}
          showWildfires={overlays.showWildfires}
          showAreaClosures={overlays.showAreaClosures}
          showTrailClosures={overlays.showTrailClosures}
          showRadar={overlays.showRadar}
          showSmoke={overlays.showSmoke}
          showSnow={overlays.showSnow}
          showContours={overlays.showContours}
          showRelief={overlays.showRelief}
          showSlope={overlays.showSlope}
          cloudDeck={cloudDeck}
          scoreColouring={scoreColouring}
          showSatellite={overlays.showSatellite}
          baseOpacity={overlays.baseOpacity}
          showTerrain={overlays.showTerrain}
          theme={theme}
          onTerrainChange={overlays.setShowTerrain}
          showFireActivity={overlays.showFireActivity}
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
          onMoveAggregate={tableView.handleAggregateMove}
          cameraPadBottomPx={layout.cameraPadBottomPx}
          restoredView={restoredView}
          onCameraMove={onCameraMove}
          onMarkerHover={onMarkerHover}
          onBasemapFailed={onBasemapFailed}
          maxPolygonPoints={maxPolygonPoints}
          lowerSheetFirst={lowerSheetFirst}
          locateSlot={locateSlot}
          compassSlot={compassSlot}
          terrainSlot={terrainSlot}
          cornerSlots={cornerSlots}
        />
      </div>
      <MapRows
        searchBoxRef={searchBoxRef}
        onSearchSelect={handleSearchSelect}
        searchPointed={searchPointed}
        onLocateSlot={setLocateSlot}
        onCompassSlot={setCompassSlot}
        onTerrainSlot={setTerrainSlot}
        desk={isDesktop}
        sidebarOpen={sidebarOpen}
        onOpenControls={onOpenControls}
        onCloseControls={onCloseControls}
        controlsSummary={controlsSummary}
        tools={isDesktop ? null : tools}
        legend={legendChip}
        covered={layout.overMapRows}
        bar={bar}
        barCard={barCard?.(cardSearch)}
      />
      {/* A desk's map buttons, credit line and scale, in the map's
          bottom-right corner (record 0174). */}
      {legendInColumn && legend.length > 0 && createPortal(<LegendSections sections={legend} />, legendHost)}
      {isDesktop && <MapCorner onSlots={setCornerSlots} links={cornerLinks} tools={tools} />}
      {/* The foot of a phone's map: the Analyze button (record 0135) with
          the message badge at its corner (record 0208). */}
      {!isDesktop && (
        <PhoneFoot
          fabBottomPx={fabBottom}
          strip={
            dayStrip ? (
              <DayStrip
                bare
                selection={dayStrip.selection}
                onSelection={dayStrip.onSelection}
                band={dayStrip.band}
                liftPx={0}
                transport={null}
              />
            ) : null
          }
          analyzeEnabled={messages.analyzeEnabled}
          word={actionWord}
          label={actionLabel}
          onAnalyze={onAnalyze}
          messages={messages}
          covered={layout.overMapRows}
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
      {/* At a desk the day strip stands at the map's foot and hosts the
          player under its days (record 0311); a phone keeps the player alone. */}
      {isDesktop && dayStrip ? (
        <DayStrip
          selection={dayStrip.selection}
          onSelection={dayStrip.onSelection}
          band={dayStrip.band}
          liftPx={layout.sheetLiftPx}
          transport={timelineShown && timelineAxis !== null ? transport(timelineAxis, true) : null}
          zoom={stripZoom}
        />
      ) : (
        timelineShown && timelineAxis !== null && transport(timelineAxis, false)
      )}
    </div>
  )
}
