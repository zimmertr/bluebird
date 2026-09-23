import { memo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { DestinationResult } from '../types'
import type { SortDir, SortKey, ColDef } from '../utils/tableColumns'
import { autoFitWidth, dragWidth } from '../utils/columnResize'
import {
  GHOST_MAX_PX,
  dragBegins,
  dropEdge,
  ghostLeft,
  keyAtPosition,
  travel,
  type ColumnSpan,
} from '../utils/columnDrag'
import { ACCENT, CARRIED, CHOICE_INPUT, DRAG_GHOST, DRAG_GRIP_ACTIVE, DRAG_INSERT, TABLE } from '../styles'

// The results table's header row and everything a press on it can do: sort,
// move a column, resize one, and fit one to its content. Apart from the body
// because none of it reads a row, so it is memoized on its own and the body's
// re-renders (the wildfire cells tick while the fire check is in flight) do not
// redraw it.

// Every data cell renders inside this wrapper. Sized, it pins the cell's
// content box to the chosen width; unsized it is inert — but it must exist
// either way, because it is what auto-fit measures. Measuring the cell
// itself reads the STRETCHED box (auto layout hands min-w-full's spare
// space to every column), which made the first double-click widen columns
// that already fit their content.
//
// The clipping classes ride ONLY with a width. On an unsized column a
// truncatable block stops defending its content in auto table layout — the
// column can be dealt less than its own header, which then renders
// pre-clipped and makes the first fit look like it widened the column when
// it merely un-clipped it.
export function sized(
  widths: Record<string, number>,
  key: string,
  content: ReactNode,
  display: 'block' | 'inline' = 'block',
): ReactNode {
  const w = widths[key]
  const clip = w !== undefined ? 'overflow-hidden text-ellipsis' : ''
  // Inline for headers: the sort arrow renders BESIDE this wrapper, outside
  // any pinned width, so a column fitted before it was ranked does not clip
  // its own label when the arrow arrives — the column grows by the arrow.
  const flow = display === 'inline' ? 'inline-block align-bottom' : ''
  const className = `${clip} ${flow}`.trim()
  return (
    <div
      data-col-inner
      className={className || undefined}
      style={w !== undefined ? { width: w } : undefined}
    >
      {content}
    </div>
  )
}

interface Props {
  // The columns in the order the table draws them.
  columns: ColDef[]
  detailSortKey: SortKey
  detailSortDir: SortDir
  onDetailSort: (key: SortKey, dir: SortDir) => void
  // Absent means the header does not reorder.
  onColumnMove?: (fromKey: string, toKey: string) => void
  columnWidths?: Record<string, number>
  onColumnWidthsChange?: (widths: Record<string, number>) => void
  // The whole table, because auto-fit measures every body cell in a column.
  tableRef: RefObject<HTMLTableElement | null>
  // The leading chart column and its "select all" box.
  showChartCol: boolean
  chartableRows: DestinationResult[]
  headState: 'all' | 'some' | 'none'
  onChartRange?: (rows: DestinationResult[], selected: boolean) => void
}

function ResultsTableHeader({
  columns: orderedColumns,
  detailSortKey,
  detailSortDir,
  onDetailSort,
  onColumnMove,
  columnWidths,
  onColumnWidthsChange,
  tableRef,
  showChartCol,
  chartableRows,
  headState,
  onChartRange,
}: Props) {
  // Every header click is a reading aid: it sorts the displayed rows in place
  // and changes NOTHING else — not the ranking, not the column order, not the
  // cell shading. Four of these columns are also ranking keys, and a click
  // here used to re-rank the whole field through the panel knob; TJ overruled
  // that in the #242 review, because only four of the fourteen headers doing
  // it read as a bug, and a header click that reshuffles the columns pulls
  // the table out from under the cursor. The Ranking control in the panel is
  // the one thing that re-ranks, reorders the groups, and moves the shading.
  function handleSort(key: SortKey) {
    onDetailSort(key, key === detailSortKey && detailSortDir === 'asc' ? 'desc' : 'asc')
  }

  // ---- Column resizing. The arithmetic lives in utils/columnResize.ts; this
  // block is only the DOM: where the pointer is, how wide a header's content
  // renders, and which cells belong to a column.
  const widths = columnWidths ?? {}
  const widthsRef = useRef(widths)
  widthsRef.current = widths

  // A column's content width: the header's box minus its own padding, which
  // under auto layout is the width the widest cell has forced on the column.
  function thContentWidth(th: HTMLElement): number {
    const cs = getComputedStyle(th)
    return th.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  }

  function beginColumnResize(e: React.PointerEvent, key: string) {
    if (!onColumnWidthsChange) return
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement
    const start = widthsRef.current[key] ?? thContentWidth(th)
    const startX = e.clientX
    const onMove = (ev: PointerEvent) =>
      onColumnWidthsChange({ ...widthsRef.current, [key]: dragWidth(start, ev.clientX - startX) })
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // What a drag is carrying and where it would put it. Both are drawn — the
  // ghost under the pointer and the line in the gap — so both are state.
  //
  // The move is made on release rather than on every frame. Reordering live
  // means the columns shuffle under the reader's hand while they are still
  // choosing, which on a wide table is a lot of movement to read; the ghost and
  // the line say the same thing without moving anything until it is decided.
  const [carry, setCarry] = useState<{
    key: string
    label: ReactNode
    x: number
    y: number
  } | null>(null)
  const [insert, setInsert] = useState<{ x: number; top: number; height: number } | null>(
    null,
  )
  // Set while a drag is ending, and read by the click that may follow it: a
  // pointerup on the cell the press began in still fires a click, and without
  // this a reorder would sort the table as well as move the column.
  //
  // Cleared on a timeout rather than by that click, because the click only
  // happens when the pointer went down and up on the SAME cell. A drag that
  // ended anywhere else fires none, and a flag waiting to be consumed would sit
  // there and swallow the reader's next real click instead.
  const draggedRef = useRef(false)

  // A press on a header. It is a sort until it has travelled far enough (a
  // mouse) or been held long enough (a finger); `columnDrag.ts` owns which
  // question each pointer is asked. The resize handle stops its own
  // pointerdown, so a grab of the edge never reaches here.
  function beginColumnDrag(e: React.PointerEvent, key: string) {
    if (!onColumnMove) return
    const th = e.currentTarget as HTMLElement
    const startedAt = performance.now()
    const startX = e.clientX
    const startY = e.clientY
    let live = false

    const spans = (): ColumnSpan[] =>
      [...(th.parentElement?.querySelectorAll('th[data-col]') ?? [])].map((cell) => {
        const rect = cell.getBoundingClientRect()
        return { key: (cell as HTMLElement).dataset.col as string, start: rect.left, end: rect.right }
      })

    const label = orderedColumns.find((c) => c.key === key)?.label ?? key
    let landing: string | null = null

    const move = (ev: PointerEvent) => {
      if (!live) {
        const far = travel(ev.clientX - startX, ev.clientY - startY)
        if (!dragBegins(ev.pointerType, far, performance.now() - startedAt)) return
        live = true
        draggedRef.current = true
      }
      const here = spans()
      landing = keyAtPosition(here, ev.clientX)
      setCarry({ key, label, x: ev.clientX, y: ev.clientY })

      const edge = dropEdge(here, key, ev.clientX)
      const cell = edge && th.parentElement?.querySelector(`th[data-col="${edge.key}"]`)
      if (cell) {
        const rect = (cell as HTMLElement).getBoundingClientRect()
        setInsert({ x: edge.after ? rect.right : rect.left, top: rect.top, height: rect.height })
      }
    }

    const end = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
      if (live) {
        window.setTimeout(() => (draggedRef.current = false), 0)
        if (landing && landing !== key) onColumnMove(key, landing)
      }
      setCarry(null)
      setInsert(null)
    }

    // On document rather than on the header, which is what `beginColumnResize`
    // above does and for the same reason: a drag leaves the cell it started in
    // on its first frame, and a pointermove over a sibling cell never reaches
    // it. Pointer capture would answer it too, but capturing before the press
    // is known to be a drag changes where an ordinary click lands.
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
  }

  // Double-click on a handle: fit the longest cell. scrollWidth alone cannot
  // answer this — the name cell truncates through flex, which SHRINKS content
  // to the wrapper instead of overflowing it, so a clipped wrapper reports its
  // own width back. Instead every wrapper is let out to max-content for one
  // synchronous layout, measured, and restored; two reflows per double-click.
  function autoFitColumn(e: React.MouseEvent, key: string) {
    if (!onColumnWidthsChange || !tableRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLTableCellElement
    const body = tableRef.current.tBodies[0]
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
    // Fractional widths, deliberately: the integer scroll metrics round, and
    // a fit that rounds first and pads after made the first double-click
    // widen a column that already fit. autoFitWidth ceils once, at the end.
    // Cells without a wrapper (none today) fall back to their own box.
    const contents = cells.map((c, i) => {
      const inner = inners[i]
      if (inner) return inner.getBoundingClientRect().width
      const cs = getComputedStyle(c)
      return c.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    })
    inners.forEach((el, i) => {
      if (el) el.style.width = saved[i]
    })
    onColumnWidthsChange({ ...widthsRef.current, [key]: autoFitWidth(contents) })
  }

  return (
    <>
      <thead className="sticky top-0 bg-slate-700 z-10">
        <tr>
          {showChartCol && (
            <th className={`${TABLE.head} w-6`}>
              {onChartRange && chartableRows.length > 0 && (
                <input
                  type="checkbox"
                  checked={headState === 'all'}
                  ref={(el) => {
                    // `indeterminate` is a DOM property, not an attribute, so
                    // React can't set it via a prop — sync it on every render.
                    if (el) el.indeterminate = headState === 'some'
                  }}
                  onChange={() => onChartRange(chartableRows, headState !== 'all')}
                  aria-label="Chart all destinations"
                  className={CHOICE_INPUT}
                />
              )}
            </th>
          )}
          <th scope="col" className={`${TABLE.head} w-6`}>#</th>
          {orderedColumns.map((col) => (
            <th
              key={col.key}
              scope="col"
              data-col={col.key}
              aria-sort={detailSortKey === col.key ? (detailSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              onPointerDown={(e) => beginColumnDrag(e, col.key as string)}
              onClick={() => {
                // The click that ends a drag is not a sort.
                if (draggedRef.current) return
                handleSort(col.key)
              }}
              className={`${TABLE.head} relative cursor-pointer whitespace-nowrap hover:text-white select-none ${
                onColumnMove ? 'touch-none' : ''
              } ${carry?.key === col.key ? `${CARRIED} ${DRAG_GRIP_ACTIVE}` : ''}`}
            >
              {sized(widths, col.key as string, col.label, 'inline')}
              {detailSortKey === col.key && (
                <span className={`ml-1 ${ACCENT.text}`}>{detailSortDir === 'asc' ? '↑' : '↓'}</span>
              )}
              {/* The drag handle owns the header's right edge; its clicks
                  stop here so a resize or an auto-fit never doubles as a
                  sort. The border is the visible affordance. */}
              {onColumnWidthsChange && (
                <span
                  onPointerDown={(e) => beginColumnResize(e, col.key as string)}
                  onDoubleClick={(e) => autoFitColumn(e, col.key as string)}
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none border-r-2 border-slate-500/40 ${ACCENT.edgeHover}`}
                  aria-hidden="true"
                />
              )}
            </th>
          ))}
          {/* The filler column soaks up min-w-full's spare width. Without
              it auto layout deals that space to every column, so a fitted
              or dragged column renders wider than the width it was given
              and a first double-click reads as "the column grew". */}
          <th aria-hidden="true" className="w-full p-0" />
        </tr>
      </thead>
      {/* Both drawn into the body rather than into the table: they are placed
          in viewport coordinates, and the table is inside a scroll container
          that would otherwise clip them and offset their maths. */}
      {carry &&
        createPortal(
          <>
            <div
              className={DRAG_GHOST}
              style={{
                left: ghostLeft(carry.x, window.innerWidth),
                top: carry.y - 10,
                maxWidth: GHOST_MAX_PX,
              }}
            >
              {carry.label}
            </div>
            {insert && (
              <div
                className={DRAG_INSERT}
                style={{
                  left: insert.x - 1,
                  top: insert.top,
                  width: 2,
                  height: insert.height,
                }}
              />
            )}
          </>,
          document.body,
        )}
    </>
  )
}

export default memo(ResultsTableHeader)
