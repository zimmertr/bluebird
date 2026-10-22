import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ResultsTableHeader from './ResultsTableHeader'
import { RANK_KEY, displayedColumns } from '../utils/tableColumns'
import { DRAG_THRESHOLD_PX } from '../utils/columnDrag'
import { placeAt, render } from '../testSupport/render'
import { TABLE } from '../styles'
import { resultRow } from '../testSupport/fixtures'

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
// The # header's name is its text, plus the arrow while it is the sorted one.
const rankHeader = () => header(/^#/)
// A header's arrow slot: the one span that holds a sort glyph.
const arrowSlots = (th: Element) => [...th.querySelectorAll('span')].filter((s) => /^[↑↓]$/.test(s.textContent ?? ''))
// Every sortable header, and the key each sorts by, in the order they are drawn.
const SORTABLE = [/^#/, /^Name/, /^Elevation/, /^Precip/]
const SORTABLE_KEYS = [RANK_KEY, 'name', 'elevation_ft', SORT_BY] as const

describe('alignment', () => {
  // A number column's label ends on the edge its digits do (record 0222), so
  // its arrow slot stands before the label on screen, and after it in the
  // name as every header's does.
  it('stands a number header at its end with the arrow drawn before its label', () => {
    renderHeader(props({ detailSortKey: 'elevation_ft' }))
    const elevation = header(/^Elevation/)
    expect(elevation.className).toContain(TABLE.headNumber)
    expect(elevation.textContent).toBe('Elevation (ft)↑')
    expect(arrowSlots(elevation)[0].parentElement!.className).toContain('flex-row-reverse')
    expect(arrowSlots(elevation)[0].className).toContain('mr-1')
    expect(header(/^Name/).className).toContain(TABLE.head)
    expect(arrowSlots(header(/^Name/))[0].parentElement!.className).not.toContain('flex-row-reverse')
  })
})

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
    expect(rankHeader().getAttribute('aria-sort')).toBe('none')
  })
})

// A column must not move when the sort does (the maintainer, 2026-10-13): every
// sortable header holds its arrow's slot whether it is sorted or not, hidden
// and out of the name where it is not. jsdom lays nothing out, so this pins
// the slot rather than a width; the widths were measured in Chromium on #704.
describe('the arrow slot', () => {
  it('is on every sortable header in every sort, shown only on the sorted one', () => {
    const { rerender } = renderHeader(props())
    SORTABLE_KEYS.forEach((key, k) => {
      rerender(
        <table>
          <ResultsTableHeader {...props({ detailSortKey: key })} />
        </table>,
      )
      SORTABLE.forEach((label, i) => {
        const slots = arrowSlots(header(label))
        const shown = i === k
        expect(slots, `${label} under ${key}`).toHaveLength(1)
        expect(slots[0].className.includes('invisible'), `${label} under ${key}`).toBe(!shown)
        expect(slots[0].getAttribute('aria-hidden'), `${label} under ${key}`).toBe(shown ? null : 'true')
      })
    })
  })

  it('keeps the hidden glyph out of every header name', () => {
    renderHeader(props({ detailSortKey: 'name' }))
    expect(screen.getByRole('columnheader', { name: '#' })).toBe(rankHeader())
    expect(screen.getByRole('columnheader', { name: /^Elevation \(ft\)$/ })).toBe(header(/^Elevation/))
  })
})

// The # header is a sort of its own (#698), wired like every column header but
// outside the drag and the resize.
describe('sorting by the # header', () => {
  it('sorts by rank ascending on a click, though the ranked column already holds the order', async () => {
    const onDetailSort = vi.fn()
    const { user } = renderHeader(props({ detailSortKey: SORT_BY, onDetailSort }))
    await user.click(rankHeader())
    expect(onDetailSort).toHaveBeenLastCalledWith(RANK_KEY, 'asc')
  })

  it('flips the direction once it is the sorted header', async () => {
    const onDetailSort = vi.fn()
    const { user } = renderHeader(props({ detailSortKey: RANK_KEY, onDetailSort }))
    await user.click(rankHeader())
    expect(onDetailSort).toHaveBeenLastCalledWith(RANK_KEY, 'desc')
  })

  it('sorts on Enter and on Space, once for a held key', () => {
    const onDetailSort = vi.fn()
    renderHeader(props({ onDetailSort }))
    fireEvent.keyDown(rankHeader(), { key: 'Enter' })
    fireEvent.keyDown(rankHeader(), { key: 'Enter', repeat: true })
    expect(onDetailSort).toHaveBeenCalledTimes(1)
    expect(onDetailSort).toHaveBeenLastCalledWith(RANK_KEY, 'asc')
    // fireEvent answers false when a handler prevented the default.
    expect(fireEvent.keyDown(rankHeader(), { key: ' ' })).toBe(false)
    fireEvent.keyDown(rankHeader(), { key: ' ', repeat: true })
    expect(onDetailSort).toHaveBeenCalledTimes(2)
  })

  it('shows the arrow and aria-sort only while it is the sorted header', () => {
    const { rerender } = renderHeader(props({ detailSortKey: SORT_BY }))
    expect(screen.getByRole('columnheader', { name: '#' })).toBe(rankHeader())
    expect(arrowSlots(rankHeader())[0].className).toContain('invisible')
    expect(rankHeader().getAttribute('aria-sort')).toBe('none')
    expect(arrowSlots(header(/^Precip/))[0].className).not.toContain('invisible')
    rerender(
      <table>
        <ResultsTableHeader {...props({ detailSortKey: RANK_KEY, detailSortDir: 'desc' })} />
      </table>,
    )
    expect(rankHeader().textContent).toBe('#↓')
    expect(arrowSlots(rankHeader())[0].className).not.toContain('invisible')
    expect(rankHeader().getAttribute('aria-sort')).toBe('descending')
    expect(arrowSlots(header(/^Precip/))[0].className).toContain('invisible')
  })

  it('is neither a drag source nor a column to resize', () => {
    renderHeader(props({ onColumnMove: vi.fn(), onColumnWidthsChange: vi.fn(), columnWidths: {} }))
    expect(rankHeader().hasAttribute('data-col')).toBe(false)
    expect(rankHeader().querySelector('.cursor-col-resize')).toBeNull()
    expect(rankHeader().className).not.toContain('touch-none')
  })

  it('leaves a drag across it to move the column it lands on', () => {
    const onColumnMove = vi.fn()
    const onDetailSort = vi.fn()
    renderHeader(props({ onColumnMove, onDetailSort }))
    placeAt(rankHeader(), { left: 0, top: 0, width: 30, height: 24 })
    COLUMNS.forEach((col, i) => {
      placeAt(document.querySelector(`th[data-col="${col.key as string}"]`)!, { left: 30 + i * 100, top: 0, width: 100, height: 24 })
    })
    // From Precipitation, across Elevation and Name, and released over the #
    // header, which is no place to land: the column takes the nearest one.
    const from = header(/^Precip/)
    fireEvent.pointerDown(from, { clientX: 280, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerMove(document, { clientX: 10, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerUp(document)
    fireEvent.click(from)
    expect(onColumnMove).toHaveBeenCalledWith('precip_total_in', 'name')
    expect(onDetailSort).not.toHaveBeenCalled()
  })
})

describe('sorting from the keyboard', () => {
  it('reaches every sortable header with Tab, in the order the table draws them', async () => {
    const { user } = renderHeader(props())
    for (const label of [/^#/, /^Name/, /^Elevation/, /^Precip/]) {
      await user.tab()
      expect(document.activeElement).toBe(header(label))
    }
  })

  it('sorts on Enter and flips on Space, as a click would', async () => {
    const onDetailSort = vi.fn()
    const { user } = renderHeader(props({ onDetailSort }))
    await user.tab()
    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onDetailSort).toHaveBeenLastCalledWith('elevation_ft', 'asc')
    await user.tab({ shift: true })
    await user.keyboard(' ')
    expect(onDetailSort).toHaveBeenLastCalledWith('name', 'desc')
    expect(onDetailSort).toHaveBeenCalledTimes(2)
  })

  it('keeps Space from scrolling the sheet', () => {
    renderHeader(props())
    // fireEvent answers false when a handler prevented the default.
    expect(fireEvent.keyDown(header(/^Name/), { key: ' ' })).toBe(false)
  })

  it('sorts once for a held key and ignores every other key', () => {
    const onDetailSort = vi.fn()
    renderHeader(props({ onDetailSort }))
    fireEvent.keyDown(header(/^Name/), { key: 'Enter' })
    fireEvent.keyDown(header(/^Name/), { key: 'Enter', repeat: true })
    fireEvent.keyDown(header(/^Name/), { key: 'a' })
    fireEvent.keyDown(header(/^Name/), { key: 'ArrowRight' })
    expect(onDetailSort).toHaveBeenCalledTimes(1)
  })

  it('never starts a column move', () => {
    const onColumnMove = vi.fn()
    const onDetailSort = vi.fn()
    renderHeader(props({ onColumnMove, onDetailSort }))
    COLUMNS.forEach((col, i) => {
      placeAt(document.querySelector(`th[data-col="${col.key as string}"]`)!, { left: i * 100, top: 0, width: 100, height: 24 })
    })
    fireEvent.keyDown(header(/^Name/), { key: 'Enter' })
    // A pointer that then travels and lifts, with no press on a header, must
    // find no gesture to continue.
    fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerUp(document)
    expect(onColumnMove).not.toHaveBeenCalled()
    expect(onDetailSort).toHaveBeenCalledTimes(1)
  })

  it('sorts even while the tail of a drag is still being swallowed', () => {
    const onDetailSort = vi.fn()
    renderHeader(props({ onColumnMove: vi.fn(), onDetailSort }))
    COLUMNS.forEach((col, i) => {
      placeAt(document.querySelector(`th[data-col="${col.key as string}"]`)!, { left: i * 100, top: 0, width: 100, height: 24 })
    })
    fireEvent.pointerDown(header(/^Name/), { clientX: 50, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerUp(document)
    // The click guard is still set here; a key is not a click and passes it.
    fireEvent.keyDown(header(/^Elevation/), { key: 'Enter' })
    expect(onDetailSort).toHaveBeenCalledWith('elevation_ft', 'asc')
  })

  it('describes every sortable header with the one key hint', () => {
    renderHeader(props())
    // The description a reader hears is the text of the element named.
    const description = (el: Element) =>
      (el.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .join(' ')
    for (const label of [/^#/, /^Name/, /^Elevation/, /^Precip/]) {
      expect(description(header(label))).toBe('Press Enter or Space to sort.')
    }
    // One copy of the sentence, however many headers point at it.
    expect(screen.getAllByText('Press Enter or Space to sort.', { ignore: false })).toHaveLength(1)
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

describe('a drag that ends away from its header', () => {
  it('lets the next real click sort', async () => {
    const onDetailSort = vi.fn()
    renderHeader(props({ onColumnMove: vi.fn(), onDetailSort }))
    COLUMNS.forEach((col, i) => {
      placeAt(document.querySelector(`th[data-col="${col.key as string}"]`)!, { left: i * 100, top: 0, width: 100, height: 24 })
    })
    fireEvent.pointerDown(header(/^Name/), { clientX: 50, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'mouse' })
    // Released over another header: a browser fires no click for it.
    fireEvent.pointerUp(document)
    await new Promise((r) => setTimeout(r, 0))
    fireEvent.click(header(/^Elevation/))
    expect(onDetailSort).toHaveBeenCalledWith('elevation_ft', 'asc')
  })
})

describe('the resize handle', () => {
  it('neither sorts nor starts a column move', () => {
    const onDetailSort = vi.fn()
    const onColumnMove = vi.fn()
    const onColumnWidthsChange = vi.fn()
    renderHeader(props({ onDetailSort, onColumnMove, onColumnWidthsChange, columnWidths: { name: 100 } }))
    const grip = header(/^Name/).querySelector('[aria-hidden="true"]')!
    fireEvent.pointerDown(grip, { clientX: 100, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerMove(document, { clientX: 300, clientY: 12, pointerType: 'mouse' })
    fireEvent.pointerUp(document)
    fireEvent.click(grip)
    expect(onColumnWidthsChange).toHaveBeenCalled()
    expect(onColumnMove).not.toHaveBeenCalled()
    expect(onDetailSort).not.toHaveBeenCalled()
  })

  it('fits the column on a double-click, without sorting', () => {
    const onDetailSort = vi.fn()
    const onColumnWidthsChange = vi.fn()
    const tableRef = { current: null as HTMLTableElement | null }
    const { container } = renderHeader(props({ onDetailSort, onColumnWidthsChange, columnWidths: {}, tableRef }))
    tableRef.current = container.querySelector('table')
    const grip = header(/^Name/).querySelector('[aria-hidden="true"]')!
    fireEvent.doubleClick(grip)
    expect(onColumnWidthsChange).toHaveBeenCalledWith({ name: expect.any(Number) })
    expect(onDetailSort).not.toHaveBeenCalled()
  })
})

describe('the chart-all box', () => {
  const ROWS = [resultRow({ name: 'A' }), resultRow({ name: 'B', latitude: 47 })]

  it('reads some as a dash and selects every row', async () => {
    const onChartRange = vi.fn()
    const { user } = renderHeader(props({ showChartCol: true, chartableRows: ROWS, headState: 'some', onChartRange }))
    const box = screen.getByRole('checkbox', { name: 'Chart all destinations' }) as HTMLInputElement
    expect(box.indeterminate).toBe(true)
    await user.click(box)
    expect(onChartRange).toHaveBeenCalledWith(ROWS, true)
  })

  it('clears every row when all are charted', async () => {
    const onChartRange = vi.fn()
    const { user } = renderHeader(props({ showChartCol: true, chartableRows: ROWS, headState: 'all', onChartRange }))
    await user.click(screen.getByRole('checkbox', { name: 'Chart all destinations' }))
    expect(onChartRange).toHaveBeenCalledWith(ROWS, false)
  })

  it('is absent while there is nothing to chart', () => {
    renderHeader(props({ showChartCol: true, onChartRange: vi.fn() }))
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
