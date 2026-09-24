import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import ResultsSheet from './ResultsSheet'
import { render } from '../testSupport/render'
import { DEFAULT_FAMILY_KEY } from '../metrics'

// The panels and the bar have suites of their own. What this one is about is
// what the sheet hands them, so both are replaced by stand-ins that keep what
// they were given.
const seen = vi.hoisted(() => ({ panels: [] as Record<string, unknown>[] }))
vi.mock('./ResultsPanels', () => ({
  default: (props: Record<string, unknown>) => {
    seen.panels.push(props)
    return <div data-testid="panels" />
  },
}))
vi.mock('./ResultsBar', () => ({
  default: (props: { onToggleColumns: () => void }) => (
    <button data-testid="bar" onClick={props.onToggleColumns}>
      Columns
    </button>
  ),
}))
vi.mock('./ColumnsPicker', () => ({
  default: (props: { open: boolean }) => <div data-testid="columns">{props.open ? 'open' : 'closed'}</div>,
}))
vi.mock('./ModelsPicker', () => ({ default: () => null }))
vi.mock('./RemovedPicker', () => ({ default: () => null }))

type Props = ComponentProps<typeof ResultsSheet>
const NOOP = () => {}
const LAYOUT = { sheetRef: { current: null }, resultsCollapsed: false, toggleCollapsed: NOOP }
const CHARTS = { selectedModelRows: [], hiddenModels: new Set(), toggleHiddenModel: NOOP, compareWait: null }
const TABLE_VIEW = { allColumns: [], pickerVisibleKeys: [], handleVisibilityChange: NOOP, handleColumnMove: NOOP }
const REPORT = { results: [], windowTitle: null, pending: [], rowCount: 0 }
const REMOVALS = { removed: new Map(), removeResult: NOOP, restoreRemoved: NOOP, restoreAllRemoved: NOOP }
const onRemovePending = () => {}
const onFocusResult = () => {}
const onFocusPending = () => {}

function props(over: { showTable?: boolean; resultsCollapsed?: boolean } = {}): Props {
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
    isDesktop: true,
    sortDesc: false,
    report: REPORT,
    removals: REMOVALS,
    sortBy: DEFAULT_FAMILY_KEY.temp,
    pointSample: false,
    forecastTimes: [],
    playbackIndex: null,
    timelineAxes: [],
    movePlayheadTo: NOOP,
    fire: { status: 'ready', warnings: new Map(), uncovered: new Set() },
    modelId: 'gfs_seamless',
  } as unknown as Props
}

describe('ResultsSheet', () => {
  it('draws nothing but the closed popovers while the table is not shown', () => {
    render(<ResultsSheet {...props({ showTable: false })} />)
    expect(screen.queryByTestId('bar')).toBeNull()
    expect(screen.queryByTestId('panels')).toBeNull()
    expect(screen.getByTestId('columns').textContent).toBe('closed')
  })

  it('folds the panels away and keeps the bar', () => {
    render(<ResultsSheet {...props({ resultsCollapsed: true })} />)
    expect(screen.getByTestId('bar')).toBeTruthy()
    expect(screen.queryByTestId('panels')).toBeNull()
  })

  // The sheet takes the results view as one object and hands its members on
  // as they are: the table and the chart under the panels are memoized.
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

  it('opens the Columns popover from the bar', () => {
    render(<ResultsSheet {...props()} />)
    fireEvent.click(screen.getByTestId('bar'))
    expect(screen.getByTestId('columns').textContent).toBe('open')
  })
})
