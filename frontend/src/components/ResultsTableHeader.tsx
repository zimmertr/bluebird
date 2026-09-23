import { memo } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { DestinationResult } from '../types'
import type { SortDir, SortKey, ColDef } from '../utils/tableColumns'
import { GHOST_MAX_PX, ghostLeft } from '../utils/columnDrag'
import { useColumnDrag, type Carry } from '../hooks/useColumnDrag'
import { useColumnResize } from '../hooks/useColumnResize'
import { ACCENT, CARRIED, CHOICE_INPUT, DRAG_GHOST, DRAG_GRIP_ACTIVE, DRAG_INSERT, TABLE } from '../styles'

// The results table's header row and everything a press on it can do: sort,
// move a column, resize one, and fit one to its content. Apart from the body
// because none of it reads a row, so it is memoized on its own and a re-render
// of the body (a new row set, a chart toggle) does not redraw it. The wildfire
// cells' clock never reaches this far: FireClock in ResultsTableRow.tsx sends
// each frame to those cells through a context. The two gestures are hooks (useColumnDrag, useColumnResize) and
// what they measure is utils/columnMeasure.ts; this file draws.

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
function DragOverlay({ carry, insert }: { carry: Carry; insert: { x: number; top: number; height: number } | null }) {
  return createPortal(
    <>
      <div
        className={DRAG_GHOST}
        style={{ left: ghostLeft(carry.x, window.innerWidth), top: carry.y - 10, maxWidth: GHOST_MAX_PX }}
      >
        {carry.label}
      </div>
      {insert && (
        <div className={DRAG_INSERT} style={{ left: insert.x - 1, top: insert.top, width: 2, height: insert.height }} />
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

  // Every header click is a reading aid: it sorts the displayed rows in place
  // and changes NOTHING else — not the ranking, not the column order, not the
  // cell shading. Four of these columns are also ranking keys, and a click
  // here used to re-rank the whole field through the panel knob; TJ overruled
  // that in the #242 review, because only four of the fourteen headers doing
  // it read as a bug, and a header click that reshuffles the columns pulls
  // the table out from under the cursor. The Ranking control in the panel is
  // the one thing that re-ranks, reorders the groups, and moves the shading.
  function handleSort(key: SortKey) {
    // The click that ends a drag is not a sort.
    if (drag.endedDrag()) return
    onDetailSort(key, key === detailSortKey && detailSortDir === 'asc' ? 'desc' : 'asc')
  }

  return (
    <>
      <thead className="sticky top-0 bg-slate-700 z-10">
        <tr>
          {showChartCol && <SelectAllCell rows={chartableRows} headState={headState} onChartRange={onChartRange} />}
          <th scope="col" className={`${TABLE.head} w-6`}>#</th>
          {orderedColumns.map((col) => (
            <th
              key={col.key}
              scope="col"
              data-col={col.key}
              aria-sort={detailSortKey === col.key ? (detailSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              onPointerDown={(e) => drag.begin(e, col.key as string)}
              onClick={() => handleSort(col.key)}
              className={`${TABLE.head} relative cursor-pointer whitespace-nowrap hover:text-white select-none ${
                onColumnMove ? 'touch-none' : ''
              } ${drag.carry?.key === col.key ? `${CARRIED} ${DRAG_GRIP_ACTIVE}` : ''}`}
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
                  onPointerDown={(e) => resize.begin(e, col.key as string)}
                  onDoubleClick={(e) => resize.fit(e, col.key as string)}
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
      {drag.carry && <DragOverlay carry={drag.carry} insert={drag.insert} />}
    </>
  )
}

export default memo(ResultsTableHeader)
