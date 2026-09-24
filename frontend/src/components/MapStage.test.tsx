import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import MapStage, { type MapStageProps } from './MapStage'
import type { MapViewHandle } from './MapView'
import { render } from '../testSupport/render'
import { resultRow } from '../testSupport/fixtures'
import { DEFAULT_FAMILY_KEY } from '../metrics'

// MapView draws with WebGL, which jsdom has none of, and what this suite is
// about is what reaches it: the props of every render are kept here.
const seen = vi.hoisted(() => ({ mapView: [] as Record<string, unknown>[] }))
vi.mock('./MapView', () => ({
  default: (props: Record<string, unknown>) => {
    seen.mapView.push(props)
    return <div data-testid="map" />
  },
}))
vi.mock('./MapLegend', () => ({ default: () => <div data-testid="legend" /> }))
vi.mock('./LayersPopover', () => ({ default: () => <div data-testid="layers" /> }))
vi.mock('./TimelineTransport', () => ({ default: () => <div data-testid="transport" /> }))
vi.mock('./MapButtonColumn', () => ({
  default: (props: { onOpenControls: () => void; children: ReactNode }) => (
    <div data-testid="buttons">
      <button onClick={props.onOpenControls}>Controls</button>
      {props.children}
    </div>
  ),
}))

const NOOP = () => {}
const ROW = resultRow()
// Hoisted, so a second render hands MapStage the very objects App would: the
// same hook results, rebuilt by nothing between the two.
const INPUTS: MapStageProps['destinationInputs'] = {
  polygon: null,
  setPolygon: NOOP,
  restoredPoints: [],
  places: [],
  removePlace: NOOP,
}
const TIMELINE = {
  forecastTimes: [1, 2],
  timelineAxes: [],
  timelineAxis: null,
  setChosenAxis: NOOP,
  playerOffered: false,
  radarIndex: 0,
  frameIndex: 0,
  frameCount: 0,
  setFrameIndex: NOOP,
  playing: false,
  setPlaying: NOOP,
  playbackIndex: null,
  timelineReadout: null,
  timelineScale: null,
} as unknown as MapStageProps['timeline']
const GRID = {
  grid: { spec: null, cells: null },
  gridStyle: 'blocks',
} as unknown as MapStageProps['grid']
const OVERLAYS = {
  showWildfires: true,
  showRadar: false,
  showSmoke: false,
  showSnow: true,
} as unknown as MapStageProps['overlays']
const REPORT: MapStageProps['report'] = { results: [ROW], pending: [] }
const TABLE_VIEW = { tableColumns: [], analysisModelLabel: 'GFS' } as unknown as MapStageProps['tableView']
const FIRE = { warnings: new Map() } as unknown as MapStageProps['fire']
const LAYOUT: MapStageProps['layout'] = { mapCornerLift: 12, sheetLiftPx: 0, cameraPadBottomPx: 40 }
const ANALYSIS: MapStageProps['analysis'] = {
  loading: false,
  statusMessage: null,
  progress: null,
  paceRemainingS: null,
  cancel: NOOP,
}
const DRAW: MapStageProps['drawMode'] = { drawing: false, handleDrawUpdate: NOOP }
const REMOVALS: MapStageProps['removals'] = { registerPlace: NOOP }
const MAP_REF = createRef<MapViewHandle>()
const URL_SYNC: MapStageProps['urlSync'] = { reportView: NOOP }

function props(over: Partial<MapStageProps> = {}): MapStageProps {
  return {
    mapRef: MAP_REF,
    drawMode: DRAW,
    destinationInputs: INPUTS,
    removals: REMOVALS,
    overlays: OVERLAYS,
    grid: GRID,
    timeline: TIMELINE,
    report: REPORT,
    tableView: TABLE_VIEW,
    fire: FIRE,
    layout: LAYOUT,
    analysis: ANALYSIS,
    sortBy: DEFAULT_FAMILY_KEY.temp,
    modelId: 'gfs_seamless',
    showResults: true,
    sidebarOpen: true,
    urlSync: URL_SYNC,
    restoredView: null,
    onOpenControls: NOOP,
    searchPointed: false,
    poisPointed: false,
    ...over,
  }
}

describe('MapStage', () => {
  // MapView is memoized, so a value built in MapStage's render would be a new
  // prop every time App renders. Two renders from the same hook results must
  // hand it the same thing, prop by prop.
  it('hands MapView the same value for every prop across renders', () => {
    seen.mapView.length = 0
    const { rerender } = render(<MapStage {...props()} />)
    rerender(<MapStage {...props()} />)
    expect(seen.mapView).toHaveLength(2)
    const [first, second] = seen.mapView
    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort())
    for (const key of Object.keys(first)) {
      expect(Object.is(second[key], first[key]), key).toBe(true)
    }
  })

  it('hands MapView the members its inputs name', () => {
    seen.mapView.length = 0
    render(<MapStage {...props()} />)
    const got = seen.mapView[0]
    expect(got.results).toBe(REPORT.results)
    expect(got.pending).toBe(REPORT.pending)
    expect(got.times).toBe(TIMELINE.forecastTimes)
    expect(got.onPolygonChange).toBe(INPUTS.setPolygon)
    expect(got.onDrawUpdate).toBe(DRAW.handleDrawUpdate)
    expect(got.searchedPlaces).toBe(INPUTS.places)
    expect(got.popupColumns).toBe(TABLE_VIEW.tableColumns)
    expect(got.fireWarnings).toBe(FIRE.warnings)
    expect(got.gridSpec).toBe(GRID.grid.spec)
    expect(got.gridCells).toBe(GRID.grid.cells)
    expect(got.showWildfires).toBe(true)
    expect(got.showSnow).toBe(true)
    expect(got.cameraPadBottomPx).toBe(40)
    expect(got.modelId).toBe('gfs_seamless')
  })

  // Paint order is DOM order at one layer, and the Layers popover must open
  // over the legend rather than under it.
  it('puts the legend before the button column', () => {
    render(<MapStage {...props()} />)
    const legend = screen.getByTestId('legend')
    const buttons = screen.getByTestId('buttons')
    expect(legend.compareDocumentPosition(buttons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws the player only while something spans time', () => {
    const { rerender } = render(<MapStage {...props()} />)
    expect(screen.queryByTestId('transport')).toBeNull()
    rerender(<MapStage {...props({ timeline: { ...TIMELINE, timelineAxis: 'forecast' } })} />)
    expect(screen.getByTestId('transport')).toBeTruthy()
  })

  it('publishes the corner lift map.css reads', () => {
    const { container } = render(<MapStage {...props()} />)
    const stage = container.firstElementChild as HTMLElement
    expect(stage.style.getPropertyValue('--map-corner-lift')).toBe('12px')
  })

  it('reopens the controls', () => {
    const onOpenControls = vi.fn()
    render(<MapStage {...props({ onOpenControls })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Controls' }))
    expect(onOpenControls).toHaveBeenCalledOnce()
  })
})
