import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import MapRows from './MapRows'
import type { SearchBoxHandle } from './SearchBox'
import { render } from '../testSupport/render'
import { DESK_CARD, MAP_ROWS } from '../styles'
import type { CardChips } from '../utils/results/resultsSheet'

// Where the chip row stands around an open card is measured off the built
// page (`useCardChips` has a suite of its own); here it is whatever a test
// sets, beside the card unless it says otherwise.
const side = vi.hoisted(() => ({ chips: { side: 'beside' } as CardChips }))
vi.mock('../hooks/useCardChips', () => ({
  useCardChips: (_stack: unknown, cardOpen: boolean) => (cardOpen ? side.chips : null),
}))

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
      onLocateSlot={() => {}}
      onTerrainSlot={() => {}}
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

  // Legend before Layers, so the card open by default hangs over the map's
  // left edge (TJ, 2026-10-18).
  it('stands the Legend and Layers chips it is handed after the summary', () => {
    render(rows())
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.slice(-3)).toEqual(['Open controls', 'Legend', 'Layers'])
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

  // A desk's search stands in the panel's Destinations field (record 0306),
  // so its map carries no pill.
  it('carries the search on a phone and not at a desk', () => {
    const { rerender } = render(rows())
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
    rerender(rows({ desk: true }))
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
  })

  it('hands up the slot the map stands its locate button in', () => {
    const onLocateSlot = vi.fn()
    render(rows({ onLocateSlot }))
    expect(onLocateSlot).toHaveBeenCalledWith(expect.any(HTMLDivElement))
  })

  // A phone's 3D button, in the search row beside the locate button (#799),
  // and so out of the chip row.
  it('hands up the 3D button\'s slot in the search row, before the locate button\'s', () => {
    const onTerrainSlot = vi.fn()
    const onLocateSlot = vi.fn()
    render(rows({ onTerrainSlot, onLocateSlot }))
    const slot = onTerrainSlot.mock.calls[0][0] as HTMLDivElement
    const locate = onLocateSlot.mock.calls[0][0] as HTMLDivElement
    expect(slot.parentElement).toBe(locate.parentElement)
    expect(slot.nextElementSibling).toBe(locate)
    expect(slot.parentElement).not.toBe(screen.getByRole('button', { name: 'Open controls' }).parentElement)
  })

  // A phone's compass, at the chip row's right end under the locate button
  // (record 0147).
  it('hands up the compass\'s slot at the end of a phone\'s chip row', () => {
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
describe('MapRows under a full-screen sheet', () => {
  // A full-screen results sheet stands over the rows (#837): they stay where
  // they are, mounted so the map keeps its slots, and out of reach.
  it('goes out of reach while covered, and keeps its slots', () => {
    const onLocateSlot = vi.fn()
    const { container, rerender } = render(rows({ onLocateSlot }))
    const stack = container.firstElementChild as HTMLElement
    expect(stack.hasAttribute('inert')).toBe(false)
    rerender(rows({ onLocateSlot, covered: true }))
    expect(stack.hasAttribute('inert')).toBe(true)
    expect(onLocateSlot).toHaveBeenCalledTimes(1)
  })
})

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

  // A desk's controls card stands at the head of the rows (record 0305),
  // with no search in or beside it, since a desk's search is the
  // Destinations field's (record 0306). Here the chips stand beside the
  // card, where the legend has no room under it.
  it('stands a desk\'s card at the head of the rows, with the chips beside it where they have no room under it', () => {
    const card = <aside data-testid="card" />
    const { container, rerender } = render(rows({ desk: true, sidebarOpen: true, card }))
    const stack = container.firstElementChild as HTMLElement
    expect(stack.firstElementChild).toBe(screen.getByTestId('card'))
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    expect(stack.className).toContain(DESK_CARD.stackOpen)
    // The rows publish where they end for the legend's card: the chip row
    // alone, and the wider map it clears the player on.
    expect(stack.style.getPropertyValue('--legend-rows')).toBe('44px')
    expect(stack.style.getPropertyValue('--legend-line')).toBe('1610px')
    const chips = screen.getByRole('button', { name: 'Legend' }).parentElement!
    expect(chips.className).toBe(MAP_ROWS.chips)
    // The card and the chip row are each a surface a popup keeps clear of,
    // and the stack around them is none: the corner under the chips is the
    // map's (`AppDrawer` marks the card).
    expect(stack.hasAttribute('data-map-overlay')).toBe(false)
    expect(chips.hasAttribute('data-map-overlay')).toBe(true)

    rerender(rows({ desk: true, sidebarOpen: false, card }))
    expect(stack.className).not.toContain(DESK_CARD.stackOpen)
    expect(stack.style.getPropertyValue('--legend-rows')).toBe('')
  })

  // Where the legend has room under the card, the chip row is the stack's
  // second row, under the card in its column (the maintainer, 2026-11-17),
  // and the rows end under it.
  it('stands the chips under an open card where the legend has room there', () => {
    side.chips = { side: 'under', cardPx: 335, menuPx: 420 }
    try {
      const card = <aside data-testid="card" />
      const { container } = render(rows({ desk: true, sidebarOpen: true, card }))
      const stack = container.firstElementChild as HTMLElement
      expect(stack.className).not.toContain(DESK_CARD.stackOpen)
      expect(stack.className).toContain('flex-col')
      expect(stack.style.getPropertyValue('--legend-rows')).toBe('391px')
      expect(stack.style.getPropertyValue('--legend-line')).toBe('864px')
      expect(stack.style.getPropertyValue('--chip-menu-max')).toBe('420px')
      expect(screen.getByTestId('card').nextElementSibling).toBe(screen.getByRole('button', { name: 'Legend' }).parentElement)
    } finally {
      side.chips = { side: 'beside' }
    }
  })

  // With no card the rows are one surface, as on a phone.
  it('marks the stack as the one surface a popup keeps clear of where it holds no card', () => {
    const { container } = render(rows())
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-map-overlay')).toBe(true)
    expect(screen.getByRole('button', { name: 'Legend' }).parentElement!.hasAttribute('data-map-overlay')).toBe(false)
  })

  it('keeps Legend and Layers while the panel is open', () => {
    render(rows({ desk: true, sidebarOpen: true }))
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.slice(-2)).toEqual(['Legend', 'Layers'])
  })

  // A desk's map buttons stand in the map's top-right corner with the zoom
  // pair (record 0174), so its rows hand up no slot for either.
  it('hands up no slot for the locate button, the 3D button or the compass', () => {
    const onLocateSlot = vi.fn()
    const onTerrainSlot = vi.fn()
    const onCompassSlot = vi.fn()
    render(rows({ desk: true, onLocateSlot, onTerrainSlot, onCompassSlot }))
    expect(onLocateSlot).not.toHaveBeenCalledWith(expect.any(HTMLDivElement))
    expect(onTerrainSlot).not.toHaveBeenCalledWith(expect.any(HTMLDivElement))
    expect(onCompassSlot).not.toHaveBeenCalledWith(expect.any(HTMLDivElement))
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
