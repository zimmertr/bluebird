import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import MapStage, { type MapStageProps } from './MapStage'
import type { MapViewHandle } from './MapView'
import { placeAt, render, stubResizeObserver } from '../testSupport/render'
import { place, resultRow } from '../testSupport/fixtures'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { MAX_POLYGON_POINTS } from '../utils/drawGeometry'
import {
  CORNER_MARGIN_PX,
  DRAGGED_MAP_PX,
  FAB_INSET_PX,
  controlsSheetPx,
  fabBottomPx,
  noticeBottomPx,
  transportStandPx,
  type PhoneLine,
} from '../utils/resultsSheet'
import { MAP_CORNER, MAP_EDGE } from '../styles'
import { CREDITS_OPEN_CLASS, type CornerSlots } from '../map/controls'
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
    bandBottomPx: number
    fabBottomPx: number
    onBandPx: (px: number) => void
    analyzeEnabled: boolean
    word: string
    onAnalyze: () => void
  }) => (
    <div data-testid="foot" data-band={String(props.bandBottomPx)} data-fab={String(props.fabBottomPx)} data-word={props.word}>
      <button onClick={() => props.onBandPx(40)}>Band</button>
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
    controlsSummary: string
    layers: ReactNode
    legend: ReactNode
  }) => (
    <div data-testid="rows" data-desk={String(props.desk)} data-summary={props.controlsSummary}>
      <button onClick={props.onOpenControls}>Controls</button>
      <button onClick={() => props.onSearchSelect(PLACE)}>Pick</button>
      <div data-testid="locate" ref={props.onLocateSlot} />
      {props.layers}
      {props.legend}
      <div data-testid="compass" ref={props.onCompassSlot} />
    </div>
  ),
}))

const NOOP = () => {}
// In an afterEach so a failed assertion cannot leave the fake observer behind.
afterEach(() => {
  vi.unstubAllGlobals()
})
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
    controlsPx: 540,
    legendInitiallyOpen: true,
    urlSync: URL_SYNC,
    restoredView: null,
    onBasemapFailed: ON_BASEMAP_FAILED,
    maxPolygonPoints: MAX_POLYGON_POINTS,
    onOpenControls: NOOP,
    controlsSummary: 'Current · NOAA GFS',
    onNoticeBand: NOOP,
    analyzeEnabled: true,
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
    expect(got.cameraPadBottomPx).toBe(40)
    expect(got.modelId).toBe('gfs_seamless')
    expect(got.onBasemapFailed).toBe(ON_BASEMAP_FAILED)
  })

  // The chip row holds Legend and Layers at both widths (#714, record 0174),
  // each handed to the rows rather than drawn beside them; their order is
  // the rows' own (MapRows.test.tsx).
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
    // The metric key over coloured markers, and the three layers that are on.
    const legend = () => screen.getByTestId('legend').dataset
    expect(legend().sections).toBe('4')
    expect(legend().sheet).toBe('false')
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false })} />)
    expect(legend().sections).toBe('4')
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
      unmount()
    }
  })

  // A desk's buttons, credit line and scale stand in the map's bottom-right
  // corner, and a phone's credit line and scale in its bottom-left one
  // (record 0174); each corner's slots reach the map together, and a width
  // change builds the other corner.
  it('hands the map a desk\'s corner, and a phone\'s line', () => {
    seen.mapView.length = 0
    const { container, rerender } = render(<MapStage {...props()} />)
    const desk = seen.mapView[seen.mapView.length - 1].cornerSlots as CornerSlots
    expect(Object.keys(desk)).toEqual(['credit', 'scale', 'buttons'])
    for (const slot of [desk.credit, desk.scale, ...Object.values(desk.buttons!)]) expect(container.contains(slot)).toBe(true)
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false })} />)
    const phone = seen.mapView[seen.mapView.length - 1].cornerSlots as CornerSlots
    expect(phone.buttons).toBeNull()
    for (const slot of [phone.credit, phone.scale]) expect(container.contains(slot)).toBe(true)
    expect(container.contains(desk.credit)).toBe(false)
    expect(container.querySelector('[data-map-overlay]')?.className).toBe(MAP_CORNER.phoneCredit)
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

  // The foot of a phone's map (#696): the notice band and the Analyze
  // button, the panel's own gate and command. A desk has neither.
  it('stands the Analyze button on a phone only, on the panel\'s gate and command', () => {
    const onAnalyze = vi.fn()
    const { rerender } = render(<MapStage {...props({ onAnalyze })} />)
    expect(screen.queryByTestId('foot')).toBeNull()
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, onAnalyze, analyzeEnabled: false })} />)
    expect((screen.getByRole('button', { name: 'Analyze' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, onAnalyze })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))
    expect(onAnalyze).toHaveBeenCalledOnce()
    // The word is App's (#736), the same one the panel's button reads.
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, actionWord: 'Try again' })} />)
    expect(screen.getByTestId('foot').dataset.word).toBe('Try again')
  })

  // The sheet moves the button (record 0135), which rides it, and so does the
  // notice band it rises over. The player stands on the button.
  it('rides the sheet, rises over the band, and carries the player', () => {
    const layout = { ...LAYOUT, sheetLiftPx: 104 }
    const timeline = { ...TIMELINE, timelineAxis: 'forecast' } as MapStageProps['timeline']
    render(<MapStage {...props({ isDesktop: false, sidebarOpen: false, layout, timeline })} />)
    const foot = () => screen.getByTestId('foot').dataset
    expect(foot().band).toBe(String(104 + CORNER_MARGIN_PX))
    expect(foot().fab).toBe(String(104 + FAB_INSET_PX))
    fireEvent.click(screen.getByRole('button', { name: 'Band' }))
    const risen = fabBottomPx(104, 40, 800)
    expect(foot().fab).toBe(String(risen))
    expect(risen).toBeGreaterThan(104 + FAB_INSET_PX)
    expect(screen.getByTestId('transport').dataset.lift).toBe(String(transportStandPx(risen)))
  })

  // A phone's credit line stands on the sheet's edge (record 0174): the band
  // stands over it folded or open, and the button over it only while the
  // credits are open, since folded it stands beside the button.
  it('stands the band over a phone\'s credit line, and the button over an open one', () => {
    const fire = stubResizeObserver()
    const layout = { ...LAYOUT, sheetLiftPx: 104 }
    const { container } = render(<MapStage {...props({ isDesktop: false, sidebarOpen: false, layout })} />)
    const line = container.querySelector('[data-map-overlay]')!
    const foot = () => screen.getByTestId('foot').dataset
    placeAt(line, { left: 0, top: 600, width: 152, height: 29 })
    act(() => fire())
    expect(foot().band).toBe(String(noticeBottomPx(104, 29)))
    expect(foot().fab).toBe(String(104 + FAB_INSET_PX))
    const credits = document.createElement('details')
    credits.className = `maplibregl-ctrl-attrib ${CREDITS_OPEN_CLASS}`
    line.firstElementChild!.append(credits)
    placeAt(line, { left: 0, top: 556, width: 348, height: 73 })
    act(() => fire())
    const open: PhoneLine = { px: 73, open: true }
    expect(foot().band).toBe(String(noticeBottomPx(104, 73)))
    expect(foot().fab).toBe(String(fabBottomPx(104, 0, 800, open)))
    expect(foot().fab).toBe(String(104 + 73 + FAB_INSET_PX))
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

  // The Controls sheet (record 0141) is a sheet the foot rides like the
  // results: the button stands on whichever edge is higher while it is up.
  it('rides the Controls sheet while it is up', () => {
    const layout = { ...LAYOUT, sheetLiftPx: 104 }
    const controlsPx = controlsSheetPx(800)
    const { rerender } = render(<MapStage {...props({ isDesktop: false, sidebarOpen: true, controlsPx, layout })} />)
    const fab = () => screen.getByTestId('foot').dataset.fab
    expect(fab()).toBe(String(controlsPx + FAB_INSET_PX))
    // Wherever a drag on its grip leaves it (record 0146).
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: true, controlsPx: 300, layout })} />)
    expect(fab()).toBe(String(300 + FAB_INSET_PX))
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, controlsPx, layout })} />)
    expect(fab()).toBe(String(104 + FAB_INSET_PX))
  })

  // A phone's credit line stands on the edge of whichever sheet stands
  // higher (record 0174), the Controls sheet's while it is up; a desk's on
  // the results' edge, as before.
  it("stands a phone's credit line on the sheet's edge", () => {
    const layout = { ...LAYOUT, sheetLiftPx: 104 }
    const { container, rerender } = render(<MapStage {...props({ layout })} />)
    const stage = () => container.firstElementChild as HTMLElement
    expect(stage().style.getPropertyValue('--map-corner-lift')).toBe(`${LAYOUT.mapCornerLift}px`)
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: false, layout })} />)
    expect(stage().style.getPropertyValue('--map-corner-lift')).toBe('104px')
    rerender(<MapStage {...props({ isDesktop: false, sidebarOpen: true, controlsPx: 300, layout })} />)
    expect(stage().style.getPropertyValue('--map-corner-lift')).toBe('300px')
  })
})
