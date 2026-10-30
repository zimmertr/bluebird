import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import MapStage, { type MapStageProps } from './MapStage'
import type { MapViewHandle } from './MapView'
import { render } from '../testSupport/render'
import { panelMessages, place, resultRow } from '../testSupport/fixtures'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { MAX_POLYGON_POINTS } from '../utils/drawGeometry'
import { DRAGGED_MAP_PX, FAB_INSET_PX, phoneCornerLiftPx, transportStandPx } from '../utils/results/resultsSheet'
import { LAYOUT_HOLD, MAP_EDGE } from '../styles'
import type { Place } from '../utils/geocode'

// MapView draws with WebGL, which jsdom has none of, and what this suite is
// about is what reaches it: the props of every render are kept here.
const seen = vi.hoisted(() => ({ mapView: [] as Record<string, unknown>[] }))
vi.mock('./MapView', () => ({
  default: (props: Record<string, unknown>) => {
    seen.mapView.push(props)
    return <div data-testid="map" />
  },
}))
vi.mock('./MapLegend', async (original) => ({
  ...(await original<typeof import('./MapLegend')>()),
  default: (props: { sections: readonly unknown[]; sheet: boolean }) => (
    <div data-testid="legend" data-sections={String(props.sections.length)} data-sheet={String(props.sheet)} />
  ),
}))
vi.mock('./LayersPopover', () => ({
  default: (props: { sheet: boolean }) => <div data-testid="layers" data-sheet={String(props.sheet)} />,
}))
vi.mock('./TimelineTransport', () => ({
  default: (props: { liftPx: number }) => <div data-testid="transport" data-lift={String(props.liftPx)} />,
}))
vi.mock('./PhoneFoot', () => ({
  default: (props: {
    fabBottomPx: number
    onFabPx: (px: number) => void
    analyzeEnabled: boolean
    word: string
    onAnalyze: () => void
    messages: { count: number }
  }) => (
    <div data-testid="foot" data-fab={String(props.fabBottomPx)} data-word={props.word} data-count={String(props.messages.count)}>
      <button onClick={() => props.onFabPx(120)}>Fab</button>
      <button onClick={props.onAnalyze} disabled={!props.analyzeEnabled}>
        Analyze
      </button>
    </div>
  ),
}))
vi.mock('./MapRows', () => ({
  default: (props: {
    desk: boolean
    onOpenControls: () => void
    onSearchSelect: (place: Place) => void
    onLocateSlot: (slot: HTMLDivElement | null) => void
    onCompassSlot: (slot: HTMLDivElement | null) => void
    onTerrainSlot: (slot: HTMLDivElement | null) => void
    controlsSummary: string
    layers: ReactNode
    legend: ReactNode
  }) => (
    <div data-testid="rows" data-desk={String(props.desk)} data-summary={props.controlsSummary}>
      <button onClick={props.onOpenControls}>Controls</button>
      <button onClick={() => props.onSearchSelect(PLACE)}>Pick</button>
      <div data-testid="terrain" ref={props.onTerrainSlot} />
      <div data-testid="locate" ref={props.onLocateSlot} />
      {props.layers}
      {props.legend}
      <div data-testid="compass" ref={props.onCompassSlot} />
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
// The overlays' own setter, which the map's 3D button asks through (#799).
const SET_TERRAIN = () => {}
const OVERLAYS = {
  showWildfires: true,
  showAreaClosures: false,
  showTrailClosures: true,
  showRadar: false,
  showSmoke: false,
  showSnow: true,
  showContours: true,
  showRelief: false,
  showSlope: false,
  showSatellite: true,
  showTerrain: true,
  showFireActivity: true,
  setShowTerrain: SET_TERRAIN,
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
  mapPx: 800,
}
const ANALYSIS: MapStageProps['analysis'] = {
  loading: false,
  statusMessage: null,
  progress: null,
  paceRemainingS: null,
  cancel: NOOP,
}
const DRAW: MapStageProps['drawMode'] = {
  drawing: false,
  handleDrawUpdate: NOOP,
  drawPointCount: 0,
  finishDrawing: NOOP,
  handleCancelDrawing: NOOP,
}
const REMOVALS: MapStageProps['removals'] = { registerPlace: NOOP, removeResult: NOOP }
const MESSAGES = panelMessages()
const MAP_REF = createRef<MapViewHandle>()
const URL_SYNC: MapStageProps['urlSync'] = { reportView: NOOP }
const ON_BASEMAP_FAILED = (_failed: boolean) => {}

function props(over: Partial<MapStageProps> = {}): MapStageProps {
  return {
    layersForcedOpen: false,
    onCloseControls: NOOP,
    mapRef: MAP_REF,
    coverage: {},
    drawMode: DRAW,
    isDesktop: true,
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
    pointSample: false,
    modelId: 'gfs_seamless',
    showResults: true,
    sidebarOpen: true,
    legendInitiallyOpen: true,
    urlSync: URL_SYNC,
    restoredView: null,
    onBasemapFailed: ON_BASEMAP_FAILED,
    maxPolygonPoints: MAX_POLYGON_POINTS,
    onOpenControls: NOOP,
    controlsSummary: 'Current · NOAA GFS',
    messages: MESSAGES,
    actionWord: 'Analyze',
    onAnalyze: NOOP,
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
    // The rows hand back their slots once they mount, which is a render of
    // its own; the pair compared is the settled one and the next.
    const settled = seen.mapView.length
    rerender(<MapStage {...props()} />)
    expect(seen.mapView).toHaveLength(settled + 1)
    const [first, second] = seen.mapView.slice(-2)
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
    expect([got.showContours, got.showRelief, got.showSatellite, got.showTerrain]).toEqual([true, false, true, true])
    expect(got.showFireActivity).toBe(true)
    expect(got.onTerrainChange).toBe(SET_TERRAIN)
    expect(got.showSlope).toBe(false)
    expect(got.cameraPadBottomPx).toBe(40)
    expect(got.modelId).toBe('gfs_seamless')
    expect(got.onBasemapFailed).toBe(ON_BASEMAP_FAILED)
  })

  // The chip row holds Legend and Layers at both widths (#714, record 0174),
  // each handed to the rows rather than drawn beside them; their order is
  // the rows' own (MapRows.test.tsx).
  // While a desk's layout moves the map's column clips the map it holds to
  // one size (record 0202), and while the panel moves it stands on a layer
  // of its own (record 0216).
  it('clips the map\'s column while the layout moves, and gives it a layer while the panel does', () => {
    const { container, rerender } = render(<MapStage {...props()} />)
    const column = () => container.firstElementChild as HTMLElement
    expect(column().className).toContain('flex-1')
    expect(column().className).not.toContain(LAYOUT_HOLD.clip)
    expect(column().className).not.toContain(LAYOUT_HOLD.layer)
    rerender(<MapStage {...props({ layoutMotion: 'panes' })} />)
    expect(column().className).toContain(LAYOUT_HOLD.clip)
    expect(column().className).not.toContain(LAYOUT_HOLD.layer)
    for (const layoutMotion of ['opening', 'closing'] as const) {
      rerender(<MapStage {...props({ layoutMotion })} />)
      expect(column().className).toContain(LAYOUT_HOLD.clip)
      expect(column().className).toContain(LAYOUT_HOLD.layer)
    }
  })

  it('hands the rows the Legend and Layers chips at both widths', () => {
    const { rerender } = render(<MapStage {...props()} />)
    for (const desk of [true, false]) {
      rerender(<MapStage {...props({ isDesktop: desk, sidebarOpen: desk })} />)
      const rows = screen.getByTestId('rows')
      expect(rows.dataset.desk).toBe(String(desk))
      const layers = screen.getByTestId('layers')
      const legend = screen.getByTestId('legend')
      expect(rows.contains(layers) && rows.contains(legend)).toBe(true)
    }
  })

  it('draws the player only while something spans time', () => {
    const { rerender } = render(<MapStage {...props()} />)
    expect(screen.queryByTestId('transport')).toBeNull()
    rerender(<MapStage {...props({ timeline: { ...TIMELINE, timelineAxis: 'forecast' } })} />)
    expect(screen.getByTestId('transport')).toBeTruthy()
  })

  // Draw polygon closes the drawer on a phone, so Done and Cancel come to the
  // map (#687). They are the panel's own two presses, the bar stands under the
  // chip row (#696), and the player steps out while it is up.
  it('puts Done and Cancel on the map while a phone draws, and the player away', async () => {
    const finishDrawing = vi.fn()
    const handleCancelDrawing = vi.fn()
    const drawing = { ...DRAW, drawing: true, drawPointCount: 2, finishDrawing, handleCancelDrawing }
    const timeline = { ...TIMELINE, timelineAxis: 'forecast' } as MapStageProps['timeline']
    const { user, rerender } = render(<MapStage {...props({ drawMode: drawing, isDesktop: false, sidebarOpen: false, timeline })} />)
    expect(screen.queryByTestId('transport')).toBeNull()
    expect(screen.getByText('2 points placed, 1 more needed.')).toBeTruthy()
    const done = screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement
    expect(done.disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(handleCancelDrawing).toHaveBeenCalledOnce()

    rerender(<MapStage {...props({ drawMode: { ...drawing, drawPointCount: 3 }, isDesktop: false, sidebarOpen: false, timeline })} />)
    // Free to wrap in the bar, where Done and Cancel share the line; the
    // panel keeps it whole beside the area.
    expect(screen.getByText('3 points placed. Press Done or Analyze.').className).not.toContain('whitespace-nowrap')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(finishDrawing).toHaveBeenCalledOnce()

    // Out of the mode the player comes back and the bar goes.
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, timeline })} />)
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(screen.getByTestId('transport')).toBeTruthy()
  })

  it('keeps a desk drawing in the panel, with the player where it was', () => {
    const drawing = { ...DRAW, drawing: true, drawPointCount: 2 }
    const timeline = { ...TIMELINE, timelineAxis: 'forecast' } as MapStageProps['timeline']
    render(<MapStage {...props({ drawMode: drawing, timeline })} />)
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(screen.getByTestId('transport')).toBeTruthy()
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
    render(<MapStage {...props({ mapRef, removals: { registerPlace, removeResult: NOOP } })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }))
    expect(flyToPlace).toHaveBeenCalledWith(PLACE, 300)
    expect(registerPlace).toHaveBeenCalledWith(PLACE)
    expect(flyToPlace.mock.invocationCallOrder[0]).toBeLessThan(registerPlace.mock.invocationCallOrder[0])
  })

  // The rows carry the summary, and Layers opens as a sheet on a phone and
  // as a joined menu at a desk.
  it('hands the rows the summary, and Layers as a sheet on a phone only', () => {
    const { rerender } = render(<MapStage {...props({ isDesktop: false, sidebarOpen: false })} />)
    expect(screen.getByTestId('rows').dataset.summary).toBe('Current · NOAA GFS')
    expect(screen.getByTestId('layers').dataset.sheet).toBe('true')
    rerender(<MapStage {...props()} />)
    expect(screen.getByTestId('rows').dataset.summary).toBe('Current · NOAA GFS')
    expect(screen.getByTestId('layers').dataset.sheet).toBe('false')
  })

  // One answer for both widths: the Legend chip gets the sections, and opens
  // them as a card at a desk and as a sheet on a phone.
  it('hands the Legend chip the sections, as a card at a desk and a sheet on a phone', () => {
    const { rerender } = render(<MapStage {...props()} />)
    // The metric key over coloured markers, and the four layers that are on.
    const legend = () => screen.getByTestId('legend').dataset
    expect(legend().sections).toBe('5')
    expect(legend().sheet).toBe('false')
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false })} />)
    expect(legend().sections).toBe('5')
    expect(legend().sheet).toBe('true')
  })

  // Whatever slot the rows hand up reaches the map, which stands its own
  // button in it (record 0147). Which width has slots is the rows' to say
  // (`MapRows.test.tsx`): a phone's, and none at a desk (record 0174).
  it('hands the map the slots the rows hand up', () => {
    for (const desk of [true, false]) {
      seen.mapView.length = 0
      const { unmount } = render(<MapStage {...props({ isDesktop: desk, sidebarOpen: desk })} />)
      const last = seen.mapView[seen.mapView.length - 1]
      expect(last.locateSlot).toBe(screen.getByTestId('locate'))
      expect(last.compassSlot).toBe(screen.getByTestId('compass'))
      expect(last.terrainSlot).toBe(screen.getByTestId('terrain'))
      unmount()
    }
  })

  // A desk's buttons, credit line and scale stand in the map's bottom-right
  // corner (record 0174), whose slots reach the map together; a phone's map
  // has no corner.
  it('hands the map a desk\'s corner, and none on a phone', () => {
    seen.mapView.length = 0
    const { container, rerender } = render(<MapStage {...props()} />)
    const corner = seen.mapView[seen.mapView.length - 1].cornerSlots as Record<string, HTMLElement>
    expect(Object.keys(corner)).toEqual(['compass', 'terrain', 'locate', 'zoom', 'credit', 'scale'])
    for (const slot of Object.values(corner)) expect(container.contains(slot)).toBe(true)
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false })} />)
    expect(seen.mapView[seen.mapView.length - 1].cornerSlots).toBeNull()
    expect(container.querySelector('.map-corner')).toBeNull()
  })

  // On a phone the vendor's stack, the compass alone there, starts under the
  // rows, and under the draw bar while a ring is drawn.
  it('publishes the vendor stack\'s top on a phone only', () => {
    const { container, rerender } = render(<MapStage {...props()} />)
    const stage = () => container.firstElementChild as HTMLElement
    expect(stage().className).not.toContain('--map-vendor-top')
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false })} />)
    expect(stage().className).toContain(MAP_EDGE.belowRows)
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, drawMode: { ...DRAW, drawing: true } })} />)
    expect(stage().className).toContain(MAP_EDGE.belowDrawBar)
    expect(stage().className).not.toContain(MAP_EDGE.belowRows)
  })

  // The foot of a phone's map (#696): the Analyze button with the badge,
  // on the panel's own gate, command and messages. A desk has none.
  it('stands the Analyze button on a phone only, on the panel\'s gate, command and messages', () => {
    const onAnalyze = vi.fn()
    const { rerender } = render(<MapStage {...props({ onAnalyze })} />)
    expect(screen.queryByTestId('foot')).toBeNull()
    const shut = panelMessages({
      analyzeEnabled: false,
      blocked: true,
      messages: [{ key: 'blocker:dates', text: 'Pick a date.', severity: 'info' }],
    })
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, onAnalyze, messages: shut })} />)
    expect((screen.getByRole('button', { name: 'Analyze' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('foot').dataset.count).toBe('1')
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, onAnalyze })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))
    expect(onAnalyze).toHaveBeenCalledOnce()
    // The word is App's (#736), the same one the panel's button reads.
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, actionWord: 'Try again' })} />)
    expect(screen.getByTestId('foot').dataset.word).toBe('Try again')
  })

  // One thing moves the button (record 0135): the sheet it rides. The
  // player stands on the button.
  it('rides the sheet and carries the player', () => {
    const layout = { ...LAYOUT, sheetLiftPx: 104 }
    const timeline = { ...TIMELINE, timelineAxis: 'forecast' } as MapStageProps['timeline']
    render(<MapStage {...props({ isDesktop: false, sidebarOpen: false, layout, timeline })} />)
    const fab = 104 + FAB_INSET_PX
    expect(screen.getByTestId('foot').dataset.fab).toBe(String(fab))
    expect(screen.getByTestId('transport').dataset.lift).toBe(String(transportStandPx(fab)))
  })

  // The opened credit line stops short of the button (map.css), so a phone
  // publishes the width it measured; a desk has no button.
  it('publishes the button\'s width on a phone', () => {
    const { container, rerender } = render(<MapStage {...props()} />)
    const stage = () => container.firstElementChild as HTMLElement
    expect(stage().style.getPropertyValue('--map-fab-w')).toBe('')
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false })} />)
    expect(stage().style.getPropertyValue('--map-fab-w')).toBe('0px')
    fireEvent.click(screen.getByRole('button', { name: 'Fab' }))
    expect(stage().style.getPropertyValue('--map-fab-w')).toBe('120px')
  })

  // A sheet at its highest leaves the button its strip and no room for the
  // player, which steps off rather than standing over the chips.
  it('takes the player off a phone\'s map while a sheet leaves it no room', () => {
    const timeline = { ...TIMELINE, timelineAxis: 'forecast' } as MapStageProps['timeline']
    const layout = { ...LAYOUT, sheetLiftPx: 800 - DRAGGED_MAP_PX }
    render(<MapStage {...props({ isDesktop: false, sidebarOpen: false, layout, timeline })} />)
    expect(screen.queryByTestId('transport')).toBeNull()
    expect(screen.getByTestId('foot').dataset.fab).toBe(String(800 - DRAGGED_MAP_PX + FAB_INSET_PX))
  })

  // The Controls sheet opens over the foot (record 0207): the button, the
  // player and the corner stay where they stood, on the results sheet's edge.
  it('moves nothing on the foot while the Controls sheet is up', () => {
    const layout = { ...LAYOUT, sheetLiftPx: 104 }
    const timeline = { ...TIMELINE, timelineAxis: 'forecast' } as MapStageProps['timeline']
    const phone = (sidebarOpen: boolean) => props({ isDesktop: false, sidebarOpen, layout, timeline })
    const { container, rerender } = render(<MapStage {...phone(false)} />)
    const foot = () => screen.getByTestId('foot').dataset
    const shut = {
      fab: foot().fab,
      player: screen.getByTestId('transport').dataset.lift,
      corner: (container.firstElementChild as HTMLElement).style.getPropertyValue('--map-corner-lift'),
    }
    rerender(<MapStage {...phone(true)} />)
    expect(foot().fab).toBe(shut.fab)
    expect(screen.getByTestId('transport').dataset.lift).toBe(shut.player)
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--map-corner-lift')).toBe(shut.corner)
  })

  // A phone's scale and (i) stand on the button's row (record 0140); a desk's
  // on the results' edge, as before.
  it("stands a phone's map corners on the button's row", () => {
    const layout = { ...LAYOUT, sheetLiftPx: 104 }
    const { container, rerender } = render(<MapStage {...props({ layout })} />)
    const stage = () => container.firstElementChild as HTMLElement
    expect(stage().style.getPropertyValue('--map-corner-lift')).toBe(`${LAYOUT.mapCornerLift}px`)
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, layout })} />)
    expect(stage().style.getPropertyValue('--map-corner-lift')).toBe(`${phoneCornerLiftPx(104 + FAB_INSET_PX)}px`)
  })
})
