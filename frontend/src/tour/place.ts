import type { TourSpot } from '../utils/tourSteps'

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
 * Below this width the card is a sheet along one edge rather than a box
 * beside its target. The number is where the box stops fitting beside the
 * docked panel: 360px of panel, the gap, 320px of card and the margin. Above
 * it the card has ONE place, to the right of what it frames; below it, one
 * edge. It is not the app's desktop breakpoint, because at 1000px the box
 * still fits and a sheet there hides the map for nothing.
 */
export const SHEET_MAX_W = 720

/**
 * Which edge the sheet takes: the bottom, unless the spotlight reaches into
 * the band the sheet would cover, in which case the top. The Analyze button
 * and the results sheet both stand at the bottom of a phone's screen, and a
 * card over the control it explains is the one place it must not be.
 */
export function sheetEdge(light: Box | null, cardHeight: number, viewportHeight: number): 'top' | 'bottom' {
  if (light === null) return 'bottom'
  const band = viewportHeight - cardHeight - 2 * VIEWPORT_MARGIN
  return light.top + light.height > band ? 'top' : 'bottom'
}

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

/**
 * A panel section between the panel's rules. The rule above a section is the
 * section's own top border, so its box top is the rule; the first section has
 * none and takes the top of the column it sits in, where the header's rule
 * is. The rule below is the next section's top border, so the next box's top;
 * the last section takes the bottom of the column, where the footer's rule is.
 * Width is the column's, edge to edge, the way the header's and the footer's
 * rules run (TJ, 2026-09-29).
 */
export function sectionBox(own: Box, previous: Box | null, next: Box | null, column: Box): Box {
  const top = previous ? own.top : column.top
  const bottom = next ? next.top : column.top + column.height
  return { top, left: column.left, width: column.width, height: bottom - top }
}

/** The spotlight's box: the target, grown by the pad on every side. */
/**
 * The part of a box above a line: what shows of a target that runs under
 * another surface (`TourStep.under`). A box wholly below the line is one of
 * no height at the line, so the dim keeps a hole where the target starts.
 */
export function clipAbove(box: Box, limitTop: number): Box {
  const bottom = Math.min(box.top + box.height, limitTop)
  const top = Math.min(box.top, limitTop)
  return { ...box, top, height: Math.max(0, bottom - top) }
}

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

/**
 * How the panel scrolls a step's target into view. A section aligns its top
 * with the panel's top, so as much of it shows as the panel has room for; a
 * control or a surface scrolls only as far as it must. `nearest` alone left a
 * section taller than the panel where it stood whenever its top was already
 * in view: at 1300 by 763 the Metrics step lit two of its rows and left the
 * metric list under the panel's footer.
 */
export function scrollBlock(spot: TourSpot | undefined): ScrollLogicalPosition {
  return spot === 'section' ? 'start' : 'nearest'
}
