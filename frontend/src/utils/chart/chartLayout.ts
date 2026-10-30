import type { Rect } from '../../hooks/useStretchDrag'
import { clamp } from '../numbers'

/**
 * How a desk arranges the chart's panels (#499; TJ 2026-10-30, option A of
 * three mockups): the reader picks one from the Panel layout menu after the
 * picker row's +. Each is rows of panels, read top to bottom and left to
 * right in slot order. A phone always stacks.
 *
 * The names are the link's values (`layout=`). `2x2` and `2-1` are the grid
 * that shipped first, with its shared column split and crossing; `column` is
 * the stack, on one time axis; the rest stand in rows, each panel with its own
 * axes and each row with its own split.
 */
export type ChartLayout = '2x2' | '2-1' | '1-2' | '1-3' | '1-2-1' | 'row' | 'column'

/** The layouts each panel count offers, in the menu's order. */
const LAYOUTS: Record<number, readonly ChartLayout[]> = {
  1: [],
  2: ['column', 'row'],
  3: ['2-1', '1-2', 'row', 'column'],
  4: ['2x2', 'row', 'column', '1-3', '1-2-1'],
}

/** The arrangement a count opens in: the one that shipped before the menu. */
const DEFAULT: Record<number, ChartLayout> = { 1: 'column', 2: 'column', 3: '2-1', 4: '2x2' }

/** Each layout's thumbnail name in the menu, approved 2026-10-30. */
export const LAYOUT_NAMES: Record<ChartLayout, string> = {
  '2x2': '2 by 2',
  '2-1': '2 over 1',
  '1-2': '1 over 2',
  '1-3': '1 over 3',
  '1-2-1': '1, 2, 1',
  row: 'One row',
  column: 'One column',
}

/** The layout button's accessible name, approved 2026-10-30. */
export const LAYOUT_LABEL = 'Panel layout'

export function layoutsFor(count: number): readonly ChartLayout[] {
  return LAYOUTS[count] ?? []
}

export function defaultLayout(count: number): ChartLayout {
  return DEFAULT[count] ?? 'column'
}

export function isChartLayout(raw: string): raw is ChartLayout {
  return raw in LAYOUT_NAMES
}

/**
 * The layout a count draws: the one asked for when that count offers it,
 * otherwise the count's default. A reader's choice is kept while panels come
 * and go, and comes back when the count offers it again.
 */
export function layoutFor(asked: ChartLayout | null, count: number): ChartLayout {
  return asked !== null && layoutsFor(count).includes(asked) ? asked : defaultLayout(count)
}

/** A layout's rows, as the number of panels in each, top first. */
export function rowsOf(layout: ChartLayout, count: number): number[] {
  switch (layout) {
    case '2x2':
      return [2, 2]
    case '2-1':
      return [2, 1]
    case '1-2':
      return [1, 2]
    case '1-3':
      return [1, 3]
    case '1-2-1':
      return [1, 2, 1]
    case 'row':
      return [count]
    case 'column':
      return Array.from({ length: count }, () => 1)
  }
}

/** Every row's and every row's panels' shares of the area, even. */
export interface RowShares {
  rows: readonly number[]
  cols: readonly (readonly number[])[]
}

export function evenRows(rows: readonly number[]): RowShares {
  return {
    rows: rows.map(() => 1 / rows.length),
    cols: rows.map((n) => Array.from({ length: n }, () => 1 / n)),
  }
}

/**
 * Where every panel stands in an area `w` by `h` with `gap` between rows and
 * between the panels of a row, in panel order. The arithmetic a drag paints
 * from, and the one the gutters stand on.
 */
export function rowRects(shares: RowShares, w: number, h: number, gap: number): Rect[] {
  const out: Rect[] = []
  const freeH = Math.max(0, h - gap * (shares.rows.length - 1))
  let y = 0
  shares.rows.forEach((rowShare, r) => {
    const rowH = rowShare * freeH
    const cols = shares.cols[r] ?? []
    const freeW = Math.max(0, w - gap * (cols.length - 1))
    let x = 0
    for (const colShare of cols) {
      const cw = colShare * freeW
      out.push({ x, y, w: cw, h: rowH })
      x += cw + gap
    }
    y += rowH + gap
  })
  return out
}

/** One share list after the gutter after `at` moves `delta` of `total`, held to [0, 1] with no floor. */
export function sharesAfterDrag(start: readonly number[], at: number, delta: number, total: number): readonly number[] {
  const a = start[at]
  const b = start[at + 1]
  if (a === undefined || b === undefined || total <= 0) return start
  const moved = clamp(delta / total, -a, b)
  const next = start.slice()
  next[at] = a + moved
  next[at + 1] = b - moved
  return next
}
