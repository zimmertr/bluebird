import { Profiler, type ComponentProps, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import ResultsTable from './ResultsTable'
import { displayedColumns, TERRAIN_HEIGHT_NOTE, WILDFIRE_COL, CLOSURE_COL, withModelColumn } from '../utils/tableColumns'
import { fireLoadingFrame } from '../utils/fireProximity'
import { resultRow, series } from '../testSupport/fixtures'
import { geoKey } from '../utils/points'
import { render } from '../testSupport/render'
import { TABLE, TEXT } from '../styles'

// Every ranked row the table draws, by name, in render order. The mock keeps
// the real row and its real memo: it wraps the row's inner component in a
// counter and memoizes that exactly as the module does, so a count here is a
// render the real table would have made.
const drawn = vi.hoisted(() => ({ rows: [] as string[] }))
vi.mock('./ResultsTableRow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ResultsTableRow')>()
  const { createElement, memo } = await import('react')
  const Row = actual.default.type
  function CountedRow(props: ComponentProps<typeof Row>) {
    drawn.rows.push(props.row.name)
    return createElement(Row, props)
  }
  return { ...actual, default: memo(CountedRow) }
})

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
    sortBy: SORT_BY,
    detailSortKey: 'name',
    detailSortDir: 'asc',
    onDetailSort: () => {},
    columns: COLUMNS,
    fireWarnings: NO_WARNINGS,
    fireUncovered: NO_KEYS,
    fireStatus: 'ready',
    closureWarnings: NO_WARNINGS,
    closureUncovered: NO_KEYS,
    closureStatus: 'ready',
    pendingHeights: NO_KEYS,
    ...over,
  }
}

afterEach(() => {
  vi.useRealTimers()
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

// A compared model that ends inside the window (#493): one raised mark on its
// Model cell (#508), and one line under the table that says what it means.
describe('a model that ends early', () => {
  const NOTE = "* Data is aggregated over a subset of the forecast window due to the model's limited range."
  const MODEL_COLUMNS = withModelColumn(COLUMNS, true)
  const SHORT = [
    { ...ROWS[0], precip_total_in: 0.25, modelId: 'gfs_seamless', modelLabel: 'NOAA GFS', rank: 1 },
    {
      ...ROWS[0],
      precip_total_in: 0.25,
      modelId: 'gfs_hrrr',
      modelLabel: 'NOAA HRRR',
      rank: 1,
      coverageEndMs: Date.UTC(2026, 8, 26, 9),
    },
  ]
  // The cell under a header, by the header's label, so a column added to the
  // fixture cannot shift what a test reads.
  const cellUnder = (row: HTMLElement, label: string) => {
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '')
    return within(row).getAllByRole('cell')[heads.findIndex((t) => t.startsWith(label))]
  }

  it('marks the short row once, on its Model cell, and prints the footnote once', () => {
    render(<ResultsTable {...props({ results: SHORT, columns: MODEL_COLUMNS, partialNote: NOTE })} />)
    const [full, short] = screen.getAllByRole('row').slice(1, 3)
    const model = cellUnder(short, 'Model')
    expect(model.textContent).toBe('NOAA HRRR*')
    const mark = model.querySelector('sup')
    expect(mark?.textContent).toBe('*')
    expect(mark?.className).toBe(TABLE.mark)
    expect(cellUnder(full, 'Model').textContent).toBe('NOAA GFS')
    expect(cellUnder(full, 'Model').querySelector('sup')).toBeNull()
    // No number carries a mark, on the short row or beside it.
    for (const row of [full, short]) {
      const marked = within(row)
        .getAllByRole('cell')
        .filter((c) => c !== model && c.textContent?.includes('*'))
      expect(marked).toEqual([])
    }
    expect(screen.getAllByText(NOTE)).toHaveLength(1)
  })

  // A comparison table is wider than a phone, so the note has to stay on the
  // visible left edge at any sideways scroll, the way the empty-reason row does.
  it('pins the footnote to the visible left edge', () => {
    render(<ResultsTable {...props({ results: SHORT, columns: MODEL_COLUMNS, partialNote: NOTE })} />)
    const note = screen.getByText(NOTE)
    for (const cls of ['sticky', 'left-0', 'w-[100cqi]']) expect(note.classList).toContain(cls)
    for (const cls of TEXT.micro.split(' ')) expect(note.classList).toContain(cls)
    expect(note.closest('tfoot')).not.toBeNull()
  })

  it('prints no footnote when no row is short', () => {
    render(<ResultsTable {...props({ columns: MODEL_COLUMNS })} />)
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  // The marks ride the Model column, so hiding it in the Columns picker takes
  // the marks and the note away together.
  it('prints neither mark nor footnote without the Model column', () => {
    render(<ResultsTable {...props({ results: SHORT, partialNote: NOTE })} />)
    expect(screen.queryByText(NOTE)).toBeNull()
    expect(document.querySelector('sup')).toBeNull()
    expect(screen.queryByText(/\*/)).toBeNull()
  })
})

describe('the chart boxes', () => {
  const CHARTED = [
    resultRow({ name: 'Mount Rainier', latitude: 46.85, longitude: -121.76, series: series() }),
    resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.49, series: series() }),
    resultRow({ name: 'Mount Hood', latitude: 45.37, longitude: -121.7, series: series() }),
  ]
  const NONE = () => false

  it('toggles the one row a plain click lands on', async () => {
    const onToggleChart = vi.fn()
    const onChartRange = vi.fn()
    const { user } = render(
      <ResultsTable {...props({ results: CHARTED, onToggleChart, onChartRange, isCharted: NONE })} />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Chart Mount Adams' }))
    expect(onToggleChart).toHaveBeenCalledWith(CHARTED[1])
    expect(onChartRange).not.toHaveBeenCalled()
  })

  it('selects every row between the anchor and a shift-click', async () => {
    const onToggleChart = vi.fn()
    const onChartRange = vi.fn()
    const { user } = render(
      <ResultsTable {...props({ results: CHARTED, onToggleChart, onChartRange, isCharted: NONE })} />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Chart Mount Rainier' }))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('checkbox', { name: 'Chart Mount Hood' }))
    await user.keyboard('{/Shift}')
    expect(onChartRange).toHaveBeenCalledWith(CHARTED, true)
  })

  it('reads a shift range in the order the rows are drawn after a sort', async () => {
    const onToggleChart = vi.fn()
    const onChartRange = vi.fn()
    const table = (results: typeof CHARTED) => (
      <ResultsTable {...props({ results, onToggleChart, onChartRange, isCharted: NONE })} />
    )
    const { user, rerender } = render(table(CHARTED))
    await user.click(screen.getByRole('checkbox', { name: 'Chart Mount Rainier' }))
    const sorted = [CHARTED[0], CHARTED[2], CHARTED[1]]
    rerender(table(sorted))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('checkbox', { name: 'Chart Mount Hood' }))
    await user.keyboard('{/Shift}')
    expect(onChartRange).toHaveBeenCalledWith([CHARTED[0], CHARTED[2]], true)
  })

  it('tints a charted row with its line colour', () => {
    render(
      <ResultsTable
        {...props({
          results: CHARTED,
          onToggleChart: () => {},
          isCharted: (r) => r.name === 'Mount Hood',
          chartColor: () => 'rgb(1, 2, 3)',
        })}
      />,
    )
    const box = screen.getByRole('checkbox', { name: 'Chart Mount Hood' }) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.style.accentColor).toBe('rgb(1, 2, 3)')
    expect((screen.getByRole('checkbox', { name: 'Chart Mount Adams' }) as HTMLInputElement).style.accentColor).toBe('')
  })
})

describe('what a render redraws', () => {
  const CHARTED = [
    resultRow({ name: 'Mount Rainier', latitude: 46.85, longitude: -121.76, series: series() }),
    resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.49, series: series() }),
    resultRow({ name: 'Mount Hood', latitude: 45.37, longitude: -121.7, series: series() }),
  ]
  const TOGGLE = () => {}
  const NONE = () => false

  it('redraws only the row whose chart box changed', () => {
    const table = (isCharted: (r: (typeof CHARTED)[number]) => boolean) => (
      <ResultsTable {...props({ results: CHARTED, onToggleChart: TOGGLE, isCharted })} />
    )
    const { rerender } = render(table(NONE))
    drawn.rows.length = 0
    rerender(table((r) => r.name === 'Mount Adams'))
    expect(drawn.rows).toEqual(['Mount Adams'])
  })

  it('skips every row on a parent render that changes nothing a row reads', () => {
    const commits = vi.fn()
    const table = (detailSortDir: Props['detailSortDir']): ReactElement => (
      <Profiler id="table" onRender={commits}>
        <ResultsTable {...props({ results: CHARTED, detailSortDir })} />
      </Profiler>
    )
    const { rerender } = render(table('asc'))
    drawn.rows.length = 0
    commits.mockClear()
    rerender(table('desc'))
    expect(commits).toHaveBeenCalled()
    expect(drawn.rows).toEqual([])
  })

  it('moves a row on a sort rather than drawing another destination into it', () => {
    const { rerender } = render(<ResultsTable {...props({ results: CHARTED })} />)
    const hood = screen.getByRole('button', { name: 'Center map on Mount Hood' }).closest('tr')
    rerender(<ResultsTable {...props({ results: [...CHARTED].reverse() })} />)
    expect(screen.getByRole('button', { name: 'Center map on Mount Hood' }).closest('tr')).toBe(hood)
  })

  it('ticks the wildfire cells without redrawing a row, and stops once the check answers', () => {
    vi.useFakeTimers()
    const table = (fireStatus: Props['fireStatus']) => (
      <ResultsTable {...props({ results: CHARTED, columns: [...COLUMNS, WILDFIRE_COL], fireStatus })} />
    )
    const { rerender } = render(table('loading'))
    expect(screen.getAllByText(fireLoadingFrame(0))).toHaveLength(3)
    drawn.rows.length = 0
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getAllByText(fireLoadingFrame(1))).toHaveLength(3)
    expect(drawn.rows).toEqual([])
    rerender(table('ready'))
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.queryByText(fireLoadingFrame(1))).toBeNull()
  })

  // #673: the same clock runs for a row still waiting on its elevation.
  it('keeps the clock running for a row still waiting on its elevation, and stops once it is placed', () => {
    vi.useFakeTimers()
    const waiting = new Set([geoKey(ROWS[0].latitude, ROWS[0].longitude)])
    const table = (pendingHeights: ReadonlySet<string>) => <ResultsTable {...props({ pendingHeights })} />
    const { rerender } = render(table(waiting))
    // The waiting row's elevation cell alone ticks.
    expect(screen.getAllByText(fireLoadingFrame(0))).toHaveLength(1)
    expect(screen.queryByText('14,411')).toBeNull()
    expect(screen.getByText('12,281')).toBeTruthy()
    rerender(table(NO_KEYS))
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.getByText('14,411')).toBeTruthy()
  })

  // One clock for both flag columns: it runs while EITHER check waits, and
  // stops only once both have answered.
  it('keeps the clock running while the closure check alone still waits', () => {
    vi.useFakeTimers()
    const table = (closureStatus: Props['closureStatus']) => (
      <ResultsTable
        {...props({ results: CHARTED, columns: [...COLUMNS, WILDFIRE_COL, CLOSURE_COL], closureStatus })}
      />
    )
    const { rerender } = render(table('loading'))
    expect(screen.getAllByText(fireLoadingFrame(0))).toHaveLength(3)
    rerender(table('ready'))
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.queryByText(fireLoadingFrame(0))).toBeNull()
  })
})

// A place with no recorded elevation (decision 0116): the terrain height its
// numbers were read at, a raised dagger beside it, and one line under the
// table, drawn with the Elevation column and gone with it.
describe('a place with no recorded elevation', () => {
  const RAVEN = resultRow({ name: 'Raven Ridge', latitude: 48.6, longitude: -120.9, elevation_ft: null, terrain_ft: 7119 })
  const TERRAIN = [ROWS[0], RAVEN]
  const cellUnder = (row: HTMLElement, label: string) => {
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '')
    return within(row).getAllByRole('cell')[heads.findIndex((t) => t.startsWith(label))]
  }

  it('shows the terrain height marked on its cell and prints the note once', () => {
    render(<ResultsTable {...props({ results: TERRAIN })} />)
    const [placed, terrain] = screen.getAllByRole('row').slice(1, 3)
    const cell = cellUnder(terrain, 'Elevation')
    expect(cell.textContent).toBe('7,119†')
    const mark = cell.querySelector('sup')
    expect(mark?.textContent).toBe('†')
    expect(mark?.className).toBe(TABLE.mark)
    expect(cellUnder(placed, 'Elevation').textContent).toBe('14,411')
    expect(cellUnder(placed, 'Elevation').querySelector('sup')).toBeNull()
    const note = screen.getByText(TERRAIN_HEIGHT_NOTE)
    for (const cls of ['sticky', 'left-0', 'w-[100cqi]']) expect(note.classList).toContain(cls)
    expect(note.closest('tfoot')).not.toBeNull()
  })

  it('prints no note when every row has its elevation', () => {
    render(<ResultsTable {...props()} />)
    expect(screen.queryByText(TERRAIN_HEIGHT_NOTE)).toBeNull()
  })

  // The mark is on the Elevation cell, so hiding that column takes the mark
  // and the note away together.
  it('prints neither mark nor note without the Elevation column', () => {
    render(<ResultsTable {...props({ results: TERRAIN, columns: COLUMNS.filter((c) => c.key !== 'elevation_ft') })} />)
    expect(screen.queryByText(TERRAIN_HEIGHT_NOTE)).toBeNull()
    expect(document.querySelector('sup')).toBeNull()
  })

  it('prints both notes, each on its own line, beside a model that ends early', () => {
    const NOTE = "* Data is aggregated over a subset of the forecast window due to the model's limited range."
    const rows = [
      { ...ROWS[0], modelId: 'gfs_hrrr', modelLabel: 'NOAA HRRR', rank: 1, coverageEndMs: Date.UTC(2026, 8, 26, 9) },
      { ...RAVEN, modelId: 'gfs_seamless', modelLabel: 'NOAA GFS', rank: 2 },
    ]
    render(<ResultsTable {...props({ results: rows, columns: withModelColumn(COLUMNS, true), partialNote: NOTE })} />)
    const lines = [...document.querySelectorAll('tfoot div')].map((d) => d.textContent)
    expect(lines).toEqual([NOTE, TERRAIN_HEIGHT_NOTE])
  })

  // While the lookup may still answer, the cell ticks and the note waits: the
  // terrain height is the answer only once nobody is still asking.
  it('ticks rather than showing the terrain height while the lookup may still answer', () => {
    vi.useFakeTimers()
    const waiting = new Set([geoKey(RAVEN.latitude, RAVEN.longitude)])
    const table = (pendingHeights: ReadonlySet<string>) => <ResultsTable {...props({ results: TERRAIN, pendingHeights })} />
    const { rerender } = render(table(waiting))
    expect(screen.getAllByText(fireLoadingFrame(0))).toHaveLength(1)
    expect(screen.queryByText(TERRAIN_HEIGHT_NOTE)).toBeNull()
    rerender(table(NO_KEYS))
    expect(cellUnder(screen.getAllByRole('row')[2], 'Elevation').textContent).toBe('7,119†')
    expect(screen.getByText(TERRAIN_HEIGHT_NOTE)).toBeTruthy()
  })
})
