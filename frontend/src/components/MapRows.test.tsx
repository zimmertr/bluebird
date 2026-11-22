import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import MapRows from './MapRows'
import type { SearchBoxHandle } from './SearchBox'
import { render } from '../testSupport/render'

// The search has a suite of its own; what this one needs from it is the
// report that the field has the keyboard, and that it gave it up.
vi.mock('./SearchBox', () => ({
  default: (props: { onExpandedChange: (expanded: boolean) => void }) => (
    <>
      <button onClick={() => props.onExpandedChange(true)}>Search</button>
      <button onClick={() => props.onExpandedChange(false)}>Leave</button>
    </>
  ),
}))

const BAR = (
  <div role="group" aria-label="Forecast">
    <button data-card="forecast">Sat 21</button>
  </div>
)

function rows(over: Partial<Parameters<typeof MapRows>[0]> = {}) {
  return (
    <MapRows
      searchBoxRef={createRef<SearchBoxHandle>()}
      onSearchSelect={() => {}}
      searchPointed={false}
      onLocateSlot={() => {}}
      onTerrainSlot={() => {}}
      onCompassSlot={() => {}}
      desk={false}
      sidebarOpen={false}
      legend={<button>Legend</button>}
      bar={BAR}
      tools={<button>Layers</button>}
      {...over}
    />
  )
}

describe('MapRows on a phone', () => {
  // Analyze is the foot's Forecast button on a phone (record 0329), never a chip.
  it('carries the bar and the Legend chip, and no Analyze', () => {
    render(rows())
    expect(screen.getByRole('group', { name: 'Forecast' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Legend' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Analyz/ })).toBeNull()
  })

  // The bar's When phrase takes the keyboard back when the sheet's Done goes
  // inert under it (record 0328).
  it('hands the keyboard to the When phrase when the sheet shuts', () => {
    const page = (open: boolean) => (
      <>
        <aside inert={!open}>
          <button>Done</button>
        </aside>
        {rows({ sidebarOpen: open })}
      </>
    )
    const { rerender } = render(page(true))
    screen.getByRole('button', { name: 'Done' }).focus()
    rerender(page(false))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sat 21' }))
  })

  // The tool column (record 0331): the search button, the tools it is handed,
  // then the 3D, locate and compass slots the map stands its own buttons in.
  it('stands the search button, the tools and the three slots in one column', () => {
    const onTerrainSlot = vi.fn()
    const onLocateSlot = vi.fn()
    const onCompassSlot = vi.fn()
    render(rows({ onTerrainSlot, onLocateSlot, onCompassSlot }))
    const column = screen.getByRole('button', { name: 'Search for a place' }).parentElement!
    const terrain = onTerrainSlot.mock.calls[0][0] as HTMLDivElement
    const locate = onLocateSlot.mock.calls[0][0] as HTMLDivElement
    const compass = onCompassSlot.mock.calls[0][0] as HTMLDivElement
    expect([...column.children]).toEqual([
      screen.getByRole('button', { name: 'Search for a place' }),
      screen.getByRole('button', { name: 'Layers' }),
      terrain,
      locate,
      compass,
    ])
    // Not in the rows, which stand over the sheet's layer where the column stands under it.
    expect(column.parentElement).not.toBe(screen.getByRole('button', { name: 'Legend' }).closest('[data-map-overlay]'))
  })

  // The search button opens the field over the bar, which goes once it has
  // had the keyboard and gives it up; Escape hands the keyboard back.
  it('opens the place search over the bar, and shuts it when the field lets go', () => {
    render(rows())
    const open = screen.getByRole('button', { name: 'Search for a place' })
    expect(open.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    fireEvent.click(open)
    expect(open.getAttribute('aria-pressed')).toBe('true')
    // A report that the field is shut before it was open closes nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    fireEvent.click(open)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    expect(document.activeElement).toBe(open)
  })

  // A full-screen results sheet stands over the rows and the column (#837):
  // they stay where they are, mounted so the map keeps its slots, and out of reach.
  it('goes out of reach while covered, and keeps its slots', () => {
    const onLocateSlot = vi.fn()
    const { container, rerender } = render(rows({ onLocateSlot }))
    const parts = () => [...container.children] as HTMLElement[]
    expect(parts()).toHaveLength(2)
    expect(parts().some((p) => p.hasAttribute('inert'))).toBe(false)
    rerender(rows({ onLocateSlot, covered: true }))
    expect(parts().every((p) => p.hasAttribute('inert'))).toBe(true)
    expect(onLocateSlot).toHaveBeenCalledTimes(1)
  })
})

describe('MapRows at a desk', () => {
  // The bar stands on its row and the card a chip opened under the chips
  // (record 0309); the search is in the Where card (record 0313).
  it('stands the bar and its card, with no search and no tool column', () => {
    render(rows({ desk: true, barCard: <div>card</div> }))
    expect(screen.getByRole('group', { name: 'Forecast' })).toBeTruthy()
    expect(screen.getByText('card')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Search for a place' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Layers' })).toBeNull()
  })

  // A desk's map buttons stand in the map's corner (record 0174), so its rows
  // hand up no slot for any of them.
  it('hands up no slot for the locate button, the 3D button or the compass', () => {
    const onLocateSlot = vi.fn()
    const onTerrainSlot = vi.fn()
    const onCompassSlot = vi.fn()
    render(rows({ desk: true, onLocateSlot, onTerrainSlot, onCompassSlot }))
    expect(onLocateSlot).not.toHaveBeenCalled()
    expect(onTerrainSlot).not.toHaveBeenCalled()
    expect(onCompassSlot).not.toHaveBeenCalled()
  })
})
