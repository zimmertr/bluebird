import { describe, expect, it, vi } from 'vitest'
import MapCorner from './MapCorner'
import { render } from '../testSupport/render'
import { MAP_CORNER } from '../styles'
import type { CornerSlots } from '../map/controls'

describe('MapCorner', () => {
  // Every slot at once, so the map moves its controls in together, and null
  // when the corner goes, so it moves them back to the library's corners.
  it('hands up its slots once, in the column\'s order, and null when it goes', () => {
    const onSlots = vi.fn<(slots: CornerSlots | null) => void>()
    const { container, unmount } = render(<MapCorner onSlots={onSlots} />)
    expect(onSlots).toHaveBeenCalledOnce()
    const slots = onSlots.mock.calls[0][0]!
    const [stack, credit] = container.querySelectorAll('[data-map-overlay]')
    // The compass on top, the 3D button under it (#799), the locate button,
    // then the zoom pair (TJ, 2026-10-20).
    expect([...stack.children]).toEqual([slots.compass, slots.terrain, slots.locate, slots.zoom])
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
})
