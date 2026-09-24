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
    expect(screen.getByRole('textbox', { name: 'Search for a place' })).toBeTruthy()
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
