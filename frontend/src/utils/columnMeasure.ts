import type { ColumnSpan, DropEdge } from './columnDrag'

// What a results-table column measures on screen. The arithmetic of a width
// lives in columnResize.ts and the geometry of a drag in columnDrag.ts; this
// module is the DOM half both of them are fed from: a header's content box,
// where each header sits, where an insert line goes, and how wide every cell
// in a column wants to be. No React, so each read is testable in jsdom.

/**
 * A column's content width: the header's box minus its own padding, which
 * under auto layout is the width the widest cell has forced on the column.
 */
export function contentWidth(th: HTMLElement): number {
  const cs = getComputedStyle(th)
  return th.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
}

/** Where each reorderable header in a row sits, left to right. */
export function headerSpans(row: Element | null): ColumnSpan[] {
  return [...(row?.querySelectorAll('th[data-col]') ?? [])].map((cell) => {
    const rect = cell.getBoundingClientRect()
    return { key: (cell as HTMLElement).dataset.col as string, start: rect.left, end: rect.right }
  })
}

/** Where a drag's insert line stands, in viewport coordinates. */
export interface InsertLine {
  x: number
  top: number
  height: number
}

/** The insert line for a drop edge, or null. */
export function insertLine(row: Element | null, edge: DropEdge | null): InsertLine | null {
  const cell = edge && row?.querySelector(`th[data-col="${edge.key}"]`)
  if (!edge || !cell) return null
  const rect = cell.getBoundingClientRect()
  return { x: edge.after ? rect.right : rect.left, top: rect.top, height: rect.height }
}

/**
 * The content width of every cell in the header's column, the header included.
 *
 * scrollWidth alone cannot answer this: the name cell truncates through flex,
 * which SHRINKS content to the wrapper instead of overflowing it, so a clipped
 * wrapper reports its own width back. Instead every wrapper is let out to
 * max-content for one synchronous layout, measured, and restored; two reflows
 * per double-click.
 *
 * Fractional widths, deliberately: the integer scroll metrics round, and a fit
 * that rounds first and pads after made the first double-click widen a column
 * that already fit. autoFitWidth ceils once, at the end. Cells without a
 * wrapper (none today) fall back to their own box.
 */
export function fitContents(table: HTMLTableElement, th: HTMLTableCellElement): number[] {
  const body = table.tBodies[0]
  const cells: HTMLElement[] = [th]
  for (const row of body ? Array.from(body.rows) : []) {
    const cell = row.cells[th.cellIndex]
    if (cell) cells.push(cell)
  }
  const inners = cells.map((c) => c.querySelector<HTMLElement>('[data-col-inner]'))
  const saved = inners.map((el) => el?.style.width ?? '')
  inners.forEach((el) => {
    if (el) el.style.width = 'max-content'
  })
  const contents = cells.map((c, i) => {
    const inner = inners[i]
    if (inner) return inner.getBoundingClientRect().width
    const cs = getComputedStyle(c)
    return c.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  })
  inners.forEach((el, i) => {
    if (el) el.style.width = saved[i]
  })
  return contents
}
