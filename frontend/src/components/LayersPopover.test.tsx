import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import LayersPopover from './LayersPopover'
import { render } from '../testSupport/render'

// Every switch off, the grid allowed and off, and nothing spanning time.
const OVERLAYS = {
  showWildfires: false,
  setShowWildfires: () => {},
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

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
const rows = () => screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)

describe('LayersPopover', () => {
  it('opens on the button and closes on Escape and on a press outside', () => {
    render(<LayersPopover overlays={OVERLAYS} grid={GRID} playerOffered />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    open()
    expect(rows()).toHaveLength(6)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('checkbox')).toBeNull()
    open()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  // A press inside the popover is a choice, not a way out.
  it('stays open on a press inside it', () => {
    render(<LayersPopover overlays={OVERLAYS} grid={GRID} playerOffered />)
    open()
    fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'Smoke' }))
    expect(rows()).toHaveLength(6)
  })

  it('switches a layer through its setter', () => {
    const setShowSmoke = vi.fn()
    render(<LayersPopover overlays={{ ...OVERLAYS, setShowSmoke }} grid={GRID} playerOffered />)
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Smoke' }))
    expect(setShowSmoke).toHaveBeenCalledWith(true)
  })

  // Every row is always listed, so a switch never moves the rows under it;
  // a row out of play greys, and only the grid's says why.
  it('keeps every row and greys the ones out of play', () => {
    render(<LayersPopover overlays={OVERLAYS} grid={ARCHIVE} playerOffered={false} />)
    open()
    expect(rows()).toHaveLength(6)
    const grid = screen.getByRole('checkbox', { name: /^Forecast grid/ })
    expect((grid as HTMLInputElement).disabled).toBe(true)
    // The note's id is generated, since the tutorial's demo stands a second
    // popover in the page (#536); what matters is that the box points at it.
    const noteId = grid.getAttribute('aria-describedby')
    expect(noteId).toMatch(/-grid-note$/)
    expect(document.getElementById(noteId!)?.textContent).toBe(
      'The forecast grid is not available for archival data.',
    )
    const player = screen.getByRole('checkbox', { name: 'Forecast player' })
    expect((player as HTMLInputElement).disabled).toBe(true)
    expect(player.getAttribute('aria-describedby')).toBeNull()
  })

  it('shows the grid style and coverage only while the grid is on', () => {
    const { rerender } = render(<LayersPopover overlays={OVERLAYS} grid={GRID} playerOffered />)
    open()
    expect(screen.queryByRole('slider', { name: 'Coverage' })).toBeNull()
    rerender(<LayersPopover overlays={OVERLAYS} grid={GRID_ON} playerOffered />)
    expect(screen.getByRole('slider', { name: 'Coverage' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Blocks' }).getAttribute('aria-pressed')).toBe('true')
  })
})
