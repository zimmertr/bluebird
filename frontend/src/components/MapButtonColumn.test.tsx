import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
import MapButtonColumn from './MapButtonColumn'
import type { SearchBoxHandle } from './SearchBox'
import { render } from '../testSupport/render'

const NOOP = () => {}

type Props = ComponentProps<typeof MapButtonColumn>

function column(over: Partial<Omit<Props, 'children'>> = {}) {
  return (
    <MapButtonColumn
      searchBoxRef={createRef<SearchBoxHandle>()}
      onSearchSelect={NOOP}
      searchPointed={false}
      sidebarOpen
      onOpenControls={NOOP}
      phoneRow={false}
      controlsSummary="Current · NOAA GFS"
      analyzeEnabled
      analyzing={false}
      onAnalyze={NOOP}
      {...over}
    >
      <button>Layers</button>
    </MapButtonColumn>
  )
}

describe('MapButtonColumn', () => {
  // The search field is the column's first row and the Layers button its
  // last, whether or not the panel is open.
  it('draws the search field and the Layers button', () => {
    render(column())
    expect(screen.getByRole('combobox', { name: 'Search for a place' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Layers' })).toBeTruthy()
  })

  // The Controls button stands in the column only while the panel is closed,
  // because it is the one way back to the panel from the map.
  it('offers Controls only while the panel is closed, and it reopens the panel', () => {
    const onOpenControls = vi.fn()
    const { rerender } = render(column({ sidebarOpen: true, onOpenControls }))
    expect(screen.queryByRole('button', { name: 'Open controls' })).toBeNull()
    rerender(column({ sidebarOpen: false, onOpenControls }))
    fireEvent.click(screen.getByRole('button', { name: 'Open controls' }))
    expect(onOpenControls).toHaveBeenCalledOnce()
  })

  // A desktop has no Analyze on the map: the panel's is docked beside it.
  it('puts no Analyze on a desktop map', () => {
    render(column({ sidebarOpen: false }))
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull()
  })

  // Closing the drawer makes it inert under the keyboard that pressed its
  // Close button, and the button that replaces it takes the focus (#576).
  it.each([false, true])('takes the keyboard when the drawer it reopens closes under it (phone row: %s)', (phoneRow) => {
    const page = (open: boolean) => (
      <>
        <aside inert={!open}>
          <button>Close controls</button>
        </aside>
        {column({ sidebarOpen: open, phoneRow })}
      </>
    )
    const { rerender } = render(page(true))
    screen.getByRole('button', { name: 'Close controls' }).focus()
    rerender(page(false))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open controls' }))
  })

  // The reader left the focus where it was, say by pressing the map: the
  // drawer closing then leaves the page as they left it.
  it('takes nothing when the focus was not lost', () => {
    const { rerender } = render(column({ sidebarOpen: true }))
    const layers = screen.getByRole('button', { name: 'Layers' })
    layers.focus()
    layers.blur()
    rerender(column({ sidebarOpen: false }))
    expect(document.activeElement).toBe(document.body)
  })

  it('hands the search field the handle the map column holds', () => {
    const ref = createRef<SearchBoxHandle>()
    render(column({ searchBoxRef: ref }))
    expect(ref.current).not.toBeNull()
  })
})

// A phone (#696): the search field spans the map and Controls, Layers and
// Analyze share one row under it.
describe('MapButtonColumn on a phone', () => {
  const phone = (over: Partial<Omit<Props, 'children'>> = {}) =>
    column({ phoneRow: true, sidebarOpen: false, ...over })

  it('reads in the order of the flow: Controls, Layers, Analyze', () => {
    render(phone())
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names.map((n) => n?.replace('Current · NOAA GFS', ''))).toEqual(['Controls', 'Layers', 'Analyze'])
  })

  // The summary is what the panel is set to, in the panel's own words, and a
  // screen reader hears it as the button's description.
  it('says what the panel is set to under the Controls word', () => {
    render(phone({ controlsSummary: 'Dates · UK Met Office' }))
    const controls = screen.getByRole('button', { name: 'Open controls' })
    expect(controls.textContent).toBe('ControlsDates · UK Met Office')
    const describedBy = controls.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy!)!.textContent).toBe('Dates · UK Met Office')
  })

  // The drawer covers the row while it is open, so the row never reflows
  // under a closing drawer.
  it('keeps Controls in the row while the drawer is open', () => {
    render(phone({ sidebarOpen: true }))
    expect(screen.getByRole('button', { name: 'Open controls' })).toBeTruthy()
  })

  // The panel's command, gate and face: the same callback, shut when the
  // panel's is, and `Analyzing…` while a run is under way.
  it('runs the panel\'s Analyze, behind the panel\'s gate', () => {
    const onAnalyze = vi.fn()
    const { rerender } = render(phone({ onAnalyze }))
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }))
    expect(onAnalyze).toHaveBeenCalledOnce()
    rerender(phone({ onAnalyze, analyzeEnabled: false }))
    expect((screen.getByRole('button', { name: 'Analyze' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(phone({ onAnalyze, analyzeEnabled: false, analyzing: true }))
    expect((screen.getByRole('button', { name: 'Analyzing…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  // A run disables the button under the keyboard that pressed it; when the
  // run ends, the focus comes back to it as it does to the panel's (#576).
  it('takes the keyboard back when a run it started ends', () => {
    const { rerender } = render(phone())
    const analyze = screen.getByRole('button', { name: 'Analyze' })
    analyze.focus()
    rerender(phone({ analyzeEnabled: false, analyzing: true }))
    rerender(phone({ analyzeEnabled: true }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Analyze' }))
  })

  // Never a notice beside it: every reason lives under the panel's Analyze
  // (record 0028).
  it('says nothing about why it is shut', () => {
    const { container } = render(phone({ analyzeEnabled: false }))
    expect(container.querySelector('[role="status"]:not(:empty)')).toBeNull()
    expect(screen.getByRole('button', { name: 'Analyze' }).hasAttribute('aria-describedby')).toBe(false)
  })
})
