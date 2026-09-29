import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import Popover from './Popover'
import { setPopoverReserve, usePopover } from '../hooks/usePopover'
import { placeAt, render, type Box } from '../testSupport/render'

// The recipe every floating panel wears: `usePopover` decides where the panel
// goes and what closes it, and `Popover` draws the card and portals it out.
// Four panels (the model, columns, removed and layers pickers) are built from
// exactly this pair, so a harness that wires it the way they do covers the
// behavior they share. What each adds on top is its own suite's business.

// jsdom's viewport, which the placement reads through `window.innerHeight`.
const VIEWPORT_H = window.innerHeight

function Harness({ trigger, header }: { trigger: Box; header?: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { popoverRef, box } = usePopover({ open, onOpenChange: setOpen, triggerRef })
  return (
    <>
      <button
        ref={(el) => {
          triggerRef.current = el
          if (el) placeAt(el, trigger)
        }}
        onClick={() => setOpen(!open)}
      >
        Trigger
      </button>
      <button>Elsewhere</button>
      {open && box && (
        <Popover box={box} popoverRef={popoverRef} header={header}>
          <button>Inside</button>
        </Popover>
      )}
    </>
  )
}

/** The card: the element the portal puts under the body, holding the rows. */
function panel(): HTMLElement {
  const el = screen.getByRole('button', { name: 'Inside' }).closest<HTMLElement>('[style]')
  if (!el) throw new Error('no panel on screen')
  return el
}

// The panel's natural height, which the second measuring pass reads. jsdom lays
// nothing out, so without this every panel measures zero and always fits below.
let panelHeight = 200
beforeEach(() => {
  panelHeight = 200
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => panelHeight)
})
afterEach(() => vi.restoreAllMocks())

describe('placement', () => {
  it('hangs below a trigger with room under it', async () => {
    const { user } = render(<Harness trigger={{ left: 20, top: 100, width: 120, height: 30 }} />)
    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    // The trigger's bottom edge plus the gap.
    expect(panel().style.top).toBe('134px')
    expect(panel().style.bottom).toBe('')
  })

  it('opens above a trigger near the bottom of the viewport', async () => {
    const { user } = render(<Harness trigger={{ left: 20, top: VIEWPORT_H - 168, width: 120, height: 30 }} />)
    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    // Anchored by its bottom edge to the trigger's top, less the gap.
    expect(panel().style.bottom).toBe('172px')
    expect(panel().style.top).toBe('')
  })

  it('shifts a panel too tall for either side up only as far as it must', async () => {
    panelHeight = VIEWPORT_H - 68
    const { user } = render(<Harness trigger={{ left: 20, top: 300, width: 120, height: 30 }} />)
    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    // The viewport's margin below the panel, and no further.
    expect(panel().style.top).toBe('60px')
    expect(panel().style.maxHeight).toBe(`${VIEWPORT_H - 16}px`)
  })

  // The tutorial's card stands across one edge of a phone (#536), and a panel
  // opened under it would be covered: it is placed as if the viewport ended
  // at the card.
  describe('with a band of the viewport reserved', () => {
    afterEach(() => setPopoverReserve({ top: 0, bottom: 0 }))

    it('opens above a trigger that the reserved bottom leaves no room under', async () => {
      setPopoverReserve({ top: 0, bottom: 150 })
      const { user } = render(<Harness trigger={{ left: 20, top: VIEWPORT_H - 330, width: 120, height: 30 }} />)
      await user.click(screen.getByRole('button', { name: 'Trigger' }))
      expect(panel().style.bottom).toBe('334px')
    })

    it('counts a reserved top from the real top of the viewport', async () => {
      setPopoverReserve({ top: 140, bottom: 0 })
      const { user } = render(<Harness trigger={{ left: 20, top: 200, width: 120, height: 30 }} />)
      await user.click(screen.getByRole('button', { name: 'Trigger' }))
      expect(panel().style.top).toBe('234px')
    })

    it('never lets a panel taller than what is left reach into the band', async () => {
      panelHeight = VIEWPORT_H
      setPopoverReserve({ top: 0, bottom: 150 })
      const { user } = render(<Harness trigger={{ left: 20, top: 300, width: 120, height: 30 }} />)
      await user.click(screen.getByRole('button', { name: 'Trigger' }))
      expect(panel().style.maxHeight).toBe(`${VIEWPORT_H - 150 - 16}px`)
    })
  })

  it('portals the card out of the tree it is declared in', async () => {
    const { user, container } = render(
      <Harness trigger={{ left: 20, top: 100, width: 120, height: 30 }} header="Display columns" />,
    )
    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    // Out of the scrolling column, which is the reason the box is fixed.
    expect(container.contains(panel())).toBe(false)
    expect(panel().parentElement).toBe(document.body)
    expect(panel().style.position).toBe('fixed')
    expect(screen.getByText('Display columns')).toBeTruthy()
  })
})

describe('dismissal', () => {
  it('closes on Escape and hands focus back to the trigger', async () => {
    const { user } = render(<Harness trigger={{ left: 20, top: 100, width: 120, height: 30 }} />)
    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    screen.getByRole('button', { name: 'Inside' }).focus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Trigger' }))
  })

  it('closes on a press outside the panel', async () => {
    const { user } = render(<Harness trigger={{ left: 20, top: 100, width: 120, height: 30 }} />)
    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
  })

  it('stays open on a press inside the panel', async () => {
    const { user } = render(<Harness trigger={{ left: 20, top: 100, width: 120, height: 30 }} />)
    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }))
    expect(screen.getByRole('button', { name: 'Inside' })).toBeTruthy()
  })

  it('leaves the trigger its own toggle rather than closing and reopening', async () => {
    const { user } = render(<Harness trigger={{ left: 20, top: 100, width: 120, height: 30 }} />)
    const trigger = screen.getByRole('button', { name: 'Trigger' })
    await user.click(trigger)
    // A full click: the pointerdown must not dismiss first, or the click would
    // reopen what the press had just closed.
    await user.click(trigger)
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
  })
})
