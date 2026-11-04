// A desk panel's title and the drag it handles (#846; TJ 2026-11-03): where
// the chip stands, the room the chart's chrome labels leave it, and the
// arithmetic of a title drag (which slot the pointer is over, where the
// accent bar stands, where the ghost is drawn). Pure, so the node suite tests
// it; `hooks/usePanelDrag.ts` measures the boxes once and writes the answers
// to the DOM.

import type { Rect } from '../../hooks/useStretchDrag'
import { PLOT_MARGIN, type PlotMargin, Y_AXIS_WIDTH_PX } from './chartPointer'
import { extremeLabelPosition } from './chartData'
import { CHART_TICK_PX } from './chartColors'

/** How far the chip stands in from the plot band's top left corner. */
export const TITLE_INSET_PX = 4

/**
 * The chip's height: the micro step's 11px at `leading-none` and 2px of
 * padding above and below (`CHART_PANEL_TITLE.chip`, pinned in
 * `styles.test.ts`).
 */
export const TITLE_HEIGHT_PX = 15

/** The air a chrome label keeps under the chip. */
const TITLE_CLEAR_PX = 2

/**
 * How far under the plot band's top a chrome label's top stands in a titled
 * panel: below the chip and its air, 21px.
 */
export const UNDER_TITLE_PX = TITLE_INSET_PX + TITLE_HEIGHT_PX + TITLE_CLEAR_PX

/** Recharts' own offset between a reference line and its label. */
export const CHROME_LABEL_OFFSET_PX = 5

/**
 * The chip's top left in its panel box. Absolutely placed at the plot band's
 * corner, so the plot keeps its size and `PLOT_MARGIN`, which a hover, a pin
 * and a finger invert through, does not move.
 */
export function titleAt(margin: PlotMargin = PLOT_MARGIN): { left: number; top: number } {
  return { left: margin.left + Y_AXIS_WIDTH_PX + TITLE_INSET_PX, top: margin.top + TITLE_INSET_PX }
}

/**
 * How far a top-left chrome label (Now, a model's end) moves down in a titled
 * panel: from Recharts' 5px under the band's top to under the chip. The
 * title stays where it is and the label moves, because a Now line near the
 * band's left edge, a window that starts today, sat its label under the chip.
 */
export const TITLED_TOP_LABEL_DY = UNDER_TITLE_PX - CHROME_LABEL_OFFSET_PX

/**
 * Where the extreme line's label goes in a panel that may wear a title: as
 * `extremeLabelPosition` says, unless the label would reach into the chip's
 * rows, where it hangs below the line and, if that still meets the chip, as
 * far down as clears it. Decided on height alone: at the narrowest panel
 * `panelWidthFloorPx` draws, a 156px band, the longest title and a label at
 * the band's right end share columns, so a rule that read widths would hold
 * only for the labels it was measured on.
 */
export function extremeLabelPlacement(
  lineY: number,
  plotTop: number,
  titled: boolean,
): { position: 'insideBottomRight' | 'insideTopRight'; dy: number } {
  const position = extremeLabelPosition(lineY, plotTop)
  if (!titled) return { position, dy: 0 }
  const clear = plotTop + UNDER_TITLE_PX
  // Above the line its glyphs stand from the offset up by the type's size.
  if (position === 'insideBottomRight' && lineY - CHROME_LABEL_OFFSET_PX - CHART_TICK_PX >= clear) return { position, dy: 0 }
  return { position: 'insideTopRight', dy: Math.max(0, clear - (lineY + CHROME_LABEL_OFFSET_PX)) }
}

/** How small the ghost of a dragged panel is drawn, a picture rather than a second panel. */
export const GHOST_SCALE = 0.5

/**
 * The ghost's transform for a pointer at `pointer`, pressed `grab` from the
 * box's top left: the ghost stands at the viewport's origin
 * (`CHART_PANEL_TITLE.ghost`) and scales from its own corner, so the point
 * that was pressed stays under the pointer at any scale.
 */
export function ghostTransform(
  pointer: { x: number; y: number },
  grab: { x: number; y: number },
  scale: number = GHOST_SCALE,
): string {
  return `translate(${pointer.x - grab.x * scale}px, ${pointer.y - grab.y * scale}px) scale(${scale})`
}

const contains = (r: Rect, x: number, y: number, by: number) =>
  x >= r.x - by && x <= r.x + r.w + by && y >= r.y - by && y <= r.y + r.h + by

/**
 * The slot a title drag would land in with the pointer at (`x`, `y`): the
 * panel box under it, each grown by `grow` on every side so a pointer in a
 * gutter counts for the panel beside it; half the gutter, so two neighbours
 * meet at its middle. A box the pointer is inside wins over one it only
 * reaches by growing. Null over the first slot, a panel too small to draw, or
 * no box at all: none of those takes a drop.
 */
export function slotAt(boxes: readonly Rect[], movable: readonly boolean[], x: number, y: number, grow: number): number | null {
  let at = boxes.findIndex((r) => contains(r, x, y, 0))
  if (at < 0) at = boxes.findIndex((r) => contains(r, x, y, grow))
  return at > 0 && movable[at] ? at : null
}

const sameRow = (a: Rect | undefined, b: Rect | undefined) => !!a && !!b && Math.abs(a.y - b.y) < 1

/**
 * Where the accent bar stands for a drop of slot `from` on slot `to`, in the
 * boxes' own pixels, `thick` across. A move lands the panel at `to` and
 * shifts the ones between (`moveMetric`), so moving later the bar marks the
 * target's trailing edge in reading order, "after this one", and moving
 * earlier its leading edge, "before this one". That edge is the box's side
 * when a panel stands beside it in its row, and otherwise its top or its
 * foot. In a gutter it stands at the gutter's middle; on an edge with no
 * gutter, at the area's own edge, it stands just inside the box, where no
 * clipping ancestor can cut it. Null when there is no move.
 */
export function dropBar(boxes: readonly Rect[], from: number, to: number, thick: number): Rect | null {
  const box = boxes[to]
  if (!box || to === from) return null
  const after = to > from
  const beside = boxes[after ? to + 1 : to - 1]
  if (sameRow(box, beside) && beside) {
    const mid = after ? (box.x + box.w + beside.x) / 2 : (beside.x + beside.w + box.x) / 2
    return { x: mid - thick / 2, y: box.y, w: thick, h: box.h }
  }
  if (after) {
    const below = boxes.filter((b) => b.y >= box.y + box.h - 0.5).map((b) => b.y)
    const y = below.length > 0 ? (box.y + box.h + Math.min(...below)) / 2 - thick / 2 : box.y + box.h - thick
    return { x: box.x, y, w: box.w, h: thick }
  }
  const above = boxes.filter((b) => b.y + b.h <= box.y + 0.5).map((b) => b.y + b.h)
  const y = above.length > 0 ? (Math.max(...above) + box.y) / 2 - thick / 2 : box.y
  return { x: box.x, y, w: box.w, h: thick }
}
