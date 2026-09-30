/**
 * Where the tutorial card stands, as arithmetic over rectangles (#536). Pure,
 * so the node suite proves the flips without a page: `Tour.tsx` measures and
 * this decides. The card prefers the right of its target, then below, then
 * above, then the left, taking the first side with room for it. Right first
 * because every panel section has the map beside it, and a card standing on
 * the map hides no control, where one hanging below covers the next section. A
 * target too big for any side (the map) gets the card inside its bottom edge.
 * Every answer is clamped inside the viewport margin, so a card never leaves
 * the screen.
 */

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** How far the spotlight reaches past the control's own edge. */
export const SPOTLIGHT_PAD = 6
/** The gap between the spotlight and the card. */
export const CARD_GAP = 12
/** The least the card keeps from a viewport edge. */
export const VIEWPORT_MARGIN = 16
/**
 * Below this width the card is a sheet along the bottom edge rather than a
 * box beside its target. Tailwind's `sm`, not the app's desktop breakpoint:
 * at 1000px a 320px card still stands beside a 360px panel with room to
 * spare, and a sheet there hides the map for nothing.
 */
export const SHEET_MAX_W = 640

/** Whether the card is a box beside its target or a sheet along the bottom. */
export function cardMode(viewportWidth: number): 'card' | 'sheet' {
  return viewportWidth < SHEET_MAX_W ? 'sheet' : 'card'
}

/** The smallest box holding every given box; `null` when there is none. */
export function unionBox(boxes: readonly (Box | null)[]): Box | null {
  const real = boxes.filter((b): b is Box => b !== null)
  if (real.length === 0) return null
  const top = Math.min(...real.map((b) => b.top))
  const left = Math.min(...real.map((b) => b.left))
  const bottom = Math.max(...real.map((b) => b.top + b.height))
  const right = Math.max(...real.map((b) => b.left + b.width))
  return { top, left, width: right - left, height: bottom - top }
}

/** The spotlight's box: the target, grown by the pad on every side. */
export function spotlight(target: Box, pad = SPOTLIGHT_PAD): Box {
  return {
    top: target.top - pad,
    left: target.left - pad,
    width: target.width + 2 * pad,
    height: target.height + 2 * pad,
  }
}

const clamp = (value: number, lo: number, hi: number): number => Math.min(Math.max(value, lo), hi)

/** The card's top-left corner beside the spotlight, inside the viewport. */
export function placeCard(light: Box, card: Size, viewport: Size): { top: number; left: number } {
  const m = VIEWPORT_MARGIN
  const maxLeft = Math.max(m, viewport.width - card.width - m)
  const maxTop = Math.max(m, viewport.height - card.height - m)
  const centredLeft = clamp(light.left + light.width / 2 - card.width / 2, m, maxLeft)
  const centredTop = clamp(light.top + light.height / 2 - card.height / 2, m, maxTop)

  const right = light.left + light.width + CARD_GAP
  if (right + card.width + m <= viewport.width) return { top: centredTop, left: right }

  const below = light.top + light.height + CARD_GAP
  if (below + card.height + m <= viewport.height) return { top: below, left: centredLeft }

  const above = light.top - CARD_GAP - card.height
  if (above >= m) return { top: above, left: centredLeft }

  const left = light.left - CARD_GAP - card.width
  if (left >= m) return { top: centredTop, left }

  // Nothing fits beside it: the target is most of the screen. Stand inside
  // its bottom edge, where the map's own chrome is thinnest.
  const insideBottom = light.top + light.height - CARD_GAP - card.height
  return { top: clamp(insideBottom, m, maxTop), left: centredLeft }
}

/** Two boxes that draw the same pixels; a re-measure that changed nothing paints nothing. */
export function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}
