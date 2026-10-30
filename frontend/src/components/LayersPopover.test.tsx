import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import LayersPopover from './LayersPopover'
import { render } from '../testSupport/render'
import { ACCENT, CHOICE_INPUT, LAYER_ROW, MAP_CHIP_MENU, MENU, MENU_CHEVRON, MENU_GROUP, SHEET_ASIDE } from '../styles'
import { IconChevron } from './icons'
import { DEFAULT_BASE_OPACITY } from '../utils/baseMapOpacity'
import type { ViewBounds } from '../utils/layerCoverage'

// Every switch off, the grid allowed and off, and nothing spanning time.
const OVERLAYS = {
  showWildfires: false,
  setShowWildfires: () => {},
  showAreaClosures: false,
  setShowAreaClosures: () => {},
  showTrailClosures: false,
  setShowTrailClosures: () => {},
  showRadar: false,
  setShowRadar: () => {},
  showSmoke: false,
  setShowSmoke: () => {},
  showSnow: false,
  setShowSnow: () => {},
  showGrid: false,
  setShowGrid: () => {},
  showContours: false,
  setShowContours: () => {},
  showRelief: false,
  setShowRelief: () => {},
  showSlope: false,
  setShowSlope: () => {},
  showSatellite: false,
  setShowSatellite: () => {},
  showFireActivity: false,
  setShowFireActivity: () => {},
  showTerrain: false,
  setShowTerrain: () => {},
  setShowPlayer: () => {},
  playerShown: false,
  baseOpacity: DEFAULT_BASE_OPACITY,
  setBaseOpacity: () => {},
}
const GRID = {
  gridOffered: true,
  gridArchived: false,
  gridOn: false,
  gridStyle: 'blocks' as const,
  setGridStyle: () => {},
  gridReachFrac: 0.5,
  gridReachDraft: null,
  setGridReachDraft: () => {},
  commitGridReach: () => {},
  resetGridReach: () => {},
  gridReachPitchKm: 3,
}
const GRID_ON = { ...GRID, gridOn: true }
const ARCHIVE = { ...GRID, gridOffered: false, gridArchived: true }
// No report yet, or one whose ranked metric has no number anywhere (#803, M5).
const NOTHING_TO_GRID = { ...GRID, gridOffered: false }
// No map yet and no outlines published, which is every row live.
const MAP = { current: null }
const COVERAGE = {}

// A map parked over one view, reported once to whoever watches it.
function mapOver(west: number, south: number, east: number, north: number) {
  const bounds: ViewBounds = {
    getWest: () => west,
    getSouth: () => south,
    getEast: () => east,
    getNorth: () => north,
  }
  const unwatch = vi.fn()
  const watchBounds = vi.fn((onBounds: (b: ViewBounds) => void) => {
    onBounds(bounds)
    return unwatch
  })
  return { ref: { current: { watchBounds } }, watchBounds, unwatch }
}
// One-ring outlines standing in for the server's: Oregon and Washington for
// the two closure feeds, the contiguous states for the fires.
const OREGON_WASHINGTON = {
  type: 'MultiPolygon' as const,
  coordinates: [[[[-125, 42], [-116.5, 42], [-116.5, 49], [-125, 49], [-125, 42]]]],
}
const CONUS = {
  type: 'MultiPolygon' as const,
  coordinates: [[[[-125, 24], [-66, 24], [-66, 49], [-125, 49], [-125, 24]]]],
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
const rows = () => screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)
// The rows that read as out of play: a disabled box, or a greyed one still
// ticked and live for unticking (#803, M9).
const greyed = () =>
  screen
    .getAllByRole('checkbox')
    .filter((c) => (c as HTMLInputElement).disabled || c.closest('label')!.hasAttribute('data-greyed'))
    .map((c) => c.closest('label')?.textContent)

// The points `IconChevron` draws for one direction, read off the icon itself
// so the chip's tests do not restate its geometry.
function chevronPoints(up: boolean): string | null {
  const { container, unmount } = render(<IconChevron up={up} />)
  const points = container.querySelector('polyline')!.getAttribute('points')
  unmount()
  return points
}

describe('LayersPopover', () => {
  // The menu unmounts under a keyboard that was in it, so Escape hands the
  // focus back to the button that opened it rather than to the body (#576).
  it('hands the keyboard back to its button when Escape closes it', async () => {
    const { user } = render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered />)
    await user.click(screen.getByRole('button', { name: 'Layers' }))
    screen.getAllByRole('checkbox')[0].focus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Layers' }))
  })

  it('opens on the button and closes on Escape and on a press outside', () => {
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    open()
    expect(rows()).toHaveLength(13)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('checkbox')).toBeNull()
    open()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  // The menu stands under the chip as a whole card, 8px down, and the chip
  // keeps its pill and is lit while it is out (#714; TJ, 2026-10-18).
  it('lights the chip while its menu stands under it', () => {
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered />)
    const button = screen.getByRole('button', { name: 'Layers' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const points = () => button.querySelector('svg polyline')!.getAttribute('points')
    expect(button.querySelector('svg')!.classList).toContain(MENU_CHEVRON.chip)
    expect(points()).toBe(chevronPoints(false))
    open()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    // The menu drops from the chip, and the chevron says so (TJ, 2026-10-18).
    expect(points()).toBe(chevronPoints(true))
    const menu = screen.getByRole('checkbox', { name: 'Smoke' }).closest('[data-tour="layers-menu"]') as HTMLElement
    for (const cls of MAP_CHIP_MENU.split(' ')) expect(menu.classList).toContain(cls)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(points()).toBe(chevronPoints(false))
  })

  // A press inside the popover is a choice, not a way out.
  it('stays open on a press inside it', () => {
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered />)
    open()
    fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'Smoke' }))
    expect(rows()).toHaveLength(13)
  })

  // A press with Shift held reaches every row from the last pressed to this
  // one (record 0209), switching each that differs from the pressed box, and
  // a greyed row in the run stays as it is.
  it('switches every layer between the last press and a Shift-click, but a greyed one', () => {
    const setShowAreaClosures = vi.fn()
    const setShowGrid = vi.fn()
    const setShowPlayer = vi.fn()
    const setShowRadar = vi.fn()
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, setShowAreaClosures, setShowGrid, setShowPlayer, setShowRadar }}
        grid={ARCHIVE}
        playerOffered
      />,
    )
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Area closures' }))
    expect(setShowAreaClosures).toHaveBeenCalledWith(true)
    // Down the list from Hazards into Forecast: the run takes no notice of
    // the heading between them (record 0249).
    fireEvent.click(screen.getByRole('checkbox', { name: 'Forecast player' }), { shiftKey: true })
    expect(setShowPlayer).toHaveBeenCalledWith(true)
    expect(setShowRadar).toHaveBeenCalledWith(true)
    // The grid is greyed for an archive window, and the run crosses it.
    expect(setShowGrid).not.toHaveBeenCalled()
  })

  it('switches a layer through its setter', () => {
    const setShowSmoke = vi.fn()
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={{ ...OVERLAYS, setShowSmoke }} grid={GRID} playerOffered />)
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Smoke' }))
    expect(setShowSmoke).toHaveBeenCalledWith(true)
  })

  // Every row is always listed, so a switch never moves the rows under it;
  // a row out of play greys, and only the grid's says why.
  it('keeps every row and greys the ones out of play', () => {
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={ARCHIVE} playerOffered={false} />)
    open()
    expect(rows()).toHaveLength(13)
    // The reason is what a reader hears with the row, since its title does
    // not exist on touch.
    const grid = screen.getByRole('checkbox', {
      name: /^Forecast grid/,
      description: 'The forecast grid is not available for archival data.',
    })
    expect((grid as HTMLInputElement).disabled).toBe(true)
    const player = screen.getByRole('checkbox', { name: 'Forecast player', description: '' })
    expect((player as HTMLInputElement).disabled).toBe(true)
  })

  // A row a press acts on lights under the pointer, as every menu row does
  // (record 0201); a greyed one takes no fill, and a phone's sheet none at all.
  it('lights every live row under the pointer and no greyed one', () => {
    // The fill is the row's, the checkbox's label and a base-map row's slider both.
    const fill = (name: RegExp | string) =>
      screen.getByRole('checkbox', { name }).closest('label')!.parentElement!.className.split(' ').includes(MENU.hover)
    const { unmount } = render(
      <LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={ARCHIVE} playerOffered={false} />,
    )
    open()
    expect(fill('Smoke')).toBe(true)
    expect(fill(/^Forecast grid/)).toBe(false)
    expect(fill('Forecast player')).toBe(false)
    unmount()
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered sheet />)
    open()
    expect(fill('Smoke')).toBe(false)
  })

  // Three groups by what a layer changes, the ground first, each under its
  // heading and each a group to a screen reader named by it, the rows by
  // kind inside (record 0249). Each row drives its own layer, and no label
  // carries a coverage note: the row greys instead (below).
  it('lists the layers in three named groups, ordered by kind', () => {
    const setShowTrailClosures = vi.fn()
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={{ ...OVERLAYS, setShowTrailClosures }} grid={GRID} playerOffered />)
    open()
    const groups = screen.getAllByRole('group')
    const rowsOf = (group: HTMLElement) =>
      [...group.querySelectorAll('input[type="checkbox"]')].map((c) => c.closest('label')?.textContent)
    expect(groups).toEqual(['Base map', 'Hazards', 'Forecast'].map((name) => screen.getByRole('group', { name })))
    expect(groups.map(rowsOf)).toEqual([
      ['Satellite', 'Topographic', 'Shaded relief', 'Slope angle'],
      ['Active wildfires', 'Fire activity', 'Smoke', 'Area closures', 'Trail closures'],
      ['Rain radar', 'Snow depth', 'Forecast grid', 'Forecast player'],
    ])
    // The heading is the first thing in its group, with no box of its own.
    expect(groups[0].firstElementChild!.className).toBe(MENU_GROUP.cardHeading)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trail closures' }))
    expect(setShowTrailClosures).toHaveBeenCalledWith(true)
  })

  // On a phone's sheet the groups and headings are the same, the heading in
  // its sheet shape and every row one row of the sheet.
  it('groups the sheet the same way', () => {
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID_ON} playerOffered sheet />)
    open()
    const groups = screen.getAllByRole('group')
    expect(groups.map((g) => g.className)).toEqual([MENU_GROUP.sheet, MENU_GROUP.sheet, MENU_GROUP.sheet])
    expect(groups.map((g) => g.firstElementChild!.textContent)).toEqual(['Base map', 'Hazards', 'Forecast'])
    expect(groups[2].firstElementChild!.className).toBe(MENU_GROUP.sheetHeading)
    // The grid's style and coverage stand inside its own row of the sheet.
    const grid = screen.getByRole('checkbox', { name: 'Forecast grid' }).closest('label')!.parentElement!.parentElement!
    expect(grid.className).toBe(MENU_GROUP.sheetRow)
    expect(grid.querySelector('input[type="range"]')).not.toBeNull()
    expect(rows()).toHaveLength(13)
  })

  // A layer with nothing to draw over the view greys, with no note, the way
  // the player does: over Colorado the two Forest Service rows grey and the
  // four national ones stay live; over the Alps every bounded row greys, a
  // checked one included, and the two Open-Meteo rows, the four ground
  // layers and the fire detections (#799), which cover the world, stay live.
  it('greys the rows whose layer cannot draw over the view', () => {
    const coverage = { wildfires: CONUS, areaClosures: OREGON_WASHINGTON, trailClosures: OREGON_WASHINGTON }
    const disabled = greyed
    const colorado = mapOver(-109, 37, -102, 41)
    const { unmount } = render(
      <LayersPopover mapRef={colorado.ref} coverage={coverage} overlays={OVERLAYS} grid={GRID} playerOffered />,
    )
    expect(colorado.watchBounds).not.toHaveBeenCalled()
    open()
    expect(disabled()).toEqual(['Area closures', 'Trail closures'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(colorado.unwatch).toHaveBeenCalledTimes(1)
    unmount()

    const alps = mapOver(6, 45, 12, 48)
    render(
      <LayersPopover
        mapRef={alps.ref}
        coverage={coverage}
        overlays={{ ...OVERLAYS, showWildfires: true }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    expect(disabled()).toEqual(['Active wildfires', 'Smoke', 'Area closures', 'Trail closures', 'Rain radar', 'Snow depth'])
    const fires = screen.getByRole('checkbox', { name: 'Active wildfires' }) as HTMLInputElement
    expect([fires.checked, fires.getAttribute('aria-describedby')]).toEqual([true, null])
  })

  // The three ground layers (#799) each drive their own switch, and the 3D
  // terrain is the map's own button rather than a row.
  it('switches the contours, satellite and shaded relief from their own rows', () => {
    const setShowContours = vi.fn()
    const setShowSatellite = vi.fn()
    const setShowRelief = vi.fn()
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, setShowContours, setShowSatellite, setShowRelief, showRelief: true }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Topographic' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Satellite' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Shaded relief' }))
    expect(setShowContours).toHaveBeenCalledWith(true)
    expect(setShowSatellite).toHaveBeenCalledWith(true)
    expect(setShowRelief).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('checkbox', { name: /3D|terrain/i })).toBeNull()
  })

  // The fire detections (#799): FIRMS's global files cover every view, so the
  // row switches anywhere and never greys.
  it('switches fire activity from its own row', () => {
    const setShowFireActivity = vi.fn()
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, setShowFireActivity }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    const row = screen.getByRole('checkbox', { name: 'Fire activity' }) as HTMLInputElement
    expect(row.disabled).toBe(false)
    fireEvent.click(row)
    expect(setShowFireActivity).toHaveBeenCalledWith(true)
  })

  // The slope angle shading (#799): drawn from the same worldwide elevation as
  // the relief, so its row switches anywhere and never greys, over the Alps
  // included, where every bounded row does.
  it('switches slope angle from its own row', () => {
    const setShowSlope = vi.fn()
    const coverage = { wildfires: CONUS, areaClosures: OREGON_WASHINGTON, trailClosures: OREGON_WASHINGTON }
    render(
      <LayersPopover
        mapRef={mapOver(6, 45, 12, 48).ref}
        coverage={coverage}
        overlays={{ ...OVERLAYS, showSlope: true, setShowSlope }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    const row = screen.getByRole('checkbox', { name: 'Slope angle' }) as HTMLInputElement
    expect([row.checked, row.disabled]).toEqual([true, false])
    fireEvent.click(row)
    expect(setShowSlope).toHaveBeenCalledWith(false)
  })

  // A checked layer that greys keeps its box live for unticking (#803, M9):
  // it used to be disabled with the tick in it, so the layer stayed on with
  // no way to switch it off. Unticked, it is disabled like any greyed row, and
  // a Shift run never ticks it either.
  it('lets a greyed row be unticked, and never ticked', () => {
    const coverage = { wildfires: CONUS }
    const setShowWildfires = vi.fn()
    const alps = mapOver(6, 45, 12, 48)
    const { rerender } = render(
      <LayersPopover
        mapRef={alps.ref}
        coverage={coverage}
        overlays={{ ...OVERLAYS, showWildfires: true, setShowWildfires }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    const fires = () => screen.getByRole('checkbox', { name: 'Active wildfires' }) as HTMLInputElement
    expect([fires().checked, fires().disabled]).toEqual([true, false])
    expect(fires().closest('label')!.hasAttribute('data-greyed')).toBe(true)
    // Live, so nothing tells assistive tech it is unavailable: its box alone
    // fades (`CHOICE_ROW`), and the label keeps the ink a live control owes.
    expect(fires().closest('[aria-disabled]')).toBeNull()
    // A press still acts on it, so its row lights under the pointer.
    expect(fires().closest('label')!.parentElement!.className.split(' ')).toContain(MENU.hover)
    fireEvent.click(fires())
    expect(setShowWildfires).toHaveBeenCalledExactlyOnceWith(false)
    rerender(
      <LayersPopover
        mapRef={alps.ref}
        coverage={coverage}
        overlays={{ ...OVERLAYS, showWildfires: false, setShowWildfires }}
        grid={GRID}
        playerOffered
      />,
    )
    expect([fires().checked, fires().disabled]).toEqual([false, true])
    expect(fires().closest('label')!.hasAttribute('data-greyed')).toBe(false)
  })

  it('unticks a greyed row in a Shift run, and ticks none', () => {
    const setShowGrid = vi.fn()
    const setShowPlayer = vi.fn()
    const setShowAreaClosures = vi.fn()
    const overlays = { ...OVERLAYS, showAreaClosures: true, showGrid: true, playerShown: true }
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...overlays, setShowAreaClosures, setShowGrid, setShowPlayer }}
        grid={ARCHIVE}
        playerOffered
      />,
    )
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Area closures' }))
    expect(setShowAreaClosures).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Forecast player' }), { shiftKey: true })
    // The grid is greyed under an archive report and still ticked: the run
    // unticks it with the rest.
    expect(setShowGrid).toHaveBeenCalledWith(false)
    expect(setShowPlayer).toHaveBeenCalledWith(false)
  })

  // With nothing to grid (no report yet, or a ranked metric with no number
  // anywhere) the row greys like the player's, ticked or not, with no note
  // (#803, M5): the archive's sentence is for the archive alone.
  it('greys the grid row with nothing to grid, saying nothing', () => {
    const { rerender } = render(
      <LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={NOTHING_TO_GRID} playerOffered />,
    )
    open()
    const grid = () => screen.getByRole('checkbox', { name: 'Forecast grid' }) as HTMLInputElement
    expect(grid().disabled).toBe(true)
    expect(grid().getAttribute('aria-describedby')).toBeNull()
    expect(grid().closest('label')!.getAttribute('title')).toBeNull()
    // Ticked (`?grid=smooth`, or before Analyze): greyed, live for unticking,
    // its style and coverage greyed with it.
    rerender(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, showGrid: true }}
        grid={{ ...NOTHING_TO_GRID, gridOn: true }}
        playerOffered
      />,
    )
    expect(greyed()).toEqual(['Forecast grid'])
    expect(grid().checked).toBe(true)
    expect((screen.getByRole('slider', { name: 'Coverage' }) as HTMLInputElement).disabled).toBe(true)
  })

  // The grid's style and coverage stand on its own row, at the right where a
  // Base map row carries its opacity slider. Like those sliders they stand while the grid is off, and using
  // one switches the grid on.
  // A double-click on any slider puts it back where it starts, 50%.
  it('puts every slider back at its start on a double-click', () => {
    const setBaseOpacity = vi.fn()
    const resetGridReach = vi.fn()
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, setBaseOpacity }}
        grid={{ ...GRID, resetGridReach }}
        playerOffered
      />,
    )
    open()
    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Satellite opacity' }))
    expect(setBaseOpacity).toHaveBeenLastCalledWith('satellite', 50)
    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Coverage' }))
    expect(resetGridReach).toHaveBeenCalledOnce()
  })

  it("puts the grid's coverage on its row, live while it is off", () => {
    const setShowGrid = vi.fn()
    const setGridReachDraft = vi.fn()
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, setShowGrid }}
        grid={{ ...GRID, setGridReachDraft }}
        playerOffered
      />,
    )
    open()
    const row = screen.getByRole('checkbox', { name: 'Forecast grid' }).closest('label')!.parentElement!
    const coverage = screen.getByRole('slider', { name: 'Coverage' })
    expect(row.contains(coverage)).toBe(true)
    // The style switches in the legend, not here.
    expect(screen.queryByRole('button', { name: /^Grid style: / })).toBeNull()
    fireEvent.change(coverage, { target: { value: '80' } })
    expect(setGridReachDraft).toHaveBeenCalledWith(0.8)
    expect(setShowGrid).toHaveBeenCalledWith(true)
  })

  // A phone's Layers is a chip, and its menu a bottom sheet (#696; record
  // 0136): the same rows, each layer one row of the sheet, closed by the
  // sheet's own ways out rather than the popover's press outside.
  it('opens the rows in a sheet on a phone, lit while open', () => {
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered sheet />)
    const chip = screen.getByRole('button', { name: 'Layers' })
    // A sheet rises from below, so a phone's chip carries no chevron.
    expect(chip.querySelector('svg')).toBeNull()
    open()
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Layers' })).toBeTruthy()
    expect(rows()).toHaveLength(13)
    // A press in the sheet, which is in a portal outside the chip's column,
    // is not a press outside the menu.
    fireEvent.pointerDown(screen.getAllByRole('checkbox')[0])
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chip.getAttribute('aria-expanded')).toBe('false')
  })

  // The tutorial holds a phone's sheet open for its Layers card (#696;
  // record 0153), framed under the menu's anchor, and leaves the keyboard
  // with the tour's card: the sheet takes no focus.
  it('opens the sheet for the tutorial without taking the keyboard', () => {
    const before = document.body.appendChild(document.createElement('button'))
    before.focus()
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered sheet forcedOpen />)
    expect(screen.getByRole('dialog').dataset.tour).toBe('layers-menu')
    expect(document.activeElement).toBe(before)
    expect(screen.getByRole('button', { name: 'Layers' }).dataset.tour).toBe('layers')
    before.remove()
  })
  // Every row's switch is the menu's own checkbox, named by its row, checked
  // while its layer is on (record 0250 tried an eye here and took it back).
  it('draws every row\'s switch as the menu\'s checkbox', () => {
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, showSatellite: true, showSmoke: true }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(13)
    for (const box of boxes) {
      expect(box.className).toBe(CHOICE_INPUT)
      expect(box.closest('label')!.querySelector('svg')).toBeNull()
    }
    expect(boxes.filter((b) => b.checked).map((b) => b.closest('label')!.textContent)).toEqual(['Satellite', 'Smoke'])
  })

  // An opacity slider on the four Base map rows alone, at its row's right,
  // reading its level and the word; none on a Hazards or Forecast row.
  it('carries an opacity slider on each base-map row and on no other', () => {
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, baseOpacity: { ...DEFAULT_BASE_OPACITY, slope: 70 } }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    const sliders = screen.getAllByRole('slider', { name: /opacity$/ }) as HTMLInputElement[]
    expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Satellite opacity',
      'Topographic opacity',
      'Shaded relief opacity',
      'Slope angle opacity',
    ])
    expect(sliders.map((s) => s.value)).toEqual(['50', '50', '50', '70'])
    const slope = sliders[3].parentElement!
    expect(slope.textContent).toBe('70%Opacity70%Opacity')
    expect(slope.className).toContain(LAYER_ROW.slider)
    // In the same row as its checkbox, after it.
    const row = screen.getByRole('checkbox', { name: 'Slope angle' }).closest('label')!.parentElement!
    expect(row.lastElementChild).toBe(slope)
    expect(screen.getByRole('group', { name: 'Hazards' }).querySelector('input[type="range"]')).toBeNull()
  })

  // A slider looks the same whether its layer is on or off, and keeps its
  // level while off (record 0250).
  it('draws an off layer\'s slider as an on one\'s and keeps its level', () => {
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, showRelief: true, baseOpacity: { ...DEFAULT_BASE_OPACITY, topo: 20 } }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    const fillOf = (name: string) =>
      (screen.getByRole('slider', { name: `${name} opacity` }).previousElementSibling as HTMLElement).className
    expect(fillOf('Shaded relief')).toBe(`absolute inset-0 ${ACCENT.fill}`)
    expect(fillOf('Topographic')).toBe(`absolute inset-0 ${ACCENT.fill}`)
    expect((screen.getByRole('slider', { name: 'Topographic opacity' }) as HTMLInputElement).value).toBe('20')
  })

  // A level is set through the hook's one setter. A drag on an off layer's
  // slider checks its box at the level it sets, as a muted volume slider
  // unmutes.
  it('sets a level, and switches an off layer on as its slider moves', () => {
    const setBaseOpacity = vi.fn()
    const setShowSlope = vi.fn()
    const setShowSatellite = vi.fn()
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, showSatellite: true, setBaseOpacity, setShowSlope, setShowSatellite }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    fireEvent.change(screen.getByRole('slider', { name: 'Satellite opacity' }), { target: { value: '80' } })
    expect(setBaseOpacity).toHaveBeenLastCalledWith('satellite', 80)
    expect(setShowSatellite).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('slider', { name: 'Slope angle opacity' }), { target: { value: '35' } })
    expect(setBaseOpacity).toHaveBeenLastCalledWith('slope', 35)
    expect(setShowSlope).toHaveBeenCalledWith(true)
  })

  // The Shift range runs from the Base map rows into Hazards like any other,
  // and the sliders between the boxes are no part of it (record 0227).
  it('runs a Shift range from the base map into the hazards', () => {
    const setShowContours = vi.fn()
    const setShowRelief = vi.fn()
    const setShowSlope = vi.fn()
    const setShowWildfires = vi.fn()
    const setShowSmoke = vi.fn()
    render(
      <LayersPopover
        mapRef={MAP}
        coverage={COVERAGE}
        overlays={{ ...OVERLAYS, setShowContours, setShowRelief, setShowSlope, setShowWildfires, setShowSmoke }}
        grid={GRID}
        playerOffered
      />,
    )
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Topographic' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active wildfires' }), { shiftKey: true })
    for (const set of [setShowContours, setShowRelief, setShowSlope, setShowWildfires]) {
      expect(set).toHaveBeenCalledWith(true)
    }
    expect(setShowSmoke).not.toHaveBeenCalled()
  })

  // On a phone the sheet steps aside while a finger drags a slider: the dim
  // lifts, the card goes, the dragged row stays; on release all comes back.
  // At a desk the card stands where it is.
  it('steps the sheet aside while a slider is dragged on a phone', () => {
    const { unmount } = render(
      <LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered sheet />,
    )
    open()
    const sheet = screen.getByRole('dialog', { name: 'Layers' })
    const slider = screen.getByRole('slider', { name: 'Shaded relief opacity' })
    const block = (input: HTMLElement) => input.closest(`.${MENU_GROUP.sheetRow}`)!
    const kept = () =>
      screen.getAllByRole('checkbox').filter((c) => block(c).className.includes(SHEET_ASIDE.keep))
    expect(sheet.className).not.toContain(SHEET_ASIDE.card)
    fireEvent.pointerDown(slider, { pointerId: 1 })
    expect(sheet.className).toContain(SHEET_ASIDE.card)
    expect(kept().map((c) => c.closest('label')!.textContent)).toEqual(['Shaded relief'])
    fireEvent.pointerUp(slider, { pointerId: 1 })
    expect(sheet.className).not.toContain(SHEET_ASIDE.card)
    expect(kept()).toEqual([])
    fireEvent.pointerDown(slider, { pointerId: 1 })
    fireEvent.pointerCancel(slider, { pointerId: 1 })
    expect(sheet.className).not.toContain(SHEET_ASIDE.card)
    unmount()

    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered />)
    open()
    const desk = screen.getByRole('slider', { name: 'Shaded relief opacity' })
    fireEvent.pointerDown(desk, { pointerId: 1 })
    expect(desk.closest('[data-tour="layers-menu"]')!.className).not.toContain(SHEET_ASIDE.card)
  })
})
