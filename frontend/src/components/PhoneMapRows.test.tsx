import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import PhoneMapRows from './PhoneMapRows'
import type { SearchBoxHandle } from './SearchBox'
import type { LegendSectionSpec } from './MapLegend'
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
vi.mock('./MapLegend', () => ({
  LegendSections: (props: { sections: readonly LegendSectionSpec[] }) => (
    <div data-testid="sections">{props.sections.length}</div>
  ),
}))

const SECTION = { id: 'radar', label: 'Rain radar' } as unknown as LegendSectionSpec

function rows(over: Partial<Parameters<typeof PhoneMapRows>[0]> = {}) {
  return (
    <PhoneMapRows
      searchBoxRef={createRef<SearchBoxHandle>()}
      onSearchSelect={() => {}}
      searchPointed={false}
      onLocateSlot={() => {}}
      sidebarOpen={false}
      onOpenControls={() => {}}
      controlsSummary="Current · NOAA GFS"
      layers={<button>Layers</button>}
      legend={[]}
      {...over}
    />
  )
}
const legendChip = () => screen.getByRole('button', { name: 'Legend' }) as HTMLButtonElement

describe('PhoneMapRows', () => {
  // The summary chip opens the drawer under the name the drawer's own
  // button carried, and reads its summary out as its description.
  it('opens the drawer from the summary chip, which carries the summary', () => {
    const onOpenControls = vi.fn()
    render(rows({ onOpenControls }))
    const chip = screen.getByRole('button', { name: 'Open controls' })
    expect(chip.getAttribute('aria-describedby')).toBe(screen.getByText('Current · NOAA GFS').id)
    fireEvent.click(chip)
    expect(onOpenControls).toHaveBeenCalledOnce()
  })

  it('stands the Layers chip it is handed between the summary and Legend', () => {
    render(rows())
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.slice(-3)).toEqual(['Open controls', 'Layers', 'Legend'])
  })

  // No Analyze on the row while where it lives is undecided: the drawer's
  // button is the one, and the row's right end is left empty.
  it('carries no Analyze', () => {
    render(rows())
    expect(screen.queryByRole('button', { name: /^Analyz/ })).toBeNull()
  })

  // Greyed in place rather than absent, so the row keeps its shape.
  it('greys Legend while there is no key, and opens the keys in a sheet', () => {
    const { rerender } = render(rows())
    expect(legendChip().disabled).toBe(true)
    rerender(rows({ legend: [SECTION] }))
    expect(legendChip().disabled).toBe(false)
    expect(legendChip().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(legendChip())
    expect(screen.getByRole('dialog', { name: 'Legend' })).toBeTruthy()
    expect(screen.getByTestId('sections').textContent).toBe('1')
    expect(legendChip().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // A key that goes while its sheet is open takes the sheet with it, and the
  // next key does not bring the sheet back by itself.
  it('closes the Legend sheet when the last key goes', () => {
    const { rerender } = render(rows({ legend: [SECTION] }))
    fireEvent.click(legendChip())
    rerender(rows())
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(rows({ legend: [SECTION] }))
    expect(screen.queryByRole('dialog')).toBeNull()
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

  // The chip stands in for the drawer's Close button, so it takes the
  // keyboard when the drawer shuts under it (#576).
  it('takes the keyboard back when the drawer shuts', () => {
    const { rerender } = render(rows({ sidebarOpen: true }))
    rerender(rows({ sidebarOpen: false }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open controls' }))
  })
})
