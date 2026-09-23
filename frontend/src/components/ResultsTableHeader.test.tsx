import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ResultsTableHeader from './ResultsTableHeader'
import { displayedColumns } from '../utils/tableColumns'
import { DRAG_THRESHOLD_PX } from '../utils/columnDrag'
import { placeAt, render } from '../testSupport/render'

type Props = ComponentProps<typeof ResultsTableHeader>

const SORT_BY = 'precip_total_in'

// Two identity columns and one metric, so a header is easy to find and a drag
// has somewhere to land on either side.
const COLUMNS = displayedColumns(false, SORT_BY).filter((c) =>
  ['name', 'elevation_ft', 'precip_total_in'].includes(c.key as string),
)

// Stable empties, because the header is memoized and a fresh value per render
// is exactly what the table must never hand it.
const NO_ROWS: never[] = []
const TABLE_REF = { current: null }

function props(over: Partial<Props> = {}): Props {
  return {
    columns: COLUMNS,
    detailSortKey: 'name',
    detailSortDir: 'asc',
    onDetailSort: () => {},
    tableRef: TABLE_REF,
    showChartCol: false,
    chartableRows: NO_ROWS,
    headState: 'none',
    ...over,
  }
}

// A header row is only valid inside a table.
function renderHeader(p: Props) {
  return render(
    <table>
      <ResultsTableHeader {...p} />
    </table>,
  )
}

const header = (label: RegExp) => screen.getByRole('columnheader', { name: label })

describe('sorting', () => {
  it('sorts a new column ascending on a header click', async () => {
    const onDetailSort = vi.fn()
    const { user } = renderHeader(props({ onDetailSort }))
    await user.click(header(/^Elevation/))
    expect(onDetailSort).toHaveBeenLastCalledWith('elevation_ft', 'asc')
  })

  it('flips the direction of the column it already sorts', async () => {
    const onDetailSort = vi.fn()
    const { user } = renderHeader(props({ onDetailSort }))
    await user.click(header(/^Name/))
    expect(onDetailSort).toHaveBeenLastCalledWith('name', 'desc')
  })

  it('marks the sorted column for assistive tech', () => {
    renderHeader(props({ detailSortKey: 'elevation_ft', detailSortDir: 'desc' }))
    expect(header(/^Elevation/).getAttribute('aria-sort')).toBe('descending')
    expect(header(/^Name/).getAttribute('aria-sort')).toBe('none')
  })
})

describe('moving a column', () => {
  // Three headers side by side, 100px each, in the order the table draws them.
  function lay() {
    COLUMNS.forEach((col, i) => {
      const th = document.querySelector(`th[data-col="${col.key as string}"]`) as Element
      placeAt(th, { left: i * 100, top: 0, width: 100, height: 24 })
    })
  }

  it('moves a column to the header a drag is released over, and does not sort', () => {
    const onColumnMove = vi.fn()
    const onDetailSort = vi.fn()
    renderHeader(props({ onColumnMove, onDetailSort }))
    lay()
    const from = header(/^Name/)
    fireEvent.pointerDown(from, { clientX: 50, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerUp(document)
    // A browser ends the gesture with a click on the header it began on.
    fireEvent.click(from)
    expect(onColumnMove).toHaveBeenCalledWith('name', 'precip_total_in')
    expect(onDetailSort).not.toHaveBeenCalled()
  })

  it('sorts rather than moves when the press stays under the threshold', () => {
    const onColumnMove = vi.fn()
    const onDetailSort = vi.fn()
    renderHeader(props({ onColumnMove, onDetailSort }))
    lay()
    const from = header(/^Name/)
    fireEvent.pointerDown(from, { clientX: 50, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerMove(document, { clientX: 50 + DRAG_THRESHOLD_PX - 1, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerUp(document)
    fireEvent.click(from)
    expect(onColumnMove).not.toHaveBeenCalled()
    expect(onDetailSort).toHaveBeenCalledWith('name', 'desc')
  })
})
