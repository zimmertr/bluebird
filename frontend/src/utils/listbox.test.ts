import { describe, expect, it } from 'vitest'
import { nextActiveIndex, popoverBox } from './listbox'

const VIEWPORT = { width: 1400, height: 900 }
// Most cases pass a content height explicitly; this is the shared geometry.
const BASE = { preferredWidth: 380, gap: 4, margin: 8 }
const OPTS = { ...BASE, desiredHeight: 0 }
const opts = (desiredHeight: number) => ({ ...BASE, desiredHeight })

// A trigger in the sidebar: narrow, and well clear of both edges.
const TRIGGER = { left: 16, top: 400, width: 253, height: 34 }

describe('popoverBox', () => {
  it('opens below a trigger with room under it', () => {
    const box = popoverBox(TRIGGER, VIEWPORT, opts(200))
    expect(box.placement).toBe('below')
    expect(box.offset).toEqual({ top: 438 })
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
    const box = popoverBox(TRIGGER, VIEWPORT, opts(200))
    expect(box.maxHeight).toBe(900 - 434 - 4 - 8)
  })

  // A trigger low on the screen has to flip rather than squeeze into the forty
  // pixels under it.
  it('flips above when the content does not fit below but does above', () => {
    const low = { ...TRIGGER, top: 820 }
    const box = popoverBox(low, VIEWPORT, opts(300))
    expect(box.placement).toBe('above')
    expect(box.offset).toEqual({ bottom: 900 - 820 + 4 })
    expect(box.maxHeight).toBe(820 - 4 - 8)
  })

  // The regression this rule exists for. A control halfway down an ordinary
  // laptop window has ~490px above and ~330px below; a 520px list fits in
  // neither, and preferring the roomier side would scroll it inside 490px on a
  // 900px screen that could show the whole thing.
  it('overlaps the trigger rather than scrolling when neither side fits', () => {
    const box = popoverBox(TRIGGER, VIEWPORT, opts(520))
    expect(box.placement).toBe('shifted')
    expect(box.maxHeight).toBe(900 - 16)
    expect(box.offset).toEqual({ top: 372 })
  })

  // Anchored to the trigger's own top where it can be, so the panel still reads
  // as belonging to the control that opened it. The window where that happens
  // is narrow — 470px clears the 454px below it but still fits between the
  // trigger's top and the bottom margin — so in practice a shifted panel
  // usually ends up pushed up by the case below.
  it('anchors a shifted panel to the trigger when the viewport allows', () => {
    const box = popoverBox(TRIGGER, VIEWPORT, opts(470))
    expect(box.placement).toBe('shifted')
    expect(box.offset).toEqual({ top: TRIGGER.top })
  })

  it('pushes a shifted panel up only as far as it must to fit', () => {
    // 700px of content against 154px below and 688px above: neither side takes
    // it, and anchoring at the trigger's 700 would run 500px off the bottom.
    const box = popoverBox({ ...TRIGGER, top: 700 }, VIEWPORT, opts(700))
    expect(box.offset).toEqual({ top: 900 - 8 - 700 })
  })

  it('never pushes a shifted panel past the top margin', () => {
    const box = popoverBox({ ...TRIGGER, top: 700 }, VIEWPORT, opts(2000))
    expect(box.offset).toEqual({ top: 8 })
    expect(box.maxHeight).toBe(900 - 16)
  })

  // The first pass, before anything has been laid out to measure: ask for
  // everything, so the content renders at its natural height to be measured.
  it('gives the whole viewport when the wanted height is unknown', () => {
    const box = popoverBox(TRIGGER, VIEWPORT, opts(Infinity))
    expect(box.placement).toBe('shifted')
    expect(box.maxHeight).toBe(900 - 16)
  })

  // Every placement hands back exactly one anchored edge. A box with neither is
  // a fixed element that falls back to its static position, which is how the
  // panel once rendered a full viewport height below where it belonged.
  it('always anchors exactly one edge, whichever way it opens', () => {
    for (const height of [100, 470, 520, 700, 2000, Infinity]) {
      for (const top of [40, 400, 700, 860]) {
        const box = popoverBox({ ...TRIGGER, top }, VIEWPORT, opts(height))
        const keys = Object.keys(box.offset)
        expect(keys.length, `${top}/${height}`).toBe(1)
        expect(Number.isFinite(Object.values(box.offset)[0]), `${top}/${height}`).toBe(true)
      }
    }
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
    const box = popoverBox({ left: 8, top: 300, width: 360, height: 44 }, phone, opts(200))
    expect(box.width).toBe(390 - 16)
    expect(box.left).toBe(8)
  })

  // The bug this clipping exists for. The control panel is a scrolling column,
  // so a short window leaves the trigger below the fold while its popover is
  // open. Measured from the raw rect, a trigger at 526 in a 339px window claims
  // 514px above it, and the `above` branch turns that into `bottom: -183`,
  // which pushes the panel down past the bottom edge rather than up.
  it('invents no room above a trigger that has scrolled off screen', () => {
    const short = { width: 1100, height: 339 }
    const offScreen = { ...TRIGGER, top: 526 }
    const box = popoverBox(offScreen, short, opts(495))
    expect(box.placement).toBe('shifted')
    expect(box.offset).toEqual({ top: 8 })
    expect(box.maxHeight).toBe(339 - 16)
  })

  it('invents no room below a trigger scrolled off the top', () => {
    const box = popoverBox({ ...TRIGGER, top: -400 }, VIEWPORT, opts(200))
    expect(box.placement).toBe('below')
    expect(box.offset).toEqual({ top: 4 })
    expect(box.maxHeight).toBe(900 - 0 - 4 - 8)
  })

  // Whatever the trigger does, the panel stays on screen. Asserted over the
  // whole space rather than case by case, because every failure so far has been
  // a geometry nobody thought to write a case for.
  it('always lands inside the viewport', () => {
    for (const height of [100, 495, 520, 900, Infinity]) {
      for (const top of [-500, -40, 0, 200, 526, 899, 1400]) {
        const vp = { width: 1100, height: 339 }
        const box = popoverBox({ ...TRIGGER, top }, vp, opts(height))
        const where = `top=${top} h=${height}`
        if ('top' in box.offset) {
          expect(box.offset.top, where).toBeGreaterThanOrEqual(0)
          expect(box.offset.top + box.maxHeight, where).toBeLessThanOrEqual(vp.height)
        } else {
          expect(box.offset.bottom, where).toBeGreaterThanOrEqual(0)
          expect(box.offset.bottom + box.maxHeight, where).toBeLessThanOrEqual(vp.height)
        }
      }
    }
  })

  it('never reports negative room', () => {
    const squeezed = { ...TRIGGER, top: 899 }
    expect(popoverBox(squeezed, VIEWPORT, opts(0)).maxHeight).toBeGreaterThanOrEqual(0)
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
