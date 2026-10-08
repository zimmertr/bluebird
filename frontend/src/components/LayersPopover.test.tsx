import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import LayersPopover from './LayersPopover'
import { render } from '../testSupport/render'
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
  setShowPlayer: () => {},
  playerShown: false,
}
const GRID = {
  gridAvailable: true,
  gridOn: false,
  gridStyle: 'blocks' as const,
  setGridStyle: () => {},
  gridReachFrac: 0.5,
  gridReachDraft: null,
  setGridReachDraft: () => {},
  commitGridReach: () => {},
  gridReachPitchKm: 3,
}
const GRID_ON = { ...GRID, gridOn: true }
const ARCHIVE = { ...GRID, gridAvailable: false }
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
    expect(rows()).toHaveLength(8)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('checkbox')).toBeNull()
    open()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  // A press inside the popover is a choice, not a way out.
  it('stays open on a press inside it', () => {
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered />)
    open()
    fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'Smoke' }))
    expect(rows()).toHaveLength(8)
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
    expect(rows()).toHaveLength(8)
    const grid = screen.getByRole('checkbox', { name: /^Forecast grid/ })
    expect((grid as HTMLInputElement).disabled).toBe(true)
    expect(grid.getAttribute('aria-describedby')).toBe('layer-grid-note')
    expect(document.getElementById('layer-grid-note')?.textContent).toBe(
      'The forecast grid is not available for archival data.',
    )
    const player = screen.getByRole('checkbox', { name: 'Forecast player' })
    expect((player as HTMLInputElement).disabled).toBe(true)
    expect(player.getAttribute('aria-describedby')).toBeNull()
  })

  // Each row drives its own layer, and no label carries a coverage note: the
  // row greys instead (below).
  it('lists both closure layers in their alphabetical places', () => {
    const setShowTrailClosures = vi.fn()
    render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={{ ...OVERLAYS, setShowTrailClosures }} grid={GRID} playerOffered />)
    open()
    expect(rows()).toEqual([
      'Area closures',
      'Forecast grid',
      'Forecast player',
      'Rain radar',
      'Smoke',
      'Snow depth',
      'Trail closures',
      'Wildfires',
    ])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trail closures' }))
    expect(setShowTrailClosures).toHaveBeenCalledWith(true)
  })

  // A layer with nothing to draw over the view greys, with no note, the way
  // the player does: over Colorado the two Forest Service rows grey and the
  // four national ones stay live; over the Alps every bounded row greys, a
  // checked one included, and the two Open-Meteo rows stay live.
  it('greys the rows whose layer cannot draw over the view', () => {
    const coverage = { wildfires: CONUS, areaClosures: OREGON_WASHINGTON, trailClosures: OREGON_WASHINGTON }
    const disabled = () =>
      screen
        .getAllByRole('checkbox')
        .filter((c) => (c as HTMLInputElement).disabled)
        .map((c) => c.closest('label')?.textContent)
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
    expect(disabled()).toEqual(['Area closures', 'Rain radar', 'Smoke', 'Snow depth', 'Trail closures', 'Wildfires'])
    const fires = screen.getByRole('checkbox', { name: 'Wildfires' }) as HTMLInputElement
    expect([fires.checked, fires.getAttribute('aria-describedby')]).toEqual([true, null])
  })

  it('shows the grid style and coverage only while the grid is on', () => {
    const { rerender } = render(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID} playerOffered />)
    open()
    expect(screen.queryByRole('slider', { name: 'Coverage' })).toBeNull()
    rerender(<LayersPopover mapRef={MAP} coverage={COVERAGE} overlays={OVERLAYS} grid={GRID_ON} playerOffered />)
    expect(screen.getByRole('slider', { name: 'Coverage' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Blocks' }).getAttribute('aria-pressed')).toBe('true')
  })
})
