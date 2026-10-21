import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import MapCorner from './MapCorner'
import { placeAt, render, stubResizeObserver } from '../testSupport/render'
import { MAP_CORNER } from '../styles'
import { CREDITS_OPEN_CLASS, type CornerSlots } from '../map/controls'
import type { PhoneLine } from '../utils/resultsSheet'

// In an afterEach so a failed assertion cannot leave the fake observer behind.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MapCorner', () => {
  // Every slot at once, so the map moves its controls in together, and null
  // when the corner goes, so it moves them back to the library's corners.
  it('hands up its slots once, in the column\'s order, and null when it goes', () => {
    const onSlots = vi.fn<(slots: CornerSlots | null) => void>()
    const { container, unmount } = render(<MapCorner onSlots={onSlots} />)
    expect(onSlots).toHaveBeenCalledOnce()
    const slots = onSlots.mock.calls[0][0]!
    const [stack, credit] = container.querySelectorAll('[data-map-overlay]')
    // The compass on top, the locate button, then the zoom pair (TJ, 2026-10-20).
    const { compass, locate, zoom } = slots.buttons!
    expect([...stack.children]).toEqual([compass, locate, zoom])
    // The credits, then the scale at the line's end.
    expect([...credit.children]).toEqual([slots.credit, slots.scale])
    unmount()
    expect(onSlots).toHaveBeenCalledTimes(2)
    expect(onSlots).toHaveBeenLastCalledWith(null)
  })

  // A popup keeps clear of the column and the line, rather than of the box
  // around them, which is mostly map.
  it('marks the column and the line for a popup to keep clear of', () => {
    const { container } = render(<MapCorner onSlots={() => {}} />)
    const marked = [...container.querySelectorAll('[data-map-overlay]')]
    expect(marked.map((el) => el.className)).toEqual([MAP_CORNER.stack, MAP_CORNER.credit])
    expect(container.firstElementChild?.hasAttribute('data-map-overlay')).toBe(false)
  })

  // A phone's corner is the credit line alone, in the bottom-left corner
  // (record 0174): its compass and locate button stand in its rows, and it
  // shows no zoom pair, so the map is handed no buttons' slots.
  it('stands a phone\'s line alone, the (i) then the scale, with no buttons', () => {
    const onSlots = vi.fn<(slots: CornerSlots | null) => void>()
    const { container, unmount } = render(<MapCorner phone onSlots={onSlots} />)
    expect(onSlots).toHaveBeenCalledOnce()
    const slots = onSlots.mock.calls[0][0]!
    expect(slots.buttons).toBeNull()
    expect(container.firstElementChild?.className).toBe(MAP_CORNER.phoneBox)
    const marked = [...container.querySelectorAll('[data-map-overlay]')]
    expect(marked.map((el) => el.className)).toEqual([MAP_CORNER.phoneCredit])
    expect([...marked[0].children]).toEqual([slots.credit, slots.scale])
    expect(slots.scale.className).toBe(MAP_CORNER.phoneScale)
    unmount()
    expect(onSlots).toHaveBeenLastCalledWith(null)
  })

  // The band and, while the credits are open, the Analyze button stand over
  // a phone's line, so it reports its height and whether the credits are
  // open, once per change, read off the library's own class.
  it('reports a phone\'s line, its height and whether the credits are open', () => {
    const fire = stubResizeObserver()
    const onLine = vi.fn<(line: PhoneLine) => void>()
    const { container } = render(<MapCorner phone onSlots={() => {}} onLine={onLine} />)
    const line = container.querySelector('[data-map-overlay]')!
    expect(onLine).toHaveBeenLastCalledWith({ px: 0, open: false })
    placeAt(line, { left: 0, top: 600, width: 152, height: 29 })
    act(() => fire())
    expect(onLine).toHaveBeenLastCalledWith({ px: 29, open: false })
    // Nothing moved, so nothing is reported.
    act(() => fire())
    expect(onLine).toHaveBeenCalledTimes(2)
    // The library opens the credits by a class on its attribution, inside the line.
    const credits = document.createElement('details')
    credits.className = `maplibregl-ctrl-attrib ${CREDITS_OPEN_CLASS}`
    line.firstElementChild!.append(credits)
    placeAt(line, { left: 0, top: 556, width: 348, height: 72.6 })
    act(() => fire())
    expect(onLine).toHaveBeenLastCalledWith({ px: 73, open: true })
  })

  // A desk's line moves nothing over it, so it reports nothing.
  it('reports no line at a desk', () => {
    stubResizeObserver()
    const onLine = vi.fn()
    render(<MapCorner onSlots={() => {}} onLine={onLine} />)
    expect(onLine).not.toHaveBeenCalled()
  })

  it('names the class the library opens the credits under', () => {
    expect(CREDITS_OPEN_CLASS).toBe('maplibregl-compact-show')
  })
})
