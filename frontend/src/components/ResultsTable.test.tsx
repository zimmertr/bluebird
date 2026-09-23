import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import ResultsTable from './ResultsTable'
import { displayedColumns } from '../utils/tableColumns'
import { resultRow } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

type Props = ComponentProps<typeof ResultsTable>

const SORT_BY = 'precip_total_in'

// Two identity columns and one metric, so a row stays short.
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
