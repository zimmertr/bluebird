import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import MapStage, { type MapStageProps } from './MapStage'
import type { MapViewHandle } from './MapView'
import { render } from '../testSupport/render'
import { place, resultRow } from '../testSupport/fixtures'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { MAX_POLYGON_POINTS } from '../utils/drawGeometry'
import type { Place } from '../utils/geocode'
import type { LegendFold } from '../hooks/useLegendFold'

// MapView draws with WebGL, which jsdom has none of, and what this suite is
// about is what reaches it: the props of every render are kept here.
const seen = vi.hoisted(() => ({ mapView: [] as Record<string, unknown>[] }))
vi.mock('./MapView', () => ({
  default: (props: Record<string, unknown>) => {
    seen.mapView.push(props)
    return <div data-testid="map" />
  },
}))
vi.mock('./MapLegend', () => ({
  default: (props: { columnFull: boolean; expanded: boolean }) => (
    <div data-testid="legend" data-column-full={String(props.columnFull)} data-expanded={String(props.expanded)} />
  ),
}))
vi.mock('./LayersPopover', () => ({
  default: (props: { inRow: boolean }) => <div data-testid="layers" data-in-row={String(props.inRow)} />,
}))
vi.mock('./TimelineTransport', () => ({ default: () => <div data-testid="transport" /> }))
vi.mock('./MapButtonColumn', () => ({
  default: (props: {
    onOpenControls: () => void
    onSearchSelect: (place: Place) => void
    onAnalyze: () => void
    phoneRow: boolean
    analyzeEnabled: boolean
    analyzing: boolean
    controlsSummary: string
    children: ReactNode
  }) => (
    <div
      data-testid="buttons"
      data-phone-row={String(props.phoneRow)}
      data-summary={props.controlsSummary}
      data-analyzing={String(props.analyzing)}
    >
      <button onClick={props.onOpenControls}>Controls</button>
      <button onClick={() => props.onSearchSelect(PLACE)}>Pick</button>
      <button onClick={props.onAnalyze} disabled={!props.analyzeEnabled}>
        Analyze
      </button>
      {props.children}
    </div>
  ),
}))

const NOOP = () => {}
// Read only on a press, long after the mocks above are built.
const PLACE: Place = place()
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
  showAreaClosures: false,
  showTrailClosures: true,
  showRadar: false,
  showSmoke: false,
  showSnow: true,
} as unknown as MapStageProps['overlays']
const REPORT: MapStageProps['report'] = { results: [ROW], pending: [] }
const TABLE_VIEW = { tableColumns: [], analysisModelLabel: 'GFS' } as unknown as MapStageProps['tableView']
const FIRE = { warnings: new Map() } as unknown as MapStageProps['fire']
const CLOSURE = { warnings: new Map() } as unknown as MapStageProps['closure']
const LAYOUT: MapStageProps['layout'] = {
  mapCornerLift: 12,
  sheetLiftPx: 0,
  cameraPadBottomPx: 40,
  sheetPadBottomPx: 300,
}
const LEGEND: LegendFold = { legendExpanded: true, toggleLegend: NOOP }
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
const ON_BASEMAP_FAILED = (_failed: boolean) => {}

function props(over: Partial<MapStageProps> = {}): MapStageProps {
  return {
    layersForcedOpen: false,
    mapRef: MAP_REF,
    coverage: {},
    drawMode: DRAW,
    destinationInputs: INPUTS,
    removals: REMOVALS,
    overlays: OVERLAYS,
    grid: GRID,
    timeline: TIMELINE,
    report: REPORT,
    tableView: TABLE_VIEW,
    fire: FIRE,
    closure: CLOSURE,
    layout: LAYOUT,
    analysis: ANALYSIS,
    sortBy: DEFAULT_FAMILY_KEY.temp,
    modelId: 'gfs_seamless',
    showResults: true,
    sidebarOpen: true,
    urlSync: URL_SYNC,
    restoredView: null,
    onBasemapFailed: ON_BASEMAP_FAILED,
    maxPolygonPoints: MAX_POLYGON_POINTS,
    onOpenControls: NOOP,
    isDesktop: true,
    analyzeEnabled: true,
    onAnalyze: NOOP,
    controlsSummary: 'Current · NOAA GFS',
    legend: LEGEND,
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
    expect(got.closureWarnings).toBe(CLOSURE.warnings)
    expect(got.gridSpec).toBe(GRID.grid.spec)
    expect(got.gridCells).toBe(GRID.grid.cells)
    expect(got.showWildfires).toBe(true)
    expect(got.showSnow).toBe(true)
    expect(got.showAreaClosures).toBe(false)
    expect(got.showTrailClosures).toBe(true)
    expect(got.cameraPadBottomPx).toBe(40)
    expect(got.modelId).toBe('gfs_seamless')
    expect(got.onBasemapFailed).toBe(ON_BASEMAP_FAILED)
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

  // A searched place is framed for the sheet it is about to open, and only
  // then registered, which is what opens that sheet (#696).
  it('frames a searched place for the sheet it is about to open', () => {
    const flyToPlace = vi.fn()
    const registerPlace = vi.fn()
    const mapRef = { current: { flyToPlace } as unknown as MapViewHandle }
    render(<MapStage {...props({ mapRef, removals: { registerPlace } })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }))
    expect(flyToPlace).toHaveBeenCalledWith(PLACE, 300)
    expect(registerPlace).toHaveBeenCalledWith(PLACE)
    expect(flyToPlace.mock.invocationCallOrder[0]).toBeLessThan(registerPlace.mock.invocationCallOrder[0])
  })

  // A phone gets the row: the summary, the panel's gate and command, and
  // Layers in the row; a desktop keeps its column.
  it('hands the phone row the panel\'s command and gate', () => {
    const onAnalyze = vi.fn()
    const { rerender } = render(<MapStage {...props({ isDesktop: false, onAnalyze, analyzeEnabled: false })} />)
    const buttons = screen.getByTestId('buttons')
    expect(buttons.dataset.phoneRow).toBe('true')
    expect(buttons.dataset.summary).toBe('Current · NOAA GFS')
    expect(screen.getByTestId('layers').dataset.inRow).toBe('true')
    expect((screen.getByRole('button', { name: 'Analyze' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<MapStage {...props({ isDesktop: false, onAnalyze, analyzeEnabled: true })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))
    expect(onAnalyze).toHaveBeenCalledOnce()
    rerender(<MapStage {...props({ isDesktop: false, analysis: { ...ANALYSIS, loading: true } })} />)
    expect(screen.getByTestId('buttons').dataset.analyzing).toBe('true')
  })

  // The legend clears the taller column only where a desktop has one: a
  // phone's Controls stands in the row, so its column is the short one.
  it('clears the taller column only on a desktop with the panel closed', () => {
    const { rerender } = render(<MapStage {...props({ sidebarOpen: false })} />)
    expect(screen.getByTestId('legend').dataset.columnFull).toBe('true')
    rerender(<MapStage {...props({ sidebarOpen: false, isDesktop: false })} />)
    expect(screen.getByTestId('legend').dataset.columnFull).toBe('false')
    rerender(<MapStage {...props({ legend: { legendExpanded: false, toggleLegend: NOOP } })} />)
    expect(screen.getByTestId('legend').dataset.expanded).toBe('false')
  })

  // On a phone the vendor's zoom stack starts below the row.
  it('publishes the vendor stack\'s top on a phone only', () => {
    const { container, rerender } = render(<MapStage {...props()} />)
    const stage = () => container.firstElementChild as HTMLElement
    expect(stage().className).not.toContain('--map-vendor-top')
    rerender(<MapStage {...props({ isDesktop: false })} />)
    expect(stage().className).toContain('--map-vendor-top')
  })
})
