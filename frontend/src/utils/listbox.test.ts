import { describe, expect, it } from 'vitest'
import { nextActiveIndex, popoverBox } from './listbox'

const VIEWPORT = { width: 1400, height: 900 }
const OPTS = { preferredWidth: 380, gap: 4, margin: 8 }

// A trigger in the sidebar: narrow, and well clear of both edges.
const TRIGGER = { left: 16, top: 400, width: 253, height: 34 }

describe('popoverBox', () => {
  it('opens below a trigger with room under it', () => {
    const box = popoverBox(TRIGGER, VIEWPORT, OPTS)
    expect(box.placement).toBe('below')
    expect(box.top).toBe(438)
    expect(box.bottom).toBeUndefined()
  })

  // The point of the whole control: the sidebar cannot hold eight summaries, so
  // the panel spills over the map.
  it('widens past the trigger to the preferred width', () => {
    expect(popoverBox(TRIGGER, VIEWPORT, OPTS).width).toBe(380)
  })

  it('never renders narrower than the trigger it belongs to', () => {
    const wide = { ...TRIGGER, width: 500 }
    expect(popoverBox(wide, VIEWPORT, OPTS).width).toBe(500)
  })

  it('gives back the room the chosen side actually has', () => {
    const box = popoverBox(TRIGGER, VIEWPORT, OPTS)
    expect(box.maxHeight).toBe(900 - 434 - 4 - 8)
  })

  // A trigger low on a short screen has to flip rather than squeeze into the
  // forty pixels under it.
  it('flips above when there is more room there', () => {
    const low = { ...TRIGGER, top: 820 }
    const box = popoverBox(low, VIEWPORT, OPTS)
    expect(box.placement).toBe('above')
    expect(box.bottom).toBe(900 - 820 + 4)
    expect(box.top).toBeUndefined()
    expect(box.maxHeight).toBe(820 - 4 - 8)
  })

  it('keeps the panel inside the right edge', () => {
    const nearRight = { ...TRIGGER, left: 1300 }
    const box = popoverBox(nearRight, VIEWPORT, OPTS)
    expect(box.left).toBe(1400 - 380 - 8)
  })

  it('keeps the panel inside the left edge', () => {
    const offLeft = { ...TRIGGER, left: -40 }
    expect(popoverBox(offLeft, VIEWPORT, OPTS).left).toBe(8)
  })

  // A phone in portrait is narrower than the panel wants to be.
  it('shrinks to the viewport when the preferred width will not fit', () => {
    const phone = { width: 390, height: 780 }
    const box = popoverBox({ left: 8, top: 300, width: 360, height: 44 }, phone, OPTS)
    expect(box.width).toBe(390 - 16)
    expect(box.left).toBe(8)
  })

  it('never reports negative room', () => {
    const squeezed = { ...TRIGGER, top: 899 }
    expect(popoverBox(squeezed, VIEWPORT, OPTS).maxHeight).toBeGreaterThanOrEqual(0)
  })
})

describe('nextActiveIndex', () => {
  it('steps down and up', () => {
    expect(nextActiveIndex(0, 'ArrowDown', 8)).toBe(1)
    expect(nextActiveIndex(3, 'ArrowUp', 8)).toBe(2)
  })

  // Deliberately not wrapping: Home and End are how you reach the ends.
  it('stops at the ends rather than wrapping', () => {
    expect(nextActiveIndex(7, 'ArrowDown', 8)).toBe(7)
    expect(nextActiveIndex(0, 'ArrowUp', 8)).toBe(0)
  })

  it('jumps to either end', () => {
    expect(nextActiveIndex(5, 'Home', 8)).toBe(0)
    expect(nextActiveIndex(2, 'End', 8)).toBe(7)
  })

  // Null is what leaves Tab, Escape and a screen reader's own keys alone.
  it('claims no key it does not handle', () => {
    for (const key of ['Tab', 'Escape', 'a', 'PageDown', ' ']) {
      expect(nextActiveIndex(2, key, 8)).toBeNull()
    }
  })

  it('handles an empty list', () => {
    expect(nextActiveIndex(0, 'ArrowDown', 0)).toBeNull()
  })
})
