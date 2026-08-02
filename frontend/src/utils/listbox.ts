/**
 * The two things a popover listbox has to get right that a native `<select>`
 * would have got right for free: where the panel lands, and where the arrow
 * keys go.
 *
 * Both live here rather than in the component because Vitest runs with no DOM,
 * so anything left inside `ModelPicker.tsx` is untestable by construction. The
 * component keeps only the wiring: measure, call these, apply.
 */

/** Just the parts of a DOMRect the placement math reads. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * A fixed-position box. Anchored by `top` when it opens downward and by
 * `bottom` when it opens upward, so the upward case does not need to know its
 * own height before it has been laid out.
 */
export interface PopoverBox {
  left: number
  width: number
  maxHeight: number
  placement: 'below' | 'above'
  top?: number
  bottom?: number
}

export interface PopoverOptions {
  /** What the panel wants, if the viewport allows it. */
  preferredWidth: number
  /** Between the trigger and the panel. */
  gap: number
  /** Between the panel and the edge of the viewport. */
  margin: number
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

/**
 * Where to put a panel hanging off `trigger`.
 *
 * Fixed coordinates rather than an absolutely-positioned child, because the
 * control panel is an `overflow-y-auto` column: a child positioned inside it is
 * clipped at the scroll boundary, which for a control near the bottom of the
 * panel would cut the list in half.
 *
 * The panel may be wider than its trigger. That is the whole reason it exists —
 * the sidebar is too narrow to read eight summaries in, and a floating panel
 * can spill over the map. It is never *narrower* than the trigger, which would
 * read as a different control rather than as that one opening.
 *
 * Opens downward unless there is more room above, so a trigger low on a short
 * screen flips instead of squeezing into forty pixels. `maxHeight` is whatever
 * the chosen side actually has, so the panel scrolls internally rather than
 * running off screen.
 */
export function popoverBox(
  trigger: Rect,
  viewport: { width: number; height: number },
  { preferredWidth, gap, margin }: PopoverOptions,
): PopoverBox {
  const width = clamp(preferredWidth, trigger.width, viewport.width - margin * 2)
  const left = clamp(trigger.left, margin, viewport.width - width - margin)

  const below = viewport.height - (trigger.top + trigger.height) - gap - margin
  const above = trigger.top - gap - margin
  if (below >= above) {
    return {
      left,
      width,
      maxHeight: Math.max(below, 0),
      placement: 'below',
      top: trigger.top + trigger.height + gap,
    }
  }
  return {
    left,
    width,
    maxHeight: Math.max(above, 0),
    placement: 'above',
    bottom: viewport.height - trigger.top + gap,
  }
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
