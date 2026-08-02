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

/** A fixed-position box, ready to render. */
export interface PopoverBox {
  left: number
  width: number
  maxHeight: number
  /**
   * `below` and `above` sit clear of the trigger. `shifted` means the panel is
   * taller than either side alone and overlaps the trigger to use the whole
   * viewport, which is the difference between a scrollbar and no scrollbar.
   */
  placement: 'below' | 'above' | 'shifted'
  /**
   * The anchored edge, ready to spread straight into a style object. One key,
   * never both, and which one is this function's business rather than the
   * caller's — an upward panel anchors by `bottom` so it needs no height, and
   * the other two anchor by `top`.
   *
   * A caller that re-derived this from `placement` got it wrong the first time
   * it was tried: a ternary on `below` sent `shifted` down the `bottom` branch,
   * which set `bottom: undefined`, and a fixed element with neither edge
   * anchored silently falls back to its static position at the end of the body.
   * Handing over the finished pair makes that unspellable.
   */
  offset: { top: number } | { bottom: number }
}

export interface PopoverOptions {
  /** What the panel wants, if the viewport allows it. */
  preferredWidth: number
  /** Between the trigger and the panel. */
  gap: number
  /** Between the panel and the edge of the viewport. */
  margin: number
  /**
   * How tall the content wants to be, measured. `Infinity` asks for as much
   * room as the viewport can give, which is what the first pass does before
   * anything has been laid out to measure.
   */
  desiredHeight: number
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
 * Opens downward when the content fits there, flips above when it fits there
 * instead, and otherwise stops trying to sit clear of the trigger at all.
 *
 * That last case is the one worth explaining. Preferring the roomier side and
 * scrolling inside it is the obvious rule and it is wrong on an ordinary
 * laptop: a control halfway down the window has perhaps 490px above it and
 * 330px below, so a 520px list scrolls even though the window is 875px tall
 * and could show the whole thing twice over. A dropdown does not actually have
 * to clear its trigger. When neither side fits it overlaps instead, taking the
 * full viewport, and a scrollbar then means the content genuinely does not fit
 * on the screen rather than that it did not fit in the gap.
 */
export function popoverBox(
  trigger: Rect,
  viewport: { width: number; height: number },
  { preferredWidth, gap, margin, desiredHeight }: PopoverOptions,
): PopoverBox {
  const width = clamp(preferredWidth, trigger.width, viewport.width - margin * 2)
  const left = clamp(trigger.left, margin, viewport.width - width - margin)

  // The trigger's own edges, clipped into the viewport before anything is
  // measured from them. It can genuinely be off screen: the control panel is a
  // scrolling column, so a short window puts the model row below the fold while
  // its popover is still open. Measuring from the raw rect then invents room
  // that is not there — a trigger at y=526 in a 339px window reports 514px
  // "above" it — and the `above` branch turns that into a negative `bottom`,
  // which pushes the panel *down* past the bottom edge instead of up.
  const triggerTop = clamp(trigger.top, 0, viewport.height)
  const triggerBottom = clamp(trigger.top + trigger.height, 0, viewport.height)

  const below = Math.max(viewport.height - triggerBottom - gap - margin, 0)
  const above = Math.max(triggerTop - gap - margin, 0)
  const whole = Math.max(viewport.height - margin * 2, 0)

  if (desiredHeight <= below) {
    return {
      left,
      width,
      maxHeight: below,
      placement: 'below',
      offset: { top: triggerBottom + gap },
    }
  }
  if (desiredHeight <= above) {
    return {
      left,
      width,
      maxHeight: above,
      placement: 'above',
      offset: { bottom: viewport.height - triggerTop + gap },
    }
  }
  // Anchored to the trigger's own top where the viewport allows it, then pushed
  // up only as far as it must be to fit. Keeping it near the trigger is what
  // stops the panel from appearing to belong to something else on the page.
  const height = Math.min(desiredHeight, whole)
  return {
    left,
    width,
    maxHeight: whole,
    placement: 'shifted',
    offset: { top: clamp(triggerTop, margin, viewport.height - margin - height) },
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
