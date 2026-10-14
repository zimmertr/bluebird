import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { createRef } from 'react'
import MapButtonColumn from './MapButtonColumn'
import type { SearchBoxHandle } from './SearchBox'
import { render } from '../testSupport/render'

const NOOP = () => {}

function column(over: { sidebarOpen?: boolean; onOpenControls?: () => void } = {}) {
  return (
    <MapButtonColumn
      searchBoxRef={createRef<SearchBoxHandle>()}
      onSearchSelect={NOOP}
      searchPointed={false}
      sidebarOpen={over.sidebarOpen ?? true}
      onOpenControls={over.onOpenControls ?? NOOP}
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

  // Closing the drawer makes it inert under the keyboard that pressed its
  // Close button, and the button that replaces it takes the focus (#576).
  it('takes the keyboard when the drawer it reopens closes under it', () => {
    const page = (open: boolean) => (
      <>
        <aside inert={!open}>
          <button>Close controls</button>
        </aside>
        {column({ sidebarOpen: open })}
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
    render(
      <MapButtonColumn searchBoxRef={ref} onSearchSelect={NOOP} searchPointed={false} sidebarOpen onOpenControls={NOOP}>
        {null}
      </MapButtonColumn>,
    )
    expect(ref.current).not.toBeNull()
  })
})
