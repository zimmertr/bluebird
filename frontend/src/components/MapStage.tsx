import { useCallback, useRef, type ComponentProps, type RefObject } from 'react'
import MapView, { type MapViewHandle } from './MapView'
import type { SearchBoxHandle } from './SearchBox'
import TimelineTransport from './TimelineTransport'
import AnalysisOverlay from './AnalysisOverlay'
import LayersPopover from './LayersPopover'
import MapButtonColumn from './MapButtonColumn'
import MapLegend from './MapLegend'
import type { Analysis } from '../hooks/useAnalyze'
import type { DestinationInputs } from '../hooks/useDestinationInputs'
import type { DrawMode } from '../hooks/useDrawMode'
import type { FireProximity } from '../hooks/useFireProximity'
import type { GridLayer } from '../hooks/useGridLayer'
import type { MapOverlays } from '../hooks/useMapOverlays'
import type { PresentedReport } from '../hooks/usePresentedReport'
import type { Removals } from '../hooks/useRemovals'
import type { ResultsLayout } from '../hooks/useResultsLayout'
import type { TableView } from '../hooks/useTableView'
import type { Timeline } from '../hooks/useTimeline'
import type { SortBy } from '../types'
import { MAP_EDGE } from '../styles'
import { NOUN, familyOf } from '../metrics'
import { hourlyScale, rankedScale } from '../utils/colors'
import { TRANSPORT_GAP_PX } from '../utils/resultsSheet'
import type { Place } from '../utils/geocode'
import { fieldHasValue } from '../utils/present'
import type { CameraView } from '../utils/mapView'
import type { UrlSync } from '../hooks/useUrlSync'

export interface MapStageProps {
  /** The map's handle; draw mode, the drawer and the table's focus callbacks drive it too. */
  mapRef: RefObject<MapViewHandle | null>
  /** Whether a ring is being drawn, and the callback the map reports each vertex to. */
  drawMode: Pick<DrawMode, 'drawing' | 'handleDrawUpdate'>
  /** The ring, the link's restored points and the searched places, with the setters the map calls. */
  destinationInputs: Pick<DestinationInputs, 'polygon' | 'setPolygon' | 'restoredPoints' | 'places' | 'removePlace'>
  /** Registers a place picked in the search field or clicked on the map. */
  removals: Pick<Removals, 'registerPlace'>
  /** Which overlays are on, and their setters for the Layers popover. */
  overlays: Omit<MapOverlays, 'showPlayer'>
  /** The forecast grid's cells and style, its legend state and its Layers row. */
  grid: Pick<GridLayer, 'grid' | 'gridStyle'> &
    ComponentProps<typeof MapLegend>['grid'] &
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
  /** How far the phone sheet lifts the map's bottom chrome, and the camera's bottom padding. */
  layout: Pick<ResultsLayout, 'mapCornerLift' | 'sheetLiftPx' | 'cameraPadBottomPx'>
  /** The run in flight, which the loading card reports and can cancel. */
  analysis: Pick<Analysis, 'loading' | 'statusMessage' | 'progress' | 'paceRemainingS' | 'cancel'>
  /** The metric the markers are coloured on. */
  sortBy: SortBy
  /** The model the markers' popups name. */
  modelId: string | null
  /** Whether the results are shown, which is when the markers wear the ranking's colours. */
  showResults: boolean
  /** Whether the controls panel is open. */
  sidebarOpen: boolean
  /** Reopens the controls panel. */
  onOpenControls: () => void
  /** The panel's Map group is hovered, so the search field wears a ring. */
  searchPointed: boolean
  /** The same hover, so every clickable feature on the map glows. */
  poisPointed: boolean
  /** The share link's camera callback, which writes without rendering. */
  urlSync: Pick<UrlSync, 'reportView'>
  /** The camera a link opened on, which wins over the opening fit. */
  restoredView: CameraView | null
}

/**
 * The map column above the results: the map, the loading card, the legend,
 * the button column and the forecast player. MapView is memoized, so every
 * prop it gets here is a member of an input, never a value built in this
 * render (`map-stage-memo-props`).
 */
export default function MapStage({
  mapRef,
  drawMode,
  destinationInputs,
  removals,
  overlays,
  grid,
  timeline,
  report,
  tableView,
  fire,
  layout,
  analysis,
  sortBy,
  modelId,
  showResults,
  sidebarOpen,
  onOpenControls,
  searchPointed,
  poisPointed,
  urlSync,
  restoredView,
}: MapStageProps) {
  const searchBoxRef = useRef<SearchBoxHandle>(null)
  const { registerPlace } = removals
  const { removePlace } = destinationInputs
  const { results } = report
  const { playbackIndex, timelineAxis } = timeline

  function handleSearchSelect(place: Place) {
    mapRef.current?.flyToPlace(place)
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
      data-tour="map"
      className={`flex-1 relative ${MAP_EDGE.publish}`}
      style={
        {
          '--map-corner-lift': `${layout.mapCornerLift}px`,
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
        modelFallbackLabel={tableView.analysisModelLabel}
        fireWarnings={fire.warnings}
        showWildfires={overlays.showWildfires}
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
        cameraPadBottomPx={layout.cameraPadBottomPx}
        restoredView={restoredView}
        onCameraMove={urlSync.reportView}
      />
      {/* The legends render BEFORE the button column below on purpose.
          Both are map chrome at the same layer, so paint order is DOM
          order, and the one that has to win is the one you can click:
          the Layers popover opens downward into exactly this space, and
          with the legends last it opened underneath them. Pushing the
          legends further down instead only moved the collision, since a
          popover is as tall as its contents. */}
      <MapLegend
        sortBy={sortBy}
        markerScale={markerScale}
        hasColoredMarkers={hasColoredMarkers}
        rankedFieldHasValue={rankedFieldHasValue}
        overlays={overlays}
        grid={grid}
        sidebarOpen={sidebarOpen}
        sheetLiftPx={layout.sheetLiftPx}
        timelineShown={timelineAxis !== null}
      />
      <MapButtonColumn
        searchBoxRef={searchBoxRef}
        onSearchSelect={handleSearchSelect}
        searchPointed={searchPointed}
        sidebarOpen={sidebarOpen}
        onOpenControls={onOpenControls}
      >
        <LayersPopover overlays={overlays} grid={grid} playerOffered={timeline.playerOffered} />
      </MapButtonColumn>
      {/* The timeline, present exactly while something spans time: radar
          contributes a past axis, a multi-hour report a forecast one, and
          a smoke analysis contributes neither (two passes a day is not an
          animation). */}
      {timelineAxis !== null && (
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
          liftPx={layout.sheetLiftPx}
        />
      )}
    </div>
  )
}
