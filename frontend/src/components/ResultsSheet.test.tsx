import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import ResultsSheet, { ResultsExpand } from './ResultsSheet'
import { render } from '../testSupport/render'
import { DEFAULT_FAMILY_KEY, resultsHeading } from '../metrics'
import { LAYOUT_HOLD } from '../styles'

// The panels and the bar have suites of their own. What this one is about is
// what the sheet hands them, so both are replaced by stand-ins that keep what
// they were given.
// The panels' stand-in draws a table of the rows `seen.tableKeys` names, in
// that order, as the table marks them.
const seen = vi.hoisted(() => ({ panels: [] as Record<string, unknown>[], tableKeys: [] as string[] }))
vi.mock('./ResultsPanels', () => ({
  default: (props: Record<string, unknown>) => {
    seen.panels.push(props)
    return (
      <div data-testid="panels">
        <table data-results-table>
          <tbody>
            {seen.tableKeys.map((key) => (
              <tr key={key} data-key={key}>
                <td>
                  <button data-row-name="">{`Center map on ${key}`}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  },
}))
vi.mock('./ResultsBar', () => ({
  default: (props: {
    onToggleColumns: () => void
    columnsButtonRef: React.RefObject<HTMLButtonElement | null>
    onToggleRemoved: () => void
    removedButtonRef: React.RefObject<HTMLButtonElement | null>
  }) => (
    <>
      <button data-testid="bar" ref={props.columnsButtonRef} onClick={props.onToggleColumns}>
        Columns
      </button>
      <button ref={props.removedButtonRef} onClick={props.onToggleRemoved}>
        Removed
      </button>
    </>
  ),
}))
vi.mock('./ColumnsPicker', () => ({
  default: (props: { open: boolean; sheet?: boolean }) => (
    <div data-testid="columns" data-sheet={String(props.sheet)}>
      {props.open ? 'open' : 'closed'}
    </div>
  ),
}))
vi.mock('./ModelsPicker', () => ({ default: (props: { sheet?: boolean }) => <div data-testid="models" data-sheet={String(props.sheet)} /> }))
vi.mock('./RemovedPicker', () => ({
  default: (props: {
    sheet?: boolean
    open: boolean
    entries: [string, unknown][]
    onRestore: (key: string) => void
    onRestoreAll: () => void
  }) => (
    <div data-testid="removed" data-sheet={String(props.sheet)} data-open={String(props.open)}>
      {props.entries.map(([key]) => (
        <button key={key} onClick={() => props.onRestore(key)}>{`Restore ${key}`}</button>
      ))}
      {props.entries.length > 0 && <button onClick={props.onRestoreAll}>Restore all</button>}
    </div>
  ),
}))

type Props = ComponentProps<typeof ResultsSheet>
const NOOP = () => {}
const LAYOUT = { sheetRef: { current: null }, resultsCollapsed: false, toggleCollapsed: NOOP }
const CHARTS = {
  selectedModelRows: [],
  hiddenModels: new Set(),
  toggleHiddenModel: NOOP,
  showAllModels: NOOP,
  compareWait: null,
  compareNotes: [],
}
const TABLE_VIEW = {
  allColumns: [],
  pickerVisibleKeys: [],
  columnsAtDefault: true,
  resetColumns: NOOP,
  handleVisibilityChange: NOOP,
  handleColumnMove: NOOP,
  handleAggregateMove: NOOP,
}
const REPORT = { results: [], windowTitle: null, pending: [], rowCount: 0 }
const REMOVALS = { removed: new Map(), removeResult: NOOP, restoreRemoved: NOOP, restoreAllRemoved: NOOP }
const onRemovePending = () => {}
const onFocusResult = () => {}
const onFocusPending = () => {}

function props(
  over: {
    showTable?: boolean
    resultsCollapsed?: boolean
    analysisSeq?: number
    rowCount?: string
    sortDesc?: boolean
    removed?: number
    isDesktop?: boolean
    layoutMotion?: 'opening' | 'closing' | 'panes' | null
  } = {},
): Props {
  return {
    resultsView: {
      showTable: over.showTable ?? true,
      layout: { ...LAYOUT, resultsCollapsed: over.resultsCollapsed ?? false },
      charts: CHARTS,
      tableView: TABLE_VIEW,
      onRemovePending,
      onFocusResult,
      onFocusPending,
    },
    showResults: true,
    isDesktop: over.isDesktop ?? true,
    sortDesc: over.sortDesc ?? false,
    report: over.rowCount === undefined ? REPORT : { ...REPORT, rowCount: over.rowCount },
    analysisSeq: over.analysisSeq ?? 0,
    removals: { ...REMOVALS, removed: new Map(Array.from({ length: over.removed ?? 0 }, (_, i) => [`r${i}`, {}])) },
    sortBy: DEFAULT_FAMILY_KEY.temp,
    pointSample: false,
    forecastTimes: [],
    playbackIndex: null,
    timelineAxes: [],
    movePlayheadTo: NOOP,
    fire: { status: 'ready', warnings: new Map(), uncovered: new Set() },
    closure: { status: 'ready', warnings: new Map(), uncovered: new Set() },
    modelId: 'gfs_seamless',
    layoutMotion: over.layoutMotion ?? null,
  } as unknown as Props
}

describe('ResultsSheet', () => {
  it('draws nothing but the closed popovers while the table is not shown', () => {
    render(<ResultsSheet {...props({ showTable: false })} />)
    expect(screen.queryByTestId('bar')).toBeNull()
    expect(screen.queryByTestId('panels')).toBeNull()
    expect(screen.getByTestId('columns').textContent).toBe('closed')
  })

  // A phone's three bar menus are bottom sheets (#696; record 0136); a desk's
  // stand under their own buttons (record 0201).
  it('hands the bar\'s three menus a sheet on a phone only', () => {
    const sheets = () => ['columns', 'models', 'removed'].map((id) => screen.getByTestId(id).dataset.sheet)
    const { rerender } = render(<ResultsSheet {...props({ removed: 1 })} />)
    expect(sheets()).toEqual(['false', 'false', 'false'])
    rerender(<ResultsSheet {...props({ removed: 1, isDesktop: false })} />)
    expect(sheets()).toEqual(['true', 'true', 'true'])
  })

  // A desk's column goes with the chevron, bar and all, and the round button
  // on the map's edge brings it back (record 0312); a phone's
  // sheet keeps its bar and drops the panels.
  it('takes a desk\'s column away on the chevron, and folds a phone\'s sheet to its bar', () => {
    const { rerender } = render(<ResultsSheet {...props({ resultsCollapsed: true })} />)
    expect(screen.queryByTestId('bar')).toBeNull()
    expect(screen.queryByTestId('panels')).toBeNull()
    rerender(<ResultsSheet {...props({ resultsCollapsed: true, isDesktop: false })} />)
    expect(screen.getByTestId('bar')).toBeTruthy()
    expect(screen.queryByTestId('panels')).toBeNull()
  })

  // The column holds the compact table, and widened over the map it holds
  // every pane, as a phone's sheet does (record 0321).
  it('draws a desk\'s compact column, and every pane once it is widened', () => {
    seen.panels.length = 0
    const { rerender } = render(<ResultsSheet {...props()} />)
    expect(seen.panels[seen.panels.length - 1].part).toBe('column')
    rerender(<ResultsSheet {...props()} wide />)
    expect(seen.panels[seen.panels.length - 1].part).toBe('wide')
  })

  it('draws every pane in a phone\'s sheet', () => {
    seen.panels.length = 0
    render(<ResultsSheet {...props({ isDesktop: false })} />)
    expect(seen.panels.map((p) => p.part)).toEqual(seen.panels.map(() => 'all'))
  })

  // The button on the map's edge stands only while a desk's column is away,
  // and brings it back under the bar chevron's own name.
  it('brings a desk\'s collapsed column back from the map\'s edge', () => {
    const toggleCollapsed = vi.fn()
    const { rerender } = render(<ResultsExpand isDesktop layout={{ resultsCollapsed: false, toggleCollapsed }} />)
    expect(screen.queryByRole('button', { name: 'Expand results' })).toBeNull()
    rerender(<ResultsExpand isDesktop={false} layout={{ resultsCollapsed: true, toggleCollapsed }} />)
    expect(screen.queryByRole('button', { name: 'Expand results' })).toBeNull()
    rerender(<ResultsExpand isDesktop layout={{ resultsCollapsed: true, toggleCollapsed }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand results' }))
    expect(toggleCollapsed).toHaveBeenCalledTimes(1)
  })

  // A desk's column takes its width from a drag on its left edge, held
  // between its own floor and the map's, and a double press gives the
  // class's width back (record 0312). A phone's sheet has no such edge.
  it('widens a desk\'s column by its left edge and puts it back on a double press', () => {
    vi.stubGlobal('innerWidth', 1400)
    render(<ResultsSheet {...props()} />)
    const column = document.querySelector('[data-tour="results"]') as HTMLElement
    column.getBoundingClientRect = () => ({ width: 450 }) as DOMRect
    const grip = screen.getByRole('separator', { name: 'Resize results' })
    fireEvent.pointerDown(grip, { clientX: 900, clientY: 300, pointerType: 'mouse' })
    fireEvent.pointerMove(document, { clientX: 850, clientY: 300, pointerType: 'mouse' })
    expect(column.style.width).toBe('500px')
    fireEvent.pointerMove(document, { clientX: 1000, clientY: 300, pointerType: 'mouse' })
    expect(column.style.width).toBe('416px')
    fireEvent.pointerUp(document, { clientX: 1000, clientY: 300, pointerType: 'mouse' })
    fireEvent.pointerDown(grip, { clientX: 1000, clientY: 300, pointerType: 'mouse' })
    expect(column.style.width).toBe('')
    vi.unstubAllGlobals()
  })

  it('draws no width grip on a phone', () => {
    render(<ResultsSheet {...props({ isDesktop: false })} />)
    expect(screen.queryByRole('separator', { name: 'Resize results' })).toBeNull()
  })

  // The sheet takes the results view as one object and hands its members on
  // as they are: the table and the chart under the panels are memoized.
  // The desk's results stand on a layer of their own while the panel moves
  // (record 0216), and only then.
  it('gives a desk\'s results a layer of their own while the panel moves', () => {
    const results = () => document.querySelector('[data-tour="results"]') as HTMLElement
    const { rerender } = render(<ResultsSheet {...props()} />)
    expect(results().className).not.toContain(LAYOUT_HOLD.layer)
    rerender(<ResultsSheet {...props({ layoutMotion: 'closing' })} />)
    expect(results().className).toContain(LAYOUT_HOLD.layer)
    rerender(<ResultsSheet {...props({ layoutMotion: 'opening' })} />)
    expect(results().className).toContain(LAYOUT_HOLD.layer)
    rerender(<ResultsSheet {...props({ layoutMotion: 'panes' })} />)
    expect(results().className).not.toContain(LAYOUT_HOLD.layer)
  })

  it('hands the panels each member of the results view by identity', () => {
    seen.panels.length = 0
    const given = props()
    render(<ResultsSheet {...given} />)
    const got = seen.panels[seen.panels.length - 1]
    expect(got.layout).toBe(given.resultsView.layout)
    expect(got.charts).toBe(given.resultsView.charts)
    expect(got.tableView).toBe(given.resultsView.tableView)
    expect(got.onRemovePending).toBe(onRemovePending)
    expect(got.onFocusResult).toBe(onFocusResult)
    expect(got.onFocusPending).toBe(onFocusPending)
    expect(got.removeResult).toBe(REMOVALS.removeResult)
  })

  // A committed report says the bar's own title to a screen reader, once: a
  // live knob that retitles the bar afterwards announces nothing (#576).
  it('announces the bar title when a report commits, and not on a live change', () => {
    const { rerender } = render(<ResultsSheet {...props()} />)
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('')
    rerender(<ResultsSheet {...props({ analysisSeq: 1, rowCount: '5 of 5' })} />)
    const said = resultsHeading(DEFAULT_FAMILY_KEY.temp, false, false, '5 of 5', 0)
    expect(region.textContent).toBe(said)
    rerender(<ResultsSheet {...props({ analysisSeq: 1, rowCount: '5 of 5', sortDesc: true })} />)
    expect(region.textContent).toBe(said)
    rerender(<ResultsSheet {...props({ analysisSeq: 2, rowCount: '4 of 5', sortDesc: true })} />)
    expect(region.textContent).toBe(resultsHeading(DEFAULT_FAMILY_KEY.temp, true, false, '4 of 5', 0))
  })

  // The last restore takes its own button, the menu and Removed (greyed at
  // zero) away under the keyboard, and the row it brought back takes the
  // focus (record 0224, #576). The removals are App's, so each case restores
  // through the menu and then hands the sheet the count that follows.
  describe('the last restore', () => {
    afterEach(() => {
      seen.tableKeys = []
    })

    it('closes the Removed menu', () => {
      const { rerender } = render(<ResultsSheet {...props({ removed: 1 })} />)
      fireEvent.click(screen.getByRole('button', { name: 'Removed' }))
      expect(screen.getByTestId('removed').dataset.open).toBe('true')
      rerender(<ResultsSheet {...props({ removed: 0 })} />)
      expect(screen.getByTestId('removed').dataset.open).toBe('false')
    })

    it('hands the keyboard to the restored row\'s name', () => {
      seen.tableKeys = ['r1', 'r0']
      const { rerender } = render(<ResultsSheet {...props({ removed: 1 })} />)
      const restore = screen.getByRole('button', { name: 'Restore r0' })
      restore.focus()
      fireEvent.click(restore)
      rerender(<ResultsSheet {...props({ removed: 0 })} />)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Center map on r0' }))
    })

    it('hands it to the first restored row in the table after Restore all', () => {
      seen.tableKeys = ['x', 'r1', 'r0']
      const { rerender } = render(<ResultsSheet {...props({ removed: 2 })} />)
      const restoreAll = screen.getByRole('button', { name: 'Restore all' })
      restoreAll.focus()
      fireEvent.click(restoreAll)
      rerender(<ResultsSheet {...props({ removed: 0 })} />)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Center map on r1' }))
    })

    it('hands it to Columns when the table does not show the row', () => {
      seen.tableKeys = ['x']
      const { rerender } = render(<ResultsSheet {...props({ removed: 1 })} />)
      const restore = screen.getByRole('button', { name: 'Restore r0' })
      restore.focus()
      fireEvent.click(restore)
      rerender(<ResultsSheet {...props({ removed: 0 })} />)
      expect(document.activeElement).toBe(screen.getByTestId('bar'))
    })
  })

  it('opens the Columns popover from the bar', () => {
    render(<ResultsSheet {...props()} />)
    fireEvent.click(screen.getByTestId('bar'))
    expect(screen.getByTestId('columns').textContent).toBe('open')
  })
})
