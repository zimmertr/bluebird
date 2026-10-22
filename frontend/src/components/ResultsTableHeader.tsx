import { memo, useId } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { DestinationResult } from '../types'
import { RANK_KEY, isNumberColumn, type SortDir, type SortKey, type ColDef } from '../utils/tableColumns'
import { GHOST_MAX_PX, ghostLeft } from '../utils/columnDrag'
import { useColumnDrag, type Carry } from '../hooks/useColumnDrag'
import { useColumnResize } from '../hooks/useColumnResize'
import type { InsertLine } from '../utils/columnMeasure'
import { sized } from './sizedCell'
import { ACCENT, CHOICE_INPUT, DRAG, FOCUS_RING_INSET, SCROLL_SHADOW, SR_ONLY, TABLE } from '../styles'

// The results table's header row and everything a press on it can do: sort
// (by pointer or by key), move a column, resize one, and fit one to its content. Apart from the body
// because none of it reads a row, so it is memoized on its own and a re-render
// of the body (a new row set, a chart toggle) does not redraw it. The wildfire
// cells' clock never reaches this far: FireClock in ResultsTableRow.tsx sends
// each frame to those cells through a context. The two gestures are hooks (useColumnDrag, useColumnResize) and
// what they measure is utils/columnMeasure.ts; this file draws.

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

// The leading chart column's header: a "select all" box once there is
// something to chart.
function SelectAllCell({
  rows,
  headState,
  onChartRange,
}: {
  rows: DestinationResult[]
  headState: Props['headState']
  onChartRange?: Props['onChartRange']
}) {
  return (
    <th className={`${TABLE.head} w-6`}>
      {onChartRange && rows.length > 0 && (
        <input
          type="checkbox"
          checked={headState === 'all'}
          ref={(el) => {
            // `indeterminate` is a DOM property, not an attribute, so
            // React can't set it via a prop: sync it on every render.
            if (el) el.indeterminate = headState === 'some'
          }}
          onChange={() => onChartRange(rows, headState !== 'all')}
          aria-label="Chart all destinations"
          className={CHOICE_INPUT}
        />
      )}
    </th>
  )
}

// What a drag draws: the ghost under the pointer and the line in the gap.
// Both drawn into the body rather than into the table: they are placed in
// viewport coordinates, and the table is inside a scroll container that would
// otherwise clip them and offset their maths.
function DragOverlay({ carry, insert }: { carry: Carry; insert: InsertLine | null }) {
  return createPortal(
    <>
      <div
        className={DRAG.ghost}
        style={{ left: ghostLeft(carry.x, window.innerWidth), top: carry.y - 10, maxWidth: GHOST_MAX_PX }}
      >
        {carry.label}
      </div>
      {insert && (
        <div className={DRAG.insert} style={{ left: insert.x - 1, top: insert.top, width: 2, height: insert.height }} />
      )}
    </>,
    document.body,
  )
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
  const widths = columnWidths ?? {}
  const drag = useColumnDrag(orderedColumns, onColumnMove)
  const resize = useColumnResize(columnWidths, onColumnWidthsChange, tableRef)
  const sortHintId = useId()

  // Every header click is a reading aid: it sorts the displayed rows in place
  // and changes NOTHING else: not the ranking, not the column order, not the
  // cell shading. Four of these columns are also ranking keys, and a click
  // here used to re-rank the whole field through the panel knob; TJ overruled
  // that in the #242 review, because only four of the fourteen headers doing
  // it read as a bug, and a header click that reshuffles the columns pulls
  // the table out from under the cursor. The Ranking control in the panel is
  // the one thing that re-ranks, reorders the groups, and moves the shading.
  function sortBy(key: SortKey) {
    onDetailSort(key, key === detailSortKey && detailSortDir === 'asc' ? 'desc' : 'asc')
  }

  function handleSort(key: SortKey) {
    // The click that ends a drag is not a sort.
    if (drag.endedDrag()) return
    sortBy(key)
  }

  // The keyboard route to the same sort, on the cell itself rather than on a
  // button inside it: the three pointer gestures are wired to this cell and
  // read its DOM (the drag measures the cell's row, auto-fit the wrapper
  // directly under it), so a key handler beside them leaves every one of them
  // untouched. Enter and Space act as a button's would. A key press goes
  // straight to the sort and never through the drag's click guard, since no
  // key starts a drag. A held key sorts once rather than flipping the order
  // on every repeat.
  function handleSortKey(e: KeyboardEvent<HTMLTableCellElement>, key: SortKey) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Space would otherwise scroll the sheet under the reader.
    e.preventDefault()
    if (e.repeat) return
    sortBy(key)
  }

  // Every sortable header cell, the # header's and each column's alike, so the
  // two cannot drift apart in how they sort, how they are announced or where
  // they take focus. What only a column has (its place in the drag and its
  // resize handle) comes in through `column`, and `cellClass` carries the
  // cell's own classes; the # header passes no `column`, because it is not a
  // column a reader can move or size (#698).
  function sortHeader(
    key: SortKey,
    label: ReactNode,
    cellClass: string,
    column?: {
      onPointerDown: (e: PointerEvent<HTMLTableCellElement>) => void
      grip: ReactNode
      number: boolean
    },
  ) {
    const sorted = detailSortKey === key
    return (
      <th
        key={key}
        scope="col"
        data-col={column ? key : undefined}
        aria-sort={sorted ? (detailSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onPointerDown={column?.onPointerDown}
        onClick={() => handleSort(key)}
        tabIndex={0}
        onKeyDown={(e) => handleSortKey(e, key)}
        aria-describedby={sortHintId}
        className={`${column?.number ? TABLE.headNumber : TABLE.head} ${FOCUS_RING_INSET} ${cellClass} cursor-pointer whitespace-nowrap hover:text-ink-strong select-none`}
      >
        {/* The arrow's slot is drawn on every header, hidden where the sort
            is not, so a header keeps one width whether the sort lands on it
            or leaves it: a column must not move when the sort does (the
            maintainer, 2026-10-13). Hidden, it is also out of the name. A
            number column's stands before its label on screen, so the label
            ends on the edge its digits do (record 0222), and after it in the
            name, as every other header's does. */}
        <span className={`inline-flex${column?.number ? ' flex-row-reverse' : ''}`}>
          {label}
          <span
            className={`${column?.number ? 'mr-1' : 'ml-1'} ${ACCENT.text} ${sorted ? '' : 'invisible'}`}
            aria-hidden={sorted ? undefined : 'true'}
          >
            {sorted && detailSortDir === 'desc' ? '↓' : '↑'}
          </span>
        </span>
        {column?.grip}
      </th>
    )
  }

  return (
    <>
      <thead className={`sticky top-0 bg-raised z-10 ${SCROLL_SHADOW.head}`}>
        <tr>
          {showChartCol && <SelectAllCell rows={chartableRows} headState={headState} onChartRange={onChartRange} />}
          {sortHeader(RANK_KEY, '#', 'w-6')}
          {orderedColumns.map((col) =>
            sortHeader(
              col.key,
              sized(widths, col.key as string, col.label, 'inline'),
              // The Name header stands with its column (record 0142); sticky
              // is positioned, so the resize grip still hangs off its edge.
              `${col.key === 'name' ? TABLE.stickyNameHead : 'relative'} ${onColumnMove ? 'touch-none' : ''} ${
                drag.carry?.key === col.key ? `${DRAG.carried} ${DRAG.gripActive}` : ''
              }`,
              {
                onPointerDown: (e) => drag.begin(e, col.key as string),
                number: isNumberColumn(col),
                // The drag handle owns the header's right edge; its clicks
                // stop here so a resize or an auto-fit never doubles as a
                // sort. The border is the visible affordance.
                grip: onColumnWidthsChange && (
                  <span
                    onPointerDown={(e) => resize.begin(e, col.key as string)}
                    onDoubleClick={(e) => resize.fit(e, col.key as string)}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none border-r-2 border-edge/40 ${ACCENT.edgeHover}`}
                    aria-hidden="true"
                  />
                ),
              },
            ),
          )}
          {/* The filler column soaks up min-w-full's spare width. Without
              it auto layout deals that space to every column, so a fitted
              or dragged column renders wider than the width it was given
              and a first double-click reads as "the column grew". */}
          {/* It also holds the one copy of the sort hint every sortable
              header points at: a cell of its own would be a column, and a
              span beside the thead is not valid table markup. A reference
              resolves through aria-hidden, so the hint still reaches the
              headers while the filler stays out of the tree. */}
          <th aria-hidden="true" className="w-full p-0">
            <span id={sortHintId} className={SR_ONLY}>
              Press Enter or Space to sort.
            </span>
          </th>
        </tr>
      </thead>
      {drag.carry && <DragOverlay carry={drag.carry} insert={drag.insert} />}
    </>
  )
}

export default memo(ResultsTableHeader)
