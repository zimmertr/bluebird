import { describe, expect, it } from 'vitest'
import { MENU_FLOOR_PX, nextActiveIndex, nextToolbarIndex, optionDomId, popoverBox } from './listbox'

const VIEWPORT = { width: 1400, height: 900 }
// Most cases pass a content height and width explicitly; this is the shared
// geometry, the 4px gap every menu takes and the 8px margin.
const BASE = { gap: 4, margin: 8 }
const opts = (desiredHeight: number, desiredWidth = 0) => ({ ...BASE, desiredHeight, desiredWidth })

// A trigger in the results bar: narrow, and well clear of every edge.
const TRIGGER = { left: 300, top: 400, width: 90, height: 22 }

// One menu for every trigger at a desk (#714; record 0200): the Layers chip's
// card made the general case.
describe('popoverBox, down the page', () => {
  it('stands 4px under a trigger with room under it', () => {
    const box = popoverBox(TRIGGER, VIEWPORT, opts(200))
    expect(box.placement).toBe('below')
    expect(box.offset).toEqual({ top: 400 + 22 + 4 })
  })

  it('gives back the room under the trigger', () => {
    const box = popoverBox(TRIGGER, VIEWPORT, opts(200))
    expect(box.maxHeight).toBe(900 - 422 - 4 - 8)
  })

  // At 1024x768 the Columns list fits neither side of a bar with 227px under
  // it and 495px over it: it scrolls under the bar rather than standing up
  // from a bar the reader is looking down at (record 0134).
  it('scrolls under the trigger where the card fits neither side and the room there reaches the floor', () => {
    const bar = { ...TRIGGER, top: 768 - 8 - 4 - 227 - 22 }
    const box = popoverBox(bar, { width: 1024, height: 768 }, opts(620))
    expect(box.placement).toBe('below')
    expect(box.maxHeight).toBe(227)
    const floor = popoverBox({ ...bar, top: 768 - 8 - 4 - MENU_FLOOR_PX - 22 }, { width: 1024, height: 768 }, opts(700))
    expect(floor.placement).toBe('below')
    expect(floor.maxHeight).toBe(MENU_FLOOR_PX)
  })

  it('reads the floor as three rows at the touch target', () => {
    expect(MENU_FLOOR_PX).toBe(3 * 44)
  })

  it('opens above only where there is no room under the trigger', () => {
    const low = { ...TRIGGER, top: 820 }
    const box = popoverBox(low, VIEWPORT, opts(300))
    expect(box.placement).toBe('above')
    expect(box.offset).toEqual({ bottom: 900 - 820 + 4 })
    expect(box.maxHeight).toBe(820 - 4 - 8)
  })

  it('takes the roomier side where the room under the trigger is short of the floor', () => {
    // 106px under it, short of the floor, and 748px above; a card taller than
    // either side.
    const box = popoverBox({ ...TRIGGER, top: 760 }, VIEWPORT, opts(2000))
    expect(box.placement).toBe('above')
    const middle = popoverBox({ ...TRIGGER, top: 440 }, VIEWPORT, opts(2000))
    expect(middle.placement).toBe('below')
  })

  // The calendar at 1024x768: its 309px card has 229px under the field and
  // 485px over it, so it opens over the field whole rather than scrolling its
  // Hours row and month bar out of the slot under it.
  it('opens above where the card fits whole there and not under the trigger', () => {
    const field = { left: 16, top: 497, width: 327, height: 30 }
    const box = popoverBox(field, { width: 1024, height: 768 }, opts(309))
    expect(box.placement).toBe('above')
    expect(box.offset).toEqual({ bottom: 768 - 497 + 4 })
  })

  // The first pass has measured nothing, so it lays the card out at the whole
  // viewport's height for the second to measure.
  it('gives an unmeasured card the whole viewport to lay out in', () => {
    const box = popoverBox({ ...TRIGGER, top: 700 }, VIEWPORT, opts(Infinity))
    expect(box.maxHeight).toBe(900 - 8 * 2)
    expect(box.offset).toEqual({ top: 8 })
  })

  // The bug the clipping exists for. The control panel is a scrolling column,
  // so a short window leaves the trigger below the fold while its menu is
  // open. Measured from the raw rect, a trigger at 526 in a 339px window
  // claims 514px above it, and a negative `bottom` pushes the card down past
  // the bottom edge rather than up.
  it('invents no room above a trigger that has scrolled off screen', () => {
    const short = { width: 1100, height: 339 }
    const box = popoverBox({ ...TRIGGER, top: 526 }, short, opts(495))
    expect(box.placement).toBe('above')
    expect(box.offset).toEqual({ bottom: 4 })
    expect(box.maxHeight).toBe(339 - 4 - 8)
  })

  it('invents no room below a trigger scrolled off the top', () => {
    const box = popoverBox({ ...TRIGGER, top: -400 }, VIEWPORT, opts(200))
    expect(box.placement).toBe('below')
    expect(box.offset).toEqual({ top: 4 })
    expect(box.maxHeight).toBe(900 - 0 - 4 - 8)
  })

  // Whatever the trigger does, the card stays on screen. Asserted over the
  // whole space rather than case by case, because every failure so far has
  // been a geometry nobody thought to write a case for.
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
    expect(popoverBox({ ...TRIGGER, top: 899 }, VIEWPORT, opts(0)).maxHeight).toBeGreaterThanOrEqual(0)
  })

  it('always anchors exactly one edge each way', () => {
    for (const top of [100, 820]) {
      for (const left of [10, 1300]) {
        const box = popoverBox({ ...TRIGGER, top, left }, VIEWPORT, opts(300, 240))
        expect(Object.keys(box.offset)).toHaveLength(1)
        expect(Object.keys(box.align)).toHaveLength(1)
      }
    }
  })
})

describe('popoverBox, across', () => {
  // A card is never narrower than the control that opened it, which would
  // read as a different control rather than as that one opening.
  it('is at least as wide as its trigger, and otherwise as wide as its rows', () => {
    const narrow = popoverBox(TRIGGER, VIEWPORT, opts(100, 40))
    expect(narrow.width).toBeNull()
    expect(narrow.minWidth).toBe(TRIGGER.width)
    const wide = popoverBox(TRIGGER, VIEWPORT, opts(100, 240))
    expect(wide.width).toBeNull()
    expect(wide.minWidth).toBe(TRIGGER.width)
  })

  it("lines up with the trigger's left edge where its rows fit to the right", () => {
    expect(popoverBox(TRIGGER, VIEWPORT, opts(100, 240)).align).toEqual({ left: 300 })
  })

  // The Removed list off the last menu button at 1024: its rows would run
  // past the window, so it opens leftward from the button's right edge.
  it("lines up with the trigger's right edge where the left would run off the window", () => {
    const last = { ...TRIGGER, left: 900 }
    const box = popoverBox(last, { width: 1024, height: 768 }, opts(100, 240))
    expect(box.align).toEqual({ right: 1024 - 990 })
  })

  // The model field in the panel: its list takes the Model row's width and
  // would run 200px over the map from the field's left edge, so it opens
  // leftward from its right edge and stays in the panel.
  it("keeps inside the trigger's panel by its right edge", () => {
    const field = { left: 225, top: 300, width: 118, height: 30 }
    const box = popoverBox(field, VIEWPORT, { ...opts(400), width: 327, bound: { left: 0, right: 360 } })
    expect(box.width).toBe(327)
    expect(box.align).toEqual({ right: 1400 - 343 })
  })

  it('takes a width it is given whatever its rows want', () => {
    const slot = { left: 16, top: 300, width: 327, height: 30 }
    const box = popoverBox(slot, VIEWPORT, { ...opts(300, 900), width: 327, bound: { left: 0, right: 360 } })
    expect(box.width).toBe(327)
    expect(box.align).toEqual({ left: 16 })
  })

  it('stays inside the window where it fits neither edge of its trigger', () => {
    const box = popoverBox({ ...TRIGGER, left: 40 }, { width: 400, height: 900 }, opts(100, 380))
    expect(box.align).toEqual({ left: 400 - 380 - 8 })
    const huge = popoverBox(TRIGGER, { width: 400, height: 900 }, opts(100, 2000))
    expect(huge.maxWidth).toBe(400 - 16)
  })
})

describe('nextActiveIndex', () => {
  it('steps down and up', () => {
    expect(nextActiveIndex(0, 'ArrowDown', 8)).toBe(1)
    expect(nextActiveIndex(3, 'ArrowUp', 8)).toBe(2)
  })

  // Deliberately not wrapping: Home and End are how you reach the ends. The
  // popover carries a chip row above the list (#232) and its chips are
  // deliberately NOT options: arrow keys here move a selection, and walking a
  // chip as a ninth row would point `aria-activedescendant` at something with
  // no `role="option"`. `count` stays the number of options, so the walk stops
  // at the last one and Tab is what crosses to the chips.
  it('stops at the ends rather than wrapping', () => {
    expect(nextActiveIndex(7, 'ArrowDown', 8)).toBe(7)
    expect(nextActiveIndex(0, 'ArrowUp', 8)).toBe(0)
  })

  it('jumps to either end', () => {
    expect(nextActiveIndex(5, 'Home', 8)).toBe(0)
    expect(nextActiveIndex(2, 'End', 8)).toBe(7)
  })

  // The horizontal axis belongs to the chip row alone, or one press would move
  // the list's active option and the chip focus at the same time.
  it('claims neither horizontal arrow', () => {
    expect(nextActiveIndex(2, 'ArrowLeft', 8)).toBeNull()
    expect(nextActiveIndex(2, 'ArrowRight', 8)).toBeNull()
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

describe('an option id', () => {
  // The defect this replaced: ids read `model-option-0`, so the id a screen
  // reader had been handed named whatever moved into slot 0 when the model
  // list arrived from /api/capabilities and grew from one entry to eight.
  it('names the option rather than its place in the list', () => {
    const models = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless']
    expect(models.map((id) => optionDomId('model', id))).toEqual([
      'model-option-gfs_seamless',
      'model-option-ecmwf_ifs025',
      'model-option-icon_seamless',
    ])
    // The same option keeps its id after the list around it changes.
    expect(optionDomId('model', models[2])).toBe(optionDomId('model', 'icon_seamless'))
  })

  it('is unique per option and per list', () => {
    const ids = ['a', 'b'].flatMap((list) => ['x', 'y'].map((key) => optionDomId(list, key)))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('nextToolbarIndex', () => {
  // The chip row's walk. Separate from the listbox's on purpose: both are on
  // screen at once, so one arrow key may move exactly one of them.
  it('steps along the row rather than down a column', () => {
    expect(nextToolbarIndex(0, 'ArrowRight', 3)).toBe(1)
    expect(nextToolbarIndex(2, 'ArrowLeft', 3)).toBe(1)
  })

  it('claims neither vertical arrow', () => {
    expect(nextToolbarIndex(1, 'ArrowDown', 3)).toBeNull()
    expect(nextToolbarIndex(1, 'ArrowUp', 3)).toBeNull()
  })

  // Same rule as the list: Home and End are the deliberate way to the ends.
  it('stops at the ends rather than wrapping', () => {
    expect(nextToolbarIndex(2, 'ArrowRight', 3)).toBe(2)
    expect(nextToolbarIndex(0, 'ArrowLeft', 3)).toBe(0)
    expect(nextToolbarIndex(2, 'Home', 3)).toBe(0)
    expect(nextToolbarIndex(0, 'End', 3)).toBe(2)
  })

  // Delete, Backspace and Tab all mean something on a chip, so a walk that
  // swallowed them would take the removal and the crossing to the list with it.
  it('claims no key it does not handle', () => {
    for (const key of ['Delete', 'Backspace', 'Tab', 'Escape', 'Enter', ' ']) {
      expect(nextToolbarIndex(1, key, 3)).toBeNull()
    }
  })

  it('handles an empty row', () => {
    expect(nextToolbarIndex(0, 'ArrowRight', 0)).toBeNull()
  })
})
