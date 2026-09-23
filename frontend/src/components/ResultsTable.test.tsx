import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import ResultsTable from './ResultsTable'
import { displayedColumns } from '../utils/tableColumns'
import { DRAG_THRESHOLD_PX } from '../utils/columnDrag'
import { resultRow } from '../testSupport/fixtures'
import { placeAt, render } from '../testSupport/render'

type Props = ComponentProps<typeof ResultsTable>

const SORT_BY = 'precip_total_in'

// Two identity columns and one metric, so a header is easy to find and a drag
// has somewhere to land on either side.
const COLUMNS = displayedColumns(false, SORT_BY).filter((c) =>
  ['name', 'elevation_ft', 'precip_total_in'].includes(c.key as string),
)

const ROWS = [
  resultRow({ name: 'Mount Rainier', latitude: 46.85, longitude: -121.76, elevation_ft: 14411 }),
  resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.49, elevation_ft: 12281 }),
]

// Stable empties, because the table is memoized and a fresh value per render
// is exactly what App must never hand it.
const NO_KEYS = new Set<string>()
const NO_WARNINGS = new Map()

function props(over: Partial<Props> = {}): Props {
  return {
    results: ROWS,
    leavingRowKeys: NO_KEYS,
    sortBy: SORT_BY,
    detailSortKey: 'name',
    detailSortDir: 'asc',
    onDetailSort: () => {},
    columns: COLUMNS,
    fireWarnings: NO_WARNINGS,
    fireUncovered: NO_KEYS,
    fireStatus: 'ready',
    ...over,
  }
}

const header = (label: RegExp) => screen.getByRole('columnheader', { name: label })

describe('sorting', () => {
  it('sorts a new column ascending on a header click', async () => {
    const onDetailSort = vi.fn()
    const { user } = render(<ResultsTable {...props({ onDetailSort })} />)
    await user.click(header(/^Elevation/))
    expect(onDetailSort).toHaveBeenLastCalledWith('elevation_ft', 'asc')
  })

  it('flips the direction of the column it already sorts', async () => {
    const onDetailSort = vi.fn()
    const { user } = render(<ResultsTable {...props({ onDetailSort })} />)
    await user.click(header(/^Name/))
    expect(onDetailSort).toHaveBeenLastCalledWith('name', 'desc')
  })

  it('marks the sorted column for assistive tech', () => {
    render(<ResultsTable {...props({ detailSortKey: 'elevation_ft', detailSortDir: 'desc' })} />)
    expect(header(/^Elevation/).getAttribute('aria-sort')).toBe('descending')
    expect(header(/^Name/).getAttribute('aria-sort')).toBe('none')
  })
})

describe('rows', () => {
  it('draws one row per result, ranked in the order given', () => {
    render(<ResultsTable {...props()} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2'])
    expect(within(rows[1]).getByRole('button', { name: 'Center map on Mount Adams' })).toBeTruthy()
  })

  it('says why the table is empty when nothing matched', () => {
    render(<ResultsTable {...props({ results: [], emptyReason: 'Nothing here.' })} />)
    expect(screen.getByText('Nothing here.')).toBeTruthy()
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
    render(<ResultsTable {...props({ onColumnMove, onDetailSort })} />)
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
    render(<ResultsTable {...props({ onColumnMove, onDetailSort })} />)
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
