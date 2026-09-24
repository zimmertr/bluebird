import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import ResultsTableRow, { FireClock, PendingRow } from './ResultsTableRow'
import type { ChartBox } from '../hooks/useChartBox'
import { displayedColumns, MODEL_COL, WILDFIRE_COL, type ColDef } from '../utils/tableColumns'
import { FIRE_UNCOVERED_NOTE, fireLoadingFrame } from '../utils/fireProximity'
import { FREEZE_UNAVAILABLE_NOTE } from '../utils/freezingLevel'
import { pendingChartRow } from '../utils/resultsCells'
import { fireWarning, pendingDestination, resultRow } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

type Props = ComponentProps<typeof ResultsTableRow>

const SORT_BY = 'precip_total_in'
const COLUMNS = [
  ...displayedColumns(false, SORT_BY).filter((c) =>
    ['name', 'elevation_ft', 'precip_total_in'].includes(c.key as string),
  ),
  WILDFIRE_COL,
]
const NO_WIDTHS = {}
const GROUP = new Set([SORT_BY])
const ROW = resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.49, elevation_ft: 12281 })
const WARNING = fireWarning()

const inTable = (ui: ReactElement) =>
  render(
    <table>
      <tbody>{ui}</tbody>
    </table>,
  )

function props(over: Partial<Props> = {}): Props {
  return {
    row: ROW,
    rank: '2',
    columns: COLUMNS,
    widths: NO_WIDTHS,
    coloredGroup: GROUP,
    pointSample: false,
    fireStatus: 'ready',
    fireUncovered: false,
    charted: false,
    ...over,
  }
}

describe('a ranked row', () => {
  it('trades its rank for a remove button that names the row', async () => {
    const onRemove = vi.fn()
    const { user } = inTable(<ResultsTableRow {...props({ onRemove })} />)
    expect(screen.getByText('2')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove Mount Adams' }))
    expect(onRemove).toHaveBeenCalledWith(ROW)
  })

  it('centres the map on the row from its name', async () => {
    const onFocusResult = vi.fn()
    const { user } = inTable(<ResultsTableRow {...props({ onFocusResult })} />)
    await user.click(screen.getByRole('button', { name: 'Center map on Mount Adams' }))
    expect(onFocusResult).toHaveBeenCalledWith(ROW)
  })

  it('reports the shift state, then the toggle, from its chart box', async () => {
    const box: ChartBox = { onShift: vi.fn(), onToggle: vi.fn() }
    const { user } = inTable(<ResultsTableRow {...props({ chartBox: box })} />)
    await user.click(screen.getByRole('checkbox', { name: 'Chart Mount Adams' }))
    expect(box.onShift).toHaveBeenCalledWith(false)
    expect(box.onToggle).toHaveBeenCalledWith(ROW)
  })

  it('draws no chart box when the table has no chart column', () => {
    inTable(<ResultsTableRow {...props()} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('ticks the shared frame in the wildfire cell while the check runs', () => {
    inTable(
      <FireClock running>
        <ResultsTableRow {...props({ fireStatus: 'loading', fireWarning: WARNING })} />
      </FireClock>,
    )
    expect(screen.getByText(fireLoadingFrame(0))).toBeTruthy()
    expect(screen.queryByRole('link', { name: /NIFC/ })).toBeNull()
  })

  it('links a warned wildfire cell to the fire', () => {
    inTable(<ResultsTableRow {...props({ fireWarning: WARNING })} />)
    const link = screen.getByRole('link', { name: 'Open Probe Fire on the NIFC map. Opens in a new tab.' })
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('explains an uncovered wildfire cell on hover', () => {
    inTable(<ResultsTableRow {...props({ fireUncovered: true })} />)
    const cells = within(screen.getByRole('row')).getAllByRole('cell')
    const fire = cells.find((c) => c.textContent === 'N/A')!
    expect(fire.querySelector('[title]')!.getAttribute('title')).toBe(FIRE_UNCOVERED_NOTE)
  })

  it('reads the analysis model in the Model column for a row no comparison tagged', () => {
    inTable(<ResultsTableRow {...props({ columns: [MODEL_COL], modelFallbackLabel: 'NOAA GFS' })} />)
    expect(within(screen.getByRole('row')).getByText('NOAA GFS')).toBeTruthy()
  })

  it('explains a freezing level the model does not publish on hover', () => {
    const freeze = displayedColumns(false, 'freeze_min_ft').find((c) => c.key === 'freeze_min_ft') as ColDef
    inTable(<ResultsTableRow {...props({ columns: [freeze], row: { ...ROW, freeze_min_ft: null } })} />)
    const cell = within(screen.getByRole('row')).getByText('N/A')
    expect(cell.getAttribute('title')).toBe(FREEZE_UNAVAILABLE_NOTE)
  })

  it('links a metric cell to Windy under the row name', () => {
    inTable(<ResultsTableRow {...props()} />)
    expect(screen.getByRole('link', { name: 'Open Mount Adams on Windy. Opens in a new tab.' })).toBeTruthy()
  })
})

describe('a pending row', () => {
  const PENDING = pendingDestination()
  const pendingProps = (over: Partial<ComponentProps<typeof PendingRow>> = {}) => ({
    destination: PENDING,
    columns: COLUMNS,
    widths: NO_WIDTHS,
    charted: false,
    ...over,
  })

  it('reads a dash for its rank and every metric, and its own elevation', () => {
    inTable(<PendingRow {...pendingProps()} />)
    const cells = within(screen.getByRole('row')).getAllByRole('cell').map((c) => c.textContent)
    expect(cells[0]).toBe('—')
    expect(cells).toContain((6000).toLocaleString())
    expect(cells.filter((t) => t === '—').length).toBe(3)
  })

  it('removes a searched place, and centres the map on its coordinate', async () => {
    const onRemovePending = vi.fn()
    const onFocusPending = vi.fn()
    const { user } = inTable(<PendingRow {...pendingProps({ onRemovePending, onFocusPending })} />)
    await user.click(screen.getByRole('button', { name: 'Remove Probe Peak' }))
    expect(onRemovePending).toHaveBeenCalledWith(PENDING)
    await user.click(screen.getByRole('button', { name: 'Center map on Probe Peak' }))
    expect(onFocusPending).toHaveBeenCalledWith({ latitude: 47.1, longitude: -121.2 })
  })

  it('pre-selects a charted pending row in its line colour, and toggles it by coordinate', async () => {
    const box: ChartBox = { onShift: vi.fn(), onToggle: vi.fn() }
    const { user } = inTable(<PendingRow {...pendingProps({ chartBox: box, charted: true, chartColor: 'rgb(1, 2, 3)' })} />)
    const check = screen.getByRole('checkbox', { name: 'Chart Probe Peak' }) as HTMLInputElement
    expect(check.checked).toBe(true)
    expect(check.style.accentColor).toBe('rgb(1, 2, 3)')
    await user.click(check)
    expect(box.onToggle).toHaveBeenCalledWith(pendingChartRow(PENDING))
  })

  it('offers no remove button on a CSV row, whose truth is the textarea', () => {
    inTable(<PendingRow {...pendingProps({ destination: pendingDestination({ source: 'csv' }), onRemovePending: vi.fn() })} />)
    expect(screen.queryByRole('button', { name: 'Remove Probe Peak' })).toBeNull()
  })
})
