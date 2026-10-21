/**
 * The two things a menu has to get right that a native `<select>` would have
 * got right for free: where the card lands, and where the arrow keys go.
 *
 * Both live here rather than in the component so the node test project can
 * check every placement and every key without a page. The component keeps
 * only the wiring: measure, call these, apply.
 */

import { clamp } from './numbers'

/** Just the parts of a DOMRect the placement math reads. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** A fixed-position box, ready to render. */
export interface PopoverBox {
  /**
   * The edge the card is anchored by across: its left on the trigger's left,
   * or its right on the trigger's right, ready to spread into a style object.
   * A right-hand card anchors by `right` so it keeps the trigger's edge
   * whatever width its rows give it, with no second measurement.
   */
  align: { left: number } | { right: number }
  /** A width the card takes whatever its rows want, or null for its rows' width. */
  width: number | null
  /** Never narrower than its trigger, which would read as another control. */
  minWidth: number
  /** Never wider than the viewport less its margins. */
  maxWidth: number
  maxHeight: number
  /** Under the trigger, or over it where there is no room under it. */
  placement: 'below' | 'above'
  /**
   * The anchored edge down the page, ready to spread straight into a style
   * object. One key, never both, and which one is this function's business
   * rather than the caller's: an upward card anchors by `bottom` so it needs
   * no height.
   *
   * A caller that re-derived this from `placement` got it wrong the first time
   * it was tried: a ternary sent one branch down the `bottom` key with nothing
   * in it, and a fixed element with neither edge anchored silently falls back
   * to its static position at the end of the body. Handing over the finished
   * pair makes that unspellable.
   */
  offset: { top: number } | { bottom: number }
}

export interface PopoverOptions {
  /** Between the trigger and the card. */
  gap: number
  /** Between the card and the edge of the viewport, or of its panel. */
  margin: number
  /**
   * How tall the content wants to be, measured. `Infinity` asks for as much
   * room as the viewport can give, which is what the first pass does before
   * anything has been laid out to measure.
   */
  desiredHeight: number
  /** How wide the rows want the card, measured; 0 before the first pass. */
  desiredWidth: number
  /**
   * A width the card takes whatever its rows say: the model list's panel row
   * and the calendar's field (record 0201). Without one the card is its
   * rows' width, never narrower than the trigger.
   */
  width?: number
  /**
   * The edges of the panel the trigger stands in, which the card stays
   * inside where it can: a field's menu in the control panel opens leftward
   * from the field's right edge rather than spilling over the map.
   */
  bound?: { left: number; right: number }
}

// The least room under a trigger that a menu still opens down into, and
// scrolls in, rather than opening above it: three 44px rows, the fewest that
// read as a list on a phone rather than as a slot.
export const MENU_FLOOR_PX = 132

/**
 * Where a menu stands against its trigger: the one placement every desk menu
 * takes (#714; record 0201), the Layers chip's card made the general case.
 *
 * Fixed coordinates rather than an absolutely-positioned child, because the
 * control panel is an `overflow-y-auto` column: a child positioned inside it is
 * clipped at the scroll boundary, which for a control near the bottom of the
 * panel would cut the list in half.
 *
 * **Across**: at least the trigger's width, and otherwise its rows' (or the
 * `width` it is given), lined up with the trigger's left edge, or with its
 * right edge where the left would run the card past the panel it stands in
 * or the window. Only where neither fits does it give up the trigger's edges
 * and stay inside the window.
 *
 * **Down**: `gap` under the trigger whenever the content fits there. Where
 * it does not, over the trigger if it fits whole there: the calendar at
 * 1024x768 and on a phone, which would otherwise scroll its Hours row and
 * month bar out of a slot under its field. Where it fits neither side, under
 * the trigger while the room there is at least `MENU_FLOOR_PX` to scroll in or
 * is the roomier side: the Columns list scrolls under the bar at 1024x768
 * rather than standing up from a bar the reader is looking down at (record
 * 0134 measured it at 227px under and 503px over). Over the trigger only
 * where that leaves no room under it, which is not a hypothetical: a short
 * window puts the bar at the foot of the screen.
 *
 * An unmeasured card (`desiredHeight` of `Infinity`, the first pass) is given
 * the whole viewport's height, so it lays out at its natural height for the
 * second pass to measure. Both passes run before paint, so this box is never
 * seen; without it a card capped at the room below would measure as exactly
 * that tall, and the placement could not tell "taller than the gap" from
 * "taller than the screen".
 *
 * The trigger's edges are clipped into the viewport before anything is
 * measured from them. It can genuinely be off screen: the control panel is a
 * scrolling column, so a short window puts the model row below the fold while
 * its menu is still open. Measuring from the raw rect then invents room that
 * is not there, and a negative `bottom` pushes the card down past the bottom
 * edge instead of up.
 */
export function popoverBox(
  trigger: Rect,
  viewport: { width: number; height: number },
  { gap, margin, desiredHeight, desiredWidth, width: fixed, bound }: PopoverOptions,
): PopoverBox {
  const maxWidth = Math.max(viewport.width - margin * 2, 0)
  const width = Math.min(fixed ?? Math.max(trigger.width, desiredWidth), maxWidth)
  const right = trigger.left + trigger.width
  const leftLimit = Math.max(bound?.left ?? 0, 0) + margin
  const rightLimit = Math.min(bound?.right ?? viewport.width, viewport.width) - margin
  let align: PopoverBox['align']
  if (trigger.left + width <= rightLimit) align = { left: trigger.left }
  else if (right - width >= leftLimit) align = { right: viewport.width - right }
  else align = { left: clamp(trigger.left, margin, viewport.width - width - margin) }

  const triggerTop = clamp(trigger.top, 0, viewport.height)
  const triggerBottom = clamp(trigger.top + trigger.height, 0, viewport.height)
  const below = Math.max(viewport.height - triggerBottom - gap - margin, 0)
  const above = Math.max(triggerTop - gap - margin, 0)
  const sized = { align, width: fixed === undefined ? null : width, minWidth: Math.min(trigger.width, maxWidth), maxWidth }
  if (desiredHeight === Infinity) {
    return { ...sized, maxHeight: Math.max(viewport.height - margin * 2, 0), placement: 'below', offset: { top: margin } }
  }
  const fitsAbove = desiredHeight <= above
  if (desiredHeight <= below || (!fitsAbove && (below >= MENU_FLOOR_PX || below >= above))) {
    return { ...sized, maxHeight: below, placement: 'below', offset: { top: triggerBottom + gap } }
  }
  return { ...sized, maxHeight: above, placement: 'above', offset: { bottom: viewport.height - triggerTop + gap } }
}

/**
 * Where a key moves the active option, or null if the key is not ours.
 *
 * Null rather than "unchanged" is what lets the caller leave the event alone:
 * swallowing every keystroke in a listbox is how Tab stops working and how a
 * screen reader's own shortcuts get eaten.
 *
 * Does not wrap. Wrapping reads as a jump rather than as movement, and the
 * WAI-ARIA listbox pattern makes it optional; Home and End are the deliberate
 * way to reach the ends.
 *
 * `count` is the number of OPTIONS, and nothing else in the popover is one.
 * The chip row above the list is a toolbar of buttons: its arrow keys move
 * focus rather than a selection, and walking a chip as a ninth row would mean
 * `aria-activedescendant` pointing at something with no `role="option"`. Tab
 * is what crosses between them, which is what the pattern reserves for
 * leaving a list.
 */
export function nextActiveIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowDown':
      return Math.min(current + 1, count - 1)
    case 'ArrowUp':
      return Math.max(current - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * The same walk along a row rather than down a column: the chip toolbar above
 * the list.
 *
 * A separate function rather than an axis flag, because the two keyboards are
 * separate by design — the arrows that move the listbox's active option must
 * not also move the chips, or one press would do two things while both are on
 * screen. Left and right are the toolbar's axis; Home and End are shared, and
 * are the deliberate way to reach the ends here too, since this walk does not
 * wrap for the same reason the listbox's does not.
 */
export function nextToolbarIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowRight':
      return Math.min(current + 1, count - 1)
    case 'ArrowLeft':
      return Math.max(current - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * The DOM id of one option, built from the option's own identity.
 *
 * `aria-activedescendant` is a promise that an id resolves to the highlighted
 * row. An id built from an array position cannot keep it: the list here arrives
 * from `/api/capabilities`, so it grows from one fallback entry to eight after
 * the fetch answers, and every position then names a different option than it
 * did a moment earlier. Arrow-key movement stays positional, which is what
 * `nextActiveIndex` is; only the id has to be a name.
 */
export function optionDomId(listId: string, optionKey: string): string {
  return `${listId}-option-${optionKey}`
}
