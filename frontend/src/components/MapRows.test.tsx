import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import MapRows from './MapRows'
import type { SearchBoxHandle } from './SearchBox'
import { render } from '../testSupport/render'

// The search has a suite of its own; what this one needs from it is the
// report that the field has the keyboard, which steps the chip row aside.
vi.mock('./SearchBox', () => ({
  default: (props: { onExpandedChange: (expanded: boolean) => void }) => (
    <>
      <button onClick={() => props.onExpandedChange(true)}>Search</button>
      <button onClick={() => props.onExpandedChange(false)}>Leave</button>
    </>
  ),
}))

function rows(over: Partial<Parameters<typeof MapRows>[0]> = {}) {
  return (
    <MapRows
      searchBoxRef={createRef<SearchBoxHandle>()}
      onSearchSelect={() => {}}
      searchPointed={false}
      onLocateSlot={() => {}}
      onCompassSlot={() => {}}
      desk={false}
      sidebarOpen={false}
      onOpenControls={() => {}}
      onCloseControls={() => {}}
      controlsSummary="Current · NOAA GFS"
      layers={<button>Layers</button>}
      legend={<button>Legend</button>}
      {...over}
    />
  )
}

describe('MapRows', () => {
  // The summary chip opens the panel under the name the panel's own button
  // carried, and reads its summary out as its description.
  it('opens the panel from the summary chip, which carries the summary', () => {
    const onOpenControls = vi.fn()
    render(rows({ onOpenControls }))
    const chip = screen.getByRole('button', { name: 'Open controls', description: 'Current · NOAA GFS' })
    expect(chip.textContent).toBe('Current · NOAA GFS')
    fireEvent.click(chip)
    expect(onOpenControls).toHaveBeenCalledOnce()
  })

  // A phone's chip lowers the Controls sheet it raised, lit while it is up.
  it('lowers a phone\'s Controls sheet from the same chip', () => {
    const onCloseControls = vi.fn()
    render(rows({ sidebarOpen: true, onCloseControls }))
    const chip = screen.getByRole('button', { name: 'Open controls' })
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(chip)
    expect(onCloseControls).toHaveBeenCalledOnce()
  })

  it('stands the Layers and Legend chips it is handed after the summary', () => {
    render(rows())
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.slice(-3)).toEqual(['Open controls', 'Layers', 'Legend'])
  })

  // Analyze is the panel's at a desk and the floating button's on a phone
  // (record 0135), never a chip.
  it('carries no Analyze', () => {
    render(rows())
    expect(screen.queryByRole('button', { name: /^Analyz/ })).toBeNull()
  })

  // While the field has the keyboard the pill takes the row and the chips
  // step aside, kept mounted so their state survives.
  it('hides the chips while the search is open, and brings them back', () => {
    render(rows())
    const chips = screen.getByRole('button', { name: 'Open controls' }).parentElement!
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(chips.className).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(chips.className).not.toBe('hidden')
  })

  it('hands up the slot the map stands its locate button in', () => {
    const onLocateSlot = vi.fn()
    render(rows({ onLocateSlot }))
    expect(onLocateSlot).toHaveBeenCalledWith(expect.any(HTMLDivElement))
  })

  // The compass's, at the chip row's right end under the locate button
  // (record 0147).
  it('hands up the compass\'s slot at the end of the chip row', () => {
    const onCompassSlot = vi.fn()
    render(rows({ onCompassSlot }))
    const slot = onCompassSlot.mock.calls[0][0] as HTMLDivElement
    expect(slot.parentElement).toBe(screen.getByRole('button', { name: 'Open controls' }).parentElement)
    expect(slot.parentElement!.lastElementChild).toBe(slot)
  })

  // The chip stands in for the Controls sheet's Done, so it takes the
  // keyboard when the sheet shuts under it (#576).
  it('takes the keyboard back when a phone\'s sheet shuts', () => {
    const page = (open: boolean) => (
      <>
        <div inert={!open}>
          <button>Done</button>
        </div>
        {rows({ sidebarOpen: open })}
      </>
    )
    const { rerender } = render(page(true))
    screen.getByRole('button', { name: 'Done' }).focus()
    rerender(page(false))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open controls' }))
  })
})

// A desk's rows are the phone's (#714): the panel is docked beside the map
// with its own Close, so the summary chip stands only while it is shut, as
// the one way back to it from the map.
describe('MapRows at a desk', () => {
  it('offers the summary chip only while the panel is shut, and it opens the panel', () => {
    const onOpenControls = vi.fn()
    const { rerender } = render(rows({ desk: true, sidebarOpen: true, onOpenControls }))
    expect(screen.queryByRole('button', { name: 'Open controls' })).toBeNull()
    rerender(rows({ desk: true, sidebarOpen: false, onOpenControls }))
    const chip = screen.getByRole('button', { name: 'Open controls' })
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(chip)
    expect(onOpenControls).toHaveBeenCalledOnce()
  })

  it('keeps Layers and Legend while the panel is open', () => {
    render(rows({ desk: true, sidebarOpen: true }))
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.slice(-2)).toEqual(['Layers', 'Legend'])
  })

  // Closing the panel makes it inert under the keyboard that pressed its
  // Close, and the chip that replaces it takes the focus (#576).
  it('takes the keyboard when the panel it reopens closes under it', () => {
    const page = (open: boolean) => (
      <>
        <aside inert={!open}>
          <button>Close controls</button>
        </aside>
        {rows({ desk: true, sidebarOpen: open })}
      </>
    )
    const { rerender } = render(page(true))
    screen.getByRole('button', { name: 'Close controls' }).focus()
    rerender(page(false))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open controls' }))
  })

  // The reader left the focus where it was, say by pressing the map: the
  // panel closing then leaves the page as they left it.
  it('takes nothing when the focus was not lost', () => {
    const { rerender } = render(rows({ desk: true, sidebarOpen: true }))
    const layers = screen.getByRole('button', { name: 'Layers' })
    layers.focus()
    layers.blur()
    rerender(rows({ desk: true, sidebarOpen: false }))
    expect(document.activeElement).toBe(document.body)
  })
})
