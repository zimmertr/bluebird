import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import ResultsTableRow, { FireClock, PendingRow } from './ResultsTableRow'
import type { ChartBox } from '../hooks/useChartBox'
import { CLOSURE_COL, displayedColumns, MODEL_COL, WILDFIRE_COL, type ColDef } from '../utils/tableColumns'
import { FIRE_UNCOVERED_NOTE, fireLoadingFrame } from '../utils/fireProximity'
import {
  CLOSURE_UNAVAILABLE_NOTE,
  CLOSURE_UNCOVERED_NOTE,
  closureWarningText,
} from '../utils/closureProximity'
import { FREEZE_UNAVAILABLE_NOTE } from '../utils/freezingLevel'
import { pendingChartRow } from '../utils/resultsCells'
import { TABLE } from '../styles'
import { formatPrecipTotal } from '../metrics'
import { closureWarning, fireWarning, pendingDestination, resultRow } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

type Props = ComponentProps<typeof ResultsTableRow>

/** The text an element's `aria-describedby` points at. */
const describedBy = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')

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
    closureStatus: 'ready',
    closureUncovered: false,
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
    const note = screen.getByText('N/A')
    expect(note.getAttribute('title')).toBe(FIRE_UNCOVERED_NOTE)
    expect(describedBy(note)).toBe(FIRE_UNCOVERED_NOTE)
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

  // The reason was an aria-label on a span with no role, which a screen reader
  // does not read, so it reached a pointer and nobody else (#576). Now it is
  // hidden text in the cell itself, read after the value.
  it('gives an N/A reason to a screen reader as well as to the pointer', () => {
    const freeze = displayedColumns(false, 'freeze_min_ft').find((c) => c.key === 'freeze_min_ft') as ColDef
    inTable(<ResultsTableRow {...props({ columns: [freeze], row: { ...ROW, freeze_min_ft: null } })} />)
    const value = within(screen.getByRole('row')).getByText('N/A')
    expect(value.getAttribute('aria-label')).toBeNull()
    expect(describedBy(value)).toBe(FREEZE_UNAVAILABLE_NOTE)
    expect(value.closest('td')!.textContent).toBe(`N/A${FREEZE_UNAVAILABLE_NOTE}`)
  })

  // The link's name is the value it shows (#575). A label over it replaced the
  // value in every metric cell, so a screen reader heard "Open Mount Adams on
  // Windy" in place of every number, and voice control could not match one.
  // The sentence rides as the description instead.
  it('names a metric cell link by its value and describes where it goes', () => {
    inTable(<ResultsTableRow {...props({ row: { ...ROW, precip_total_in: 0.42 } })} />)
    const shown = formatPrecipTotal(0.42)
    const value = within(screen.getByRole('row')).getByText(shown)
    // Found by the name a reader hears, computed the way a browser does it.
    const link = screen.getByRole('link', {
      name: shown,
      description: 'Open Mount Adams on Windy. Opens in a new tab.',
    })
    expect(link).toBe(value)
    expect(link.getAttribute('aria-label')).toBeNull()
  })

  // One sentence per row, in the filler cell, rather than one per metric
  // cell: the cells stay one value each when a screen reader reads the table.
  it('keeps one copy of the Windy sentence per row, out of the cells', () => {
    inTable(<ResultsTableRow {...props()} />)
    const copies = screen.getAllByText('Open Mount Adams on Windy. Opens in a new tab.')
    expect(copies).toHaveLength(1)
    expect(copies[0].closest('td')!.getAttribute('aria-hidden')).toBe('true')
  })

  // Hidden with `invisible`, the remove button could not take focus, so Tab
  // skipped it in every row (#576). It idles transparent instead.
  it('puts the remove button in the Tab order', async () => {
    const { user } = inTable(<ResultsTableRow {...props({ onRemove: vi.fn() })} />)
    const remove = screen.getByRole('button', { name: 'Remove Mount Adams' })
    expect(remove.className).not.toMatch(/(^|\s)invisible(\s|$)/)
    await user.tab()
    expect(document.activeElement).toBe(remove)
  })
})

describe('the Closure cell', () => {
  const only = (over: Partial<Props> = {}) =>
    inTable(<ResultsTableRow {...props({ columns: [CLOSURE_COL], ...over })} />)
  const cell = () => within(screen.getByRole('row')).getAllByRole('cell')[1]

  it('links a warned cell to the order by its name', () => {
    only({ closureWarning: closureWarning() })
    const link = screen.getByRole('link', {
      name: 'Open Probe Fire Closure on the US Forest Service site. Opens in a new tab.',
    })
    expect(link.textContent).toBe('⚠️ Probe Fire Closure')
    expect(link.getAttribute('href')).toBe('https://www.fs.usda.gov/r06/alerts/probe')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  // A forest order's title runs to a hundred characters (#551), so a named
  // order is capped and clipped until the reader sizes the column; the whole
  // title stays on the link's hover.
  it('clips a long order title while the column is unsized', () => {
    const warning = closureWarning({ name: 'Upper & Lower Tonto Creek Campground Temporary Closure Order' })
    only({ closureWarning: warning })
    const link = screen.getByRole('link')
    expect(link.getAttribute('title')).toBe(warning.name)
    expect(link.parentElement!.className).toBe(TABLE.clip)
  })

  it('leaves a sized column to the width the reader chose', () => {
    only({ closureWarning: closureWarning(), widths: { closure: 120 } })
    const link = screen.getByRole('link')
    expect(link.parentElement!.className).not.toContain('max-w')
    expect(link.parentElement!.style.width).toBe('120px')
  })

  it('keeps the hover sentence on a warned order with no page', () => {
    const warning = closureWarning({ url: null })
    only({ closureWarning: warning })
    expect(screen.queryByRole('link')).toBeNull()
    expect(cell().querySelector('[title]')!.getAttribute('title')).toBe(closureWarningText(warning))
  })

  it('reads the dash for a cleared row', () => {
    only()
    expect(cell().textContent).toBe('—')
  })

  it('explains an uncovered row and a failed check apart', () => {
    only({ closureUncovered: true })
    expect(cell().querySelector('[title]')!.getAttribute('title')).toBe(CLOSURE_UNCOVERED_NOTE)
  })

  it('reads N/A with the unavailable note when the check failed', () => {
    only({ closureStatus: 'unavailable' })
    const value = within(cell()).getByText('N/A')
    expect(value.getAttribute('title')).toBe(CLOSURE_UNAVAILABLE_NOTE)
    expect(describedBy(value)).toBe(CLOSURE_UNAVAILABLE_NOTE)
  })

  // One clock for both flag columns: a check that answered stays still while
  // the other one ticks.
  it('ticks only while its own check runs', () => {
    inTable(
      <FireClock running>
        <ResultsTableRow
          {...props({
            columns: [WILDFIRE_COL, CLOSURE_COL],
            fireStatus: 'ready',
            closureStatus: 'loading',
          })}
        />
      </FireClock>,
    )
    const cells = within(screen.getByRole('row')).getAllByRole('cell')
    expect(cells[1].textContent).toBe('—')
    expect(cells[2].textContent).toBe(fireLoadingFrame(0))
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
